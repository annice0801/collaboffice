import "server-only";
import { z } from "zod";
import { askStructured, askText, MODELS } from "@/lib/ai/claude";
import { departmentName, GENERAL_MANAGER, managerOf } from "@/lib/company";
import { connectDB } from "@/lib/mongodb";
import {
  createTask,
  logActivity,
  reviewTaskResult,
  updateMissionStatus,
} from "@/lib/office";
import { MissionModel } from "@/models/Mission";
import { TaskModel } from "@/models/Task";
import { getExecutivePersona, requireDepartments } from "@/lib/organization";
import { companyContext } from "@/lib/company-plan";
import { generalManagerPrompt } from "./prompts";
import { formatCriteria, lastChanceNote, latestResultOf, reviewSchema } from "./shared";

// 總經理 Agent，負責三件事：
//   1. planMission：接收總目標 → 拆解成部門任務 → 分派給部門經理
//   2. reviewDepartmentResult：驗收部門經理交回的報告
//   3. finalizeMission：所有部門完成後，寫總結報告給你
// 什麼時候做哪一件，由 engine.ts 決定

// ── 1. 拆解任務 ───────────────────────────────────

// 總經理拆解任務時回傳的資料格式。
// department 只能從這位會員的部門代號裡選，所以每次依部門清單產生
function planSchemaFor(departmentIds: string[]) {
  return z.object({
    plan: z.string().describe("給老闆看的整體規劃說明"),
    tasks: z
      .array(
        z.object({
          // z.enum 需要「至少一個元素的陣列」型別，所以這裡轉型
          department: z.enum(departmentIds as [string, ...string[]]),
          title: z.string().describe("任務標題，一句話"),
          instructions: z.string().describe("給部門經理的詳細工作說明"),
          acceptanceCriteria: z.array(z.string()).describe("2 到 5 條可具體判斷的驗收標準"),
          priority: z.enum(["low", "normal", "high"]),
          dependsOn: z.array(z.number().int()).describe("要先完成的任務索引，只能填比自己小的"),
        }),
      )
      .describe("拆解後的部門任務"),
  });
}

export async function planMission(missionId: string): Promise<void> {
  await connectDB();
  const mission = await MissionModel.findById(missionId).lean();
  if (!mission) throw new Error("找不到這個總目標");
  const { owner } = mission;

  await updateMissionStatus(missionId, "planning", {
    actor: GENERAL_MANAGER,
    message: "總經理開始拆解任務",
  });

  try {
    const departments = await requireDepartments(owner);
    const { data, usage } = await askStructured({
      model: MODELS.executive,
      system: generalManagerPrompt(departments, await getExecutivePersona(owner, GENERAL_MANAGER)),
      // 附上公司願景與年度目標：拆解時以公司目標為依歸
      user: `這次的工作：【拆解任務】\n\n總目標：${mission.title}\n\n${mission.goal}\n\n---\n${await companyContext(owner)}`,
      schema: planSchemaFor(departments.map((d) => d.id)),
      effort: "medium",
    });

    // 依序建立任務。dependsOn 原本是「陣列索引」，要換成真正的任務 _id
    const taskIds: string[] = [];
    for (const [index, task] of data.tasks.entries()) {
      const created = await createTask({
        owner,
        mission: missionId,
        level: "department",
        department: task.department,
        assignedBy: GENERAL_MANAGER,
        assignee: managerOf(task.department),
        title: task.title,
        instructions: task.instructions,
        acceptanceCriteria: task.acceptanceCriteria,
        priority: task.priority,
        order: index,
        // 過濾掉不合理的索引（指向自己或後面的任務），避免互相等待卡死
        dependsOn: task.dependsOn.filter((i) => i >= 0 && i < index).map((i) => taskIds[i]),
      });
      taskIds.push(created._id.toString());
    }

    await updateMissionStatus(missionId, "in_progress", {
      actor: GENERAL_MANAGER,
      plan: data.plan,
      message: `總經理完成拆解，分派了 ${taskIds.length} 個任務`,
    });
    await logActivity({
      owner,
      mission: missionId,
      actor: GENERAL_MANAGER,
      type: "note",
      message: "拆解任務的 AI 用量",
      meta: usage,
    });
  } catch (error) {
    // 失敗也要記下來，畫面上才看得到原因，不會一直停在「拆解中」
    const message = error instanceof Error ? error.message : String(error);
    await logActivity({
      owner,
      mission: missionId,
      actor: GENERAL_MANAGER,
      type: "error",
      message: `拆解任務失敗：${message}`,
    });
    await updateMissionStatus(missionId, "failed", {
      actor: GENERAL_MANAGER,
      message: "總經理拆解任務失敗",
    });
  }
}

