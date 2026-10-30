import "server-only";
import type { Types } from "mongoose";
import {
  USER,
  type ActivityType,
  type DepartmentId,
  type MissionStatus,
  type ReviewVerdict,
  type TaskLevel,
  type TaskPriority,
} from "./company";
import { connectDB } from "./mongodb";
import { ActivityModel } from "@/models/Activity";
import { MissionModel } from "@/models/Mission";
import { TaskModel } from "@/models/Task";
import { TaskResultModel } from "@/models/TaskResult";
import type { Attachment } from "@/models/schemas/attachment";

// 這個檔案是「資料存取層」：所有讀寫資料表的動作都集中在這裡。
// API 路由和 Agent 都呼叫這些函式，不直接操作 Model。
// 好處：
//   1. 規則只寫一次，例如「交出成果時，任務狀態要改成 submitted，還要寫一筆進度紀錄」
//   2. 之後要改資料表欄位，只需要改這裡
//
// 會員隔離：每筆資料都有 owner（會員 id）。
//   - 給 API 用的讀取函式（listMissions、getMissionDetail）一定要傳入 owner，只查得到自己的資料
//   - 其他函式由 Agent 在處理「已經確認過擁有者」的總目標時呼叫，新資料的 owner 沿用總目標的 owner

type Id = Types.ObjectId | string;

// ── 進度紀錄 ──────────────────────────────────────

// 寫一筆進度紀錄。其他函式在狀態改變時都會順便呼叫它，
// 所以時間軸會自動記下每一步，不用另外處理
export async function logActivity(input: {
  owner: string;
  mission: Id;
  task?: Id | null;
  actor: string;
  type: ActivityType;
  message: string;
  progress?: number;
  meta?: Record<string, unknown>;
}) {
  await connectDB();
  return ActivityModel.create(input);
}

// ── 總目標 ────────────────────────────────────────

// 建立一個新的總目標（你直接送出、或秘書轉交工作時呼叫）
export async function createMission(input: {
  owner: string;
  title: string;
  goal: string;
  attachments?: Attachment[];
  createdBy?: string; // 誰建立的，預設是你（user）；秘書轉交時是 "executive_assistant"
}) {
  await connectDB();
  const { createdBy = USER, ...fields } = input;
  const mission = await MissionModel.create(fields);
  await logActivity({
    owner: mission.owner,
    mission: mission._id,
    actor: createdBy,
    type: "mission_created",
    message: `建立總目標「${mission.title}」`,
  });
  return mission;
}

