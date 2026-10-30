import "server-only";
import type { Types } from "mongoose";
import { z } from "zod";
import { REVIEW_VERDICTS } from "@/lib/company";
import { TaskModel } from "@/models/Task";
import { TaskResultModel } from "@/models/TaskResult";

// 各 Agent 共用的資料格式與小工具

// 審閱結果的格式：部門經理審員工、總經理審部門都用這個
export const reviewSchema = z.object({
  verdict: z.enum(REVIEW_VERDICTS),
  comments: z.string().describe("一兩句話總結判斷"),
  issues: z.array(z.string()).describe("具體要修改的問題；通過時給空陣列"),
});

// 把驗收標準排成條列文字，放進給 AI 的訊息裡
export function formatCriteria(criteria: string[]): string {
  return criteria.length ? criteria.map((c, i) => `${i + 1}. ${c}`).join("\n") : "（未指定）";
}

// 取得一個任務最新一次交出的成果
export async function latestResultOf(task: { latestResult?: Types.ObjectId | null }) {
  if (!task.latestResult) return null;
  return TaskResultModel.findById(task.latestResult).lean();
}

// 退回重做時，把「上一版內容 + 審閱意見」整理成文字，讓 AI 知道要改什麼
export async function revisionContext(task: {
  latestResult?: Types.ObjectId | null;
}): Promise<string> {
  const previous = await latestResultOf(task);
  if (!previous?.review) return "";
  const issues = (previous.review.issues ?? []).map((i) => `- ${i}`).join("\n");
  return `\n\n## 這是退回重做的任務\n### 上一版內容\n${previous.content}\n\n### 審閱意見\n${previous.review.comments ?? ""}\n${issues}`;
}

// 已經退回到上限時，提醒審閱者這是最後一次機會（再退回就直接判定失敗）
export function lastChanceNote(task: { revisionCount: number; maxRevisions: number }): string {
  return task.revisionCount >= task.maxRevisions
    ? "\n\n⚠ 這是最後一次審閱機會：如果判定 revision，系統會直接判定失敗。"
    : "";
}

// 這個任務依賴的其他任務的成果（員工執行時當參考資料，經理審閱時拿來核對）
export async function dependencyReferences(task: { dependsOn: Types.ObjectId[] }): Promise<string> {
  if (!task.dependsOn.length) return "";
  const dependencies = await TaskModel.find({ _id: { $in: task.dependsOn } }).lean();
  const sections: string[] = [];
  for (const dep of dependencies) {
    const result = await latestResultOf(dep);
    if (result) sections.push(`### ${dep.title}\n${result.content}`);
  }
  return sections.length ? `\n\n## 參考資料（同事已完成的成果）\n\n${sections.join("\n\n")}` : "";
}
