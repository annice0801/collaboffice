import "server-only";
import { z } from "zod";
import { askStructured, askText, MODELS } from "@/lib/ai/claude";
import { getDepartment, managerOf, staffAgentId } from "@/lib/company";
import { connectDB } from "@/lib/mongodb";
import {
  createTask,
  logActivity,
  reviewTaskResult,
  submitTaskResult,
  updateTaskProgress,
} from "@/lib/office";
import { MissionModel } from "@/models/Mission";
import { TaskModel } from "@/models/Task";
import { requireDepartments } from "@/lib/organization";
import { departmentManagerPrompt } from "./prompts";
import {
  dependencyReferences,
  formatCriteria,
  lastChanceNote,
  latestResultOf,
  reviewSchema,
  revisionContext,
} from "./shared";

// 部門經理 Agent，負責四件事：
//   1. assignStaff：把總經理的任務拆成員工子任務（分派）
//   2. reviewStaffResult：審閱員工交出的成果（審閱、查錯、把關）
//   3. compileReport：員工都完成後，彙整成部門報告交給總經理（回報）
//      總經理退回時，也是用這個函式依意見修改報告
// 什麼時候做哪一件，由 engine.ts 決定

// 取得任務和它所屬的總目標，順便把部門設定一起準備好
async function loadContext(taskId: string) {
  await connectDB();
  const task = await TaskModel.findById(taskId).lean();
  if (!task) throw new Error("找不到這個任務");
  const mission = await MissionModel.findById(task.mission).lean();
  if (!mission) throw new Error("找不到這個總目標");
  const departmentId = task.department;
  const dept = getDepartment(await requireDepartments(task.owner), departmentId);
  if (!dept) throw new Error(`找不到部門 ${departmentId}（可能已經從組織中刪除）`);
  return {
    task,
    mission,
    departmentId,
    dept,
    manager: managerOf(departmentId),
    system: departmentManagerPrompt(dept),
  };
}

// 「總經理交代的任務」這段文字，經理的每項工作都會用到
function describeAssignment(
  mission: { title: string; goal: string },
  task: { title: string; instructions: string; acceptanceCriteria: string[] },
): string {
  return `總目標：${mission.title}
${mission.goal}

總經理交給本部門的任務：${task.title}
${task.instructions}

總經理的驗收標準：
${formatCriteria(task.acceptanceCriteria)}`;
}

// ── 1. 分派 ───────────────────────────────────────

export async function assignStaff(taskId: string): Promise<void> {
  const { task, mission, departmentId, dept, manager, system } = await loadContext(taskId);

  // 員工代號只能從本部門的員工裡選，避免 AI 派給不存在的人
  const staffIds = dept.staff.map((s) => s.id) as [string, ...string[]];
  const assignSchema = z.object({
    note: z.string().describe("一兩句話說明分工安排"),
    subtasks: z.array(
      z.object({
        staff: z.enum(staffIds),
        title: z.string(),
        instructions: z.string(),
        acceptanceCriteria: z.array(z.string()),
        dependsOn: z.array(z.number().int()),
      }),
    ),
  });

  const { data, usage } = await askStructured({
    model: MODELS.manager,
    system,
    user: `這次的工作：【分派】\n\n${describeAssignment(mission, task)}`,
    schema: assignSchema,
    effort: "medium",
  });

  const subtaskIds: string[] = [];
  for (const [index, sub] of data.subtasks.entries()) {
    const created = await createTask({
      owner: task.owner,
      mission: task.mission,
      parentTask: task._id,
      level: "staff",
      department: departmentId,
      assignedBy: manager,
      assignee: staffAgentId(departmentId, sub.staff),
      title: sub.title,
      instructions: sub.instructions,
      acceptanceCriteria: sub.acceptanceCriteria,
      order: index,
      dependsOn: sub.dependsOn.filter((i) => i >= 0 && i < index).map((i) => subtaskIds[i]),
    });
    subtaskIds.push(created._id.toString());
  }

  // 部門任務改成「執行中」，並記下經理的分工說明
  await updateTaskProgress(task._id, {
    progress: 5,
    actor: manager,
    message: `${dept.name}經理分派了 ${subtaskIds.length} 個子任務：${data.note}`,
  });
  await logActivity({
    owner: task.owner,
    mission: task.mission,
    task: task._id,
    actor: manager,
    type: "note",
    message: "分派的 AI 用量",
    meta: usage,
  });
}

// ── 2. 審閱員工成果 ───────────────────────────────

export async function reviewStaffResult(subtaskId: string): Promise<void> {
  await connectDB();
  const subtask = await TaskModel.findById(subtaskId).lean();
  if (!subtask?.parentTask) throw new Error("找不到這個員工子任務");
  const { task, mission, dept, manager, system } = await loadContext(subtask.parentTask.toString());
  const result = await latestResultOf(subtask);
  if (!result) throw new Error("找不到要審閱的成果");

  const { data, usage } = await askStructured({
    model: MODELS.manager,
    system,
    user: `這次的工作：【審閱員工成果】

${describeAssignment(mission, task)}

交給員工（${subtask.assignee}）的子任務：${subtask.title}
${subtask.instructions}

子任務的驗收標準：
${formatCriteria(subtask.acceptanceCriteria)}

員工交出的成果（第 ${result.attempt} 版）：
${result.content}${await dependencyReferences(subtask)}${lastChanceNote(subtask)}`,
    schema: reviewSchema,
    effort: "medium",
  });

  await reviewTaskResult(result._id, {
    reviewer: manager,
    verdict: data.verdict,
    comments: data.comments,
    issues: data.issues,
  });

  // 更新部門任務的進度：依員工子任務完成的比例，最多到 90%（剩下的留給彙整和驗收）
  const subtasks = await TaskModel.find({ parentTask: task._id }, { status: 1 }).lean();
  const done = subtasks.filter((s) => ["approved", "failed", "cancelled"].includes(s.status)).length;
  await updateTaskProgress(task._id, {
    progress: Math.round(5 + (done / subtasks.length) * 85),
    actor: manager,
    message: `${dept.name}進度：${done}/${subtasks.length} 個子任務已完成`,
  });
  await logActivity({
    owner: task.owner,
    mission: task.mission,
    task: subtask._id,
    actor: manager,
    type: "note",
    message: "審閱的 AI 用量",
    meta: usage,
  });
}

// ── 3. 彙整回報 ───────────────────────────────────

export async function compileReport(taskId: string): Promise<void> {
  const { task, mission, manager, system } = await loadContext(taskId);

  // 整理每個員工子任務的最終成果
  const subtasks = await TaskModel.find({ parentTask: task._id }).sort({ order: 1 }).lean();
  const sections: string[] = [];
  for (const sub of subtasks) {
    const result = await latestResultOf(sub);
    const failed = sub.status === "failed" ? "（⚠ 此子任務未通過審閱）" : "";
    sections.push(`### ${sub.title}（${sub.assignee}）${failed}\n${result?.content ?? "（沒有成果）"}`);
  }

  // 如果總經理退回過，附上上一版報告和總經理的意見
  const feedback = task.status === "revision" ? await revisionContext(task) : "";

  const { text, usage } = await askText({
    model: MODELS.manager,
    system,
    user: `這次的工作：【彙整回報】\n\n${describeAssignment(mission, task)}\n\n## 員工成果\n\n${sections.join("\n\n") || "（本任務沒有分派員工子任務，請直接完成）"}${feedback}`,
    effort: "medium",
  });

  await submitTaskResult(task._id, { submittedBy: manager, content: text, usage });
}
