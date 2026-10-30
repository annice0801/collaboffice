import "server-only";
import type { Types } from "mongoose";
import { GENERAL_MANAGER, USER } from "./company";
import { connectDB } from "./mongodb";
import { createMission, logActivity, recomputeMissionProgress } from "./office";
import { DecisionModel } from "@/models/Decision";
import { TaskModel } from "@/models/Task";

// 「待你決定」的建立與處理。
// 建立：審閱判定失敗、成果有待取得資料、流程中斷時，由程式依固定範本產生方案（不用呼叫 AI）。
// 處理：你選了方案後，依方案修改任務狀態，需要的話回傳要接續執行的總目標 id。

type Id = string | Types.ObjectId;
type Option = { id: string; label: string; outcome: string; needsNote?: boolean };

async function raise(input: {
  owner: string;
  mission: Id;
  task?: Id | null;
  agent: string;
  kind: "task_failed" | "missing_data" | "run_error";
  blocking: boolean;
  title: string;
  situation: string;
  options: Option[];
}) {
  await connectDB();
  // 同一件事已經在等你決定，就不重複建立
  const exists = await DecisionModel.exists({ mission: input.mission, task: input.task ?? null, kind: input.kind, status: "open" });
  if (exists) return;
  await DecisionModel.create(input);
  await logActivity({ owner: input.owner, mission: input.mission, task: input.task ?? null, actor: input.agent, type: "note", message: `❗ 需要老闆決定：${input.title}` });
}

// 審閱後判定失敗：擋住流程，等你決定重做、接受或取消
export function raiseTaskFailed(task: { _id: Id; owner: string; mission: Id; assignee: string; title: string; revisionCount: number }, rejected: boolean, comments: string) {
  return raise({
    owner: task.owner,
    mission: task.mission,
    task: task._id,
    agent: task.assignee,
    kind: "task_failed",
    blocking: true,
    title: `「${task.title}」沒有通過審閱`,
    situation: `${rejected ? "審閱者判定不通過" : `已經退回 ${task.revisionCount} 次，仍然沒有達到驗收標準`}。最後的審閱意見：${comments || "（沒有寫）"}`,
    options: [
      { id: "retry", label: "再給一次機會重做", outcome: "依你補充的方向再修改一次，改完再審閱（會再呼叫 AI）。", needsNote: true },
      { id: "accept", label: "接受目前的版本", outcome: "這一版直接算通過，流程繼續往下做。" },
      { id: "cancel", label: "取消這項工作", outcome: "不做這一部分，其他工作照常完成；總結報告會註明。" },
    ],
  });
}

// 成果裡有「待取得資料」：不擋流程，問你要不要提供資料補齊
export function raiseMissingData(task: { _id: Id; owner: string; mission: Id; assignee: string; title: string }, content: string) {
  const lines = content
    .split("\n")
    .filter((l) => l.includes("待取得資料"))
    .slice(0, 3)
    .map((l) => `・${l.replace(/[#*>\s]+/, "").trim().slice(0, 80)}`);
  return raise({
    owner: task.owner,
    mission: task.mission,
    task: task._id,
    agent: task.assignee,
    kind: "missing_data",
    blocking: false,
    title: `「${task.title}」有資料取不到`,
    situation: `成果中有部分資料標註了「⚠ 待取得資料」（這個部門沒有開放上網，或搜尋不到可靠的來源）：\n${lines.join("\n")}`,
    options: [
      { id: "provide", label: "我來提供資料", outcome: "把你提供的資料交給總經理，另外開一項交辦補齊這部分（會再呼叫 AI）。", needsNote: true },
      { id: "later", label: "先這樣，之後再補", outcome: "保留目前的標註，不另外處理。" },
    ],
  });
}

// 流程中斷：問你要重試還是先暫停
export function raiseRunError(owner: string, mission: Id, message: string) {
  return raise({
    owner,
    mission,
    agent: GENERAL_MANAGER,
    kind: "run_error",
    blocking: false,
    title: "工作流程中斷了",
    situation: `執行時發生問題：${message}`,
    options: [
      { id: "retry", label: "重新嘗試", outcome: "從中斷的地方繼續執行（會再呼叫 AI）。" },
      { id: "pause", label: "先暫停", outcome: "先不處理，之後可以在交辦事項按「繼續執行」。" },
    ],
  });
}

// 這個總目標裡，正在等你決定、所以要先停下來的任務
export async function blockedTaskIds(missionId: Id): Promise<Set<string>> {
  const open = await DecisionModel.find({ mission: missionId, status: "open", blocking: true, task: { $ne: null } }, { task: 1 }).lean();
  return new Set(open.map((d) => d.task!.toString()));
}

// 下達決定。回傳需要接續執行的總目標 id（沒有就是 null）
export async function decide(owner: string, decisionId: string, choice: string, note: string): Promise<{ resume: string | null }> {
  await connectDB();
  const decision = await DecisionModel.findOne({ _id: decisionId, owner, status: "open" });
  if (!decision) throw new Error("這件事已經決定過了");
  const option = decision.options.find((o) => o.id === choice);
  if (!option) throw new Error("沒有這個方案");
  if (option.needsNote && choice === "provide" && !note.trim()) throw new Error("請提供資料內容");

  let resume: string | null = null;
  const task = decision.task ? await TaskModel.findById(decision.task) : null;

  if (decision.kind === "task_failed" && task) {
    if (choice === "retry") {
      task.status = "revision";
      task.maxRevisions = task.revisionCount + 1; // 再多一次機會
      task.completedAt = undefined;
      if (note.trim()) task.instructions += `\n\n【老闆補充】${note.trim()}`;
    } else if (choice === "accept") {
      task.status = "approved";
      task.progress = 100;
    } else {
      task.status = "cancelled";
    }
    await task.save();
    if (task.level === "department") await recomputeMissionProgress(task.mission);
    resume = decision.mission.toString();
  } else if (decision.kind === "missing_data" && choice === "provide" && task) {
    const mission = await createMission({
      owner,
      title: `補齊資料：${task.title}`.slice(0, 200),
      goal: `「${task.title}」的成果中有標註「待取得資料」的部分。老闆提供了以下資料，請據此補齊並更新成果：\n\n${note.trim()}`,
      createdBy: USER,
    });
    resume = mission._id.toString();
  } else if (decision.kind === "run_error" && choice === "retry") {
    resume = decision.mission.toString();
  }

  decision.status = "decided";
  decision.choice = choice;
  decision.note = note.trim();
  decision.decidedAt = new Date();
  await decision.save();
  await logActivity({
    owner,
    mission: decision.mission,
    task: decision.task,
    actor: USER,
    type: "note",
    message: `老闆決定：${option.label}${note.trim() ? `（補充：${note.trim().slice(0, 60)}）` : ""}`,
  });
  return { resume };
}