// 列出某位會員的總目標，最新的在前面。
// .lean() 讓 mongoose 回傳單純的 JavaScript 物件，比完整的 Document 輕量、快很多，
// 只讀不改的時候都用它
export async function listMissions(owner: string, limit = 50) {
  await connectDB();
  return MissionModel.find({ owner })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

// 讀取一個總目標的完整資料：本身、所有任務、所有成果、所有進度紀錄。
// 先確認這個總目標屬於這位會員，不是的話當作找不到（不透露「存在但不是你的」）
export async function getMissionDetail(owner: string, missionId: Id) {
  await connectDB();
  const mission = await MissionModel.findOne({ _id: missionId, owner }).lean();
  if (!mission) return null;

  // 三個查詢互不相關，用 Promise.all 同時發出，比一個一個等快
  const [tasks, results, activities] = await Promise.all([
    TaskModel.find({ mission: missionId, owner }).sort({ level: 1, order: 1 }).lean(),
    TaskResultModel.find({ mission: missionId, owner }).sort({ createdAt: 1 }).lean(),
    ActivityModel.find({ mission: missionId, owner }).sort({ createdAt: 1 }).lean(),
  ]);
  return { mission, tasks, results, activities };
}

// 改變總目標的狀態（例如總經理開始拆解 → planning）
export async function updateMissionStatus(
  missionId: Id,
  status: MissionStatus,
  // 可以順便更新的欄位：規劃說明、驗收報告
  extra: {
    plan?: string;
    finalReport?: { content: string; attachments?: Attachment[] };
    actor?: string;
    message?: string;
  } = {},
) {
  await connectDB();
  const finished = status === "completed" || status === "failed" || status === "cancelled";

  const mission = await MissionModel.findByIdAndUpdate(
    missionId,
    {
      status,
      ...(extra.plan !== undefined && { plan: extra.plan }),
      ...(extra.finalReport && {
        finalReport: { ...extra.finalReport, reviewedAt: new Date() },
      }),
      ...(status === "completed" && { progress: 100 }),
      ...(finished && { completedAt: new Date() }),
    },
    // returnDocument: "after" → 回傳更新「後」的資料（預設是回傳更新前的）
    { returnDocument: "after" },
  );
  if (!mission) throw new Error("找不到這個總目標");

  await logActivity({
    owner: mission.owner,
    mission: missionId,
    actor: extra.actor ?? USER,
    type: "mission_status",
    message: extra.message ?? `總目標狀態變更為 ${status}`,
    progress: mission.progress,
    meta: { status },
  });
  return mission;
}

// 重新計算總目標的整體進度 = 所有「部門任務」進度的平均。
// 員工子任務不直接算進來，部門任務的進度會依員工子任務的完成比例更新
export async function recomputeMissionProgress(missionId: Id) {
  await connectDB();
  const tasks = await TaskModel.find(
    { mission: missionId, level: "department", status: { $ne: "cancelled" } },
    { progress: 1 }, // 只取 progress 欄位，減少資料量
  ).lean();

  const progress = tasks.length
    ? Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length)
    : 0;

  await MissionModel.updateOne({ _id: missionId }, { progress });
  return progress;
}

// ── 執行鎖 ────────────────────────────────────────
// 同一個總目標同時只能有一個流程在處理。
// 鎖有期限：就算程式中途當掉沒有解鎖，時間到了也會自動失效，不會永遠卡住