// ── 2. 驗收部門成果 ───────────────────────────────

export async function reviewDepartmentResult(taskId: string): Promise<void> {
  await connectDB();
  const task = await TaskModel.findById(taskId).lean();
  if (!task) throw new Error("找不到這個任務");
  const mission = await MissionModel.findById(task.mission).lean();
  const result = await latestResultOf(task);
  if (!mission || !result) throw new Error("找不到要驗收的成果");

  const departments = await requireDepartments(task.owner);
  const deptName = departmentName(departments, task.department);
  const { data, usage } = await askStructured({
    model: MODELS.executive,
    system: generalManagerPrompt(departments, await getExecutivePersona(task.owner, GENERAL_MANAGER)),
    user: `這次的工作：【驗收部門成果】

總目標：${mission.title}
${mission.goal}

交給${deptName}的任務：${task.title}
${task.instructions}

驗收標準：
${formatCriteria(task.acceptanceCriteria)}

${deptName}經理交回的報告（第 ${result.attempt} 版）：
${result.content}${lastChanceNote(task)}`,
    schema: reviewSchema,
    effort: "medium",
  });

  await reviewTaskResult(result._id, {
    reviewer: GENERAL_MANAGER,
    verdict: data.verdict,
    comments: data.comments,
    issues: data.issues,
  });
  await logActivity({
    owner: task.owner,
    mission: task.mission,
    task: task._id,
    actor: GENERAL_MANAGER,
    type: "note",
    message: "驗收的 AI 用量",
    meta: usage,
  });
}

// ── 3. 總結報告 ───────────────────────────────────

export async function finalizeMission(missionId: string): Promise<void> {
  await connectDB();
  const mission = await MissionModel.findById(missionId).lean();
  if (!mission) throw new Error("找不到這個總目標");
  const tasks = await TaskModel.find({ mission: missionId, level: "department" })
    .sort({ order: 1 })
    .lean();

  const departments = await requireDepartments(mission.owner);
  // 把每個部門的結果整理成一段文字給總經理
  const sections: string[] = [];
  for (const task of tasks) {
    const result = await latestResultOf(task);
    const status = { approved: "已通過驗收", failed: "失敗", cancelled: "已取消" }[
      task.status as "approved" | "failed" | "cancelled"
    ];
    sections.push(
      `### ${departmentName(departments, task.department)}：${task.title}（${status ?? task.status}）\n${result?.content ?? "（沒有交出成果）"}` +
        (result?.review?.comments ? `\n\n總經理驗收意見：${result.review.comments}` : ""),
    );
  }

  const { text, usage } = await askText({
    model: MODELS.executive,
    system: generalManagerPrompt(departments, await getExecutivePersona(mission.owner, GENERAL_MANAGER)),
    user: `這次的工作：【總結報告】\n\n總目標：${mission.title}\n${mission.goal}\n\n## 各部門結果\n\n${sections.join("\n\n")}`,
    effort: "medium",
  });

  // 只要有任何一個部門通過，就算完成（失敗的部分寫在報告裡）；全部失敗才算失敗
  const anyApproved = tasks.some((t) => t.status === "approved");
  await updateMissionStatus(missionId, anyApproved ? "completed" : "failed", {
    actor: GENERAL_MANAGER,
    finalReport: { content: text },
    message: anyApproved ? "總經理完成驗收，提交總結報告" : "所有部門都未能完成，總目標失敗",
  });
  await logActivity({
    owner: mission.owner,
    mission: missionId,
    actor: GENERAL_MANAGER,
    type: "note",
    message: "總結報告的 AI 用量",
    meta: usage,
  });
}
