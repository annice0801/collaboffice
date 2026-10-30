import "server-only";
import { askText, MODELS } from "@/lib/ai/claude";
import { getDepartment } from "@/lib/company";
import { connectDB } from "@/lib/mongodb";
import { submitTaskResult } from "@/lib/office";
import { MissionModel } from "@/models/Mission";
import { TaskModel } from "@/models/Task";
import { requireDepartments } from "@/lib/organization";
import { staffPrompt } from "./prompts";
import { dependencyReferences, formatCriteria, revisionContext } from "./shared";

// 員工 Agent：執行部門經理交代的子任務，交出成果。
// 用比較便宜、快速的 Haiku 模型；品質由部門經理審閱把關。
// 部門開放網路搜尋時，可以上網查最新資料（成果最後會附上資料來源）

export async function executeStaffTask(subtaskId: string): Promise<void> {
  await connectDB();
  const subtask = await TaskModel.findById(subtaskId).lean();
  if (!subtask?.parentTask) throw new Error("找不到這個員工子任務");
  const [parent, mission] = await Promise.all([
    TaskModel.findById(subtask.parentTask).lean(),
    MissionModel.findById(subtask.mission).lean(),
  ]);
  if (!parent || !mission) throw new Error("找不到上層任務或總目標");

  const dept = getDepartment(await requireDepartments(subtask.owner), subtask.department);
  if (!dept) throw new Error(`找不到部門 ${subtask.department}（可能已經從組織中刪除）`);
  // assignee 的格式是「部門.員工代號」，取出員工代號
  const staffId = subtask.assignee.split(".")[1];

  // 這個子任務依賴的其他子任務：把它們的成果附上，當作參考資料
  const references = await dependencyReferences(subtask);

  // 被退回時附上上一版內容和經理的意見
  const feedback = subtask.status === "revision" ? await revisionContext(subtask) : "";

  const { text, usage } = await askText({
    model: MODELS.staff,
    system: staffPrompt(dept, staffId),
    user: `總目標：${mission.title}
${mission.goal}

部門任務（${dept.name}）：${parent.title}

經理交給你的子任務：${subtask.title}
${subtask.instructions}

驗收標準：
${formatCriteria(subtask.acceptanceCriteria)}${references}${feedback}`,
    effort: "medium",
    // 部門有開放網路搜尋：這個子任務最多搜尋 5 次
    ...(dept.webSearch ? { webSearch: { maxUses: 5 } } : {}),
  });

  await submitTaskResult(subtask._id, { submittedBy: subtask.assignee, content: text, usage });
}