// 嘗試上鎖。成功回傳 true；別人正在處理則回傳 false
export async function acquireMissionLock(missionId: Id, ms: number): Promise<boolean> {
  await connectDB();
  const now = new Date();
  // 「找到沒上鎖（或鎖已過期）的這筆，並同時上鎖」是一個不可分割的動作，
  // 兩個流程同時搶，只會有一個成功
  const locked = await MissionModel.findOneAndUpdate(
    { _id: missionId, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
    { lockedUntil: new Date(now.getTime() + ms) },
  );
  return locked !== null;
}

// 延長鎖的期限：流程每完成一步就延長一次，處理很久的總目標才不會中途被別人搶走
export async function refreshMissionLock(missionId: Id, ms: number): Promise<void> {
  await connectDB();
  await MissionModel.updateOne({ _id: missionId }, { lockedUntil: new Date(Date.now() + ms) });
}

export async function releaseMissionLock(missionId: Id): Promise<void> {
  await connectDB();
  await MissionModel.updateOne({ _id: missionId }, { lockedUntil: null });
}

// ── 任務 ──────────────────────────────────────────

// 分派一個任務（總經理派給部門，或部門經理派給員工）
export async function createTask(input: {
  owner: string;
  mission: Id;
  parentTask?: Id | null;
  level: TaskLevel;
  department: DepartmentId;
  assignedBy: string;
  assignee: string;
  title: string;
  instructions: string;
  acceptanceCriteria?: string[];
  attachments?: Attachment[];
  dependsOn?: Id[];
  priority?: TaskPriority;
  order?: number;
  maxRevisions?: number;
}) {
  await connectDB();
  const task = await TaskModel.create(input);
  await logActivity({
    owner: input.owner,
    mission: input.mission,
    task: task._id,
    actor: input.assignedBy,
    type: "task_created",
    message: `${input.assignedBy} 將「${task.title}」分派給 ${input.assignee}`,
    meta: { level: input.level, department: input.department },
  });
  return task;
}

// 執行者回報進度（例如「已完成資料蒐集，60%」）
export async function updateTaskProgress(
  taskId: Id,
  input: { progress: number; message: string; actor: string },
) {
  await connectDB();
  const task = await TaskModel.findById(taskId);
  if (!task) throw new Error("找不到這個任務");

  // 第一次回報進度時，順便把狀態改成「執行中」並記錄開始時間
  if (task.status === "pending" || task.status === "revision") {
    task.status = "in_progress";
    task.startedAt ??= new Date();
  }
  task.progress = Math.min(100, Math.max(0, input.progress));
  await task.save();

  await logActivity({
    owner: task.owner,
    mission: task.mission,
    task: task._id,
    actor: input.actor,
    type: "task_progress",
    message: input.message,
    progress: task.progress,
  });

  if (task.level === "department") await recomputeMissionProgress(task.mission);
  return task;
}

// 交出成果：新增一筆 TaskResult，任務狀態變成「等待審閱」
export async function submitTaskResult(
  taskId: Id,
  input: {
    submittedBy: string;
    content: string;
    attachments?: Attachment[];
    usage?: { model?: string; inputTokens?: number; outputTokens?: number };
  },
) {
  await connectDB();
  const task = await TaskModel.findById(taskId);
  if (!task) throw new Error("找不到這個任務");

  // 第幾次交 = 之前已經交過幾次 + 1
  const attempt = (await TaskResultModel.countDocuments({ task: task._id })) + 1;

  const result = await TaskResultModel.create({
    ...input,
    owner: task.owner,
    task: task._id,
    mission: task.mission,
    attempt,
  });

  task.status = "submitted";
  task.latestResult = result._id;
  task.startedAt ??= new Date();
  await task.save();

  await logActivity({
    owner: task.owner,
    mission: task.mission,
    task: task._id,
    actor: input.submittedBy,
    type: "task_submitted",
    message: `交出「${task.title}」的成果（第 ${attempt} 版）`,
    meta: { resultId: result._id, attempt },
  });
  return result;
}

// 審閱成果（部門經理審員工、總經理審部門）。
// 依審閱結論更新任務：
//   approved → 任務通過，進度 100%
//   revision → 退回修改；退回次數超過上限就改判 failed
//   rejected → 直接判定失敗
export async function reviewTaskResult(
  resultId: Id,
  input: { reviewer: string; verdict: ReviewVerdict; comments: string; issues?: string[] },
) {
  await connectDB();
  const result = await TaskResultModel.findById(resultId);
  if (!result) throw new Error("找不到這份成果");
  const task = await TaskModel.findById(result.task);
  if (!task) throw new Error("找不到這份成果所屬的任務");

  result.review = { ...input, reviewedAt: new Date() };
  await result.save();

  let verdict = input.verdict;
  if (verdict === "revision" && task.revisionCount >= task.maxRevisions) {
    verdict = "rejected"; // 退回次數用完，視為失敗，避免無限重做
  }

  if (verdict === "approved") {
    task.status = "approved";
    task.progress = 100;
    task.completedAt = new Date();
  } else if (verdict === "revision") {
    task.status = "revision";
    task.revisionCount += 1;
  } else {
    task.status = "failed";
    task.completedAt = new Date();
  }
  await task.save();

  const verdictLabel = { approved: "通過", revision: "退回修改", rejected: "不通過" }[verdict];
  await logActivity({
    owner: task.owner,
    mission: task.mission,
    task: task._id,
    actor: input.reviewer,
    type: "task_reviewed",
    message: `審閱「${task.title}」：${verdictLabel}`,
    progress: task.progress,
    meta: { resultId: result._id, verdict, requested: input.verdict },
  });

  if (task.level === "department") await recomputeMissionProgress(task.mission);

  // 需要老闆決定的狀況：判定失敗 → 擋住流程等你決定；員工成果有待取得資料 → 問你要不要補
  // （動態載入，避免 decisions.ts 和這個檔案互相引用）
  const { raiseMissingData, raiseTaskFailed } = await import("./decisions");
  if (task.status === "failed") await raiseTaskFailed(task, input.verdict === "rejected", input.comments);
  else if (task.status === "approved" && task.level === "staff" && result.content.includes("待取得資料")) await raiseMissingData(task, result.content);

  return { result, task, verdict };
}
