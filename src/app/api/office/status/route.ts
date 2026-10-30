import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { GENERAL_MANAGER, managerOf, type DepartmentId } from "@/lib/company";
import { connectDB } from "@/lib/mongodb";
import { listSchedules } from "@/lib/company-plan";
import { ActivityModel } from "@/models/Activity";
import { DecisionModel } from "@/models/Decision";
import { MissionModel } from "@/models/Mission";
import { TaskModel } from "@/models/Task";

// 辦公室樓層的即時狀態：GET /api/office/status（需要登入，只看自己的）
// 回傳每位 Agent：
//   lastActiveAt：最後一次有動作的時間（畫面用它判斷「很久沒工作 → 睡覺」）
//   task：手上正在處理的工作（有的話，代表現在在忙）
//   work：桌上「工作膠囊」顯示的內容：階段（執行中、待審閱…）、進度、任務名稱
//         流程暫停的總目標也會顯示（階段是「暫停中」），讓你知道誰手上還有事
//
//   decisions：等你決定的事有幾件（頭上顯示 ❗）
//   reminder：時間到了、還沒開始的預定會議（秘書會走到會議室提醒你，頭上顯示 ⏰）
//   rooms：每個部門的待辦、已完成、規劃完成進度（點辦公區時顯示）
//   missions：最近的交辦事項與進度（會議室白板顯示）
//
// 「誰在忙」的判斷：
//   正在執行中的總目標裡——
//   員工：有待執行、執行中、被退回的子任務
//   部門經理：有員工交件等審閱、部門任務待分派、或被總經理退回要修改報告
//   總經理：總目標拆解中、或有部門報告等驗收

// 任務狀態 → 膠囊上的階段文字（員工、部門經理各一套）
const STAFF_PHASE: Record<string, string> = { pending: "待開始", in_progress: "執行中", revision: "修改中", submitted: "待審閱" };
const MANAGER_PHASE: Record<string, string> = { pending: "分派中", in_progress: "帶隊執行", revision: "修改報告", submitted: "待驗收" };

type Work = { phase: string; progress: number; title: string; mission: string };
type AgentStatus = { lastActiveAt: string | null; task: string | null; work: Work | null; decisions: number };

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  await connectDB();
  const now = new Date();

  // 每位 Agent 最後一次的進度紀錄（用 aggregate 一次算完，不用一個一個查）
  const lastActions = await ActivityModel.aggregate<{ _id: string; last: Date }>([
    { $match: { owner: userId } },
    { $group: { _id: "$actor", last: { $max: "$createdAt" } } },
  ]);

  const agents: Record<string, AgentStatus> = {};
  const get = (id: string) => (agents[id] ??= { lastActiveAt: null, task: null, work: null, decisions: 0 });
  for (const a of lastActions) get(a._id).lastActiveAt = a.last.toISOString();

  // 正在執行中（有上鎖）的總目標
  const running = await MissionModel.find(
    { owner: userId, lockedUntil: { $gt: now } },
    { status: 1, title: 1, progress: 1 },
  ).lean();
  const isRunning = new Set(running.map((m) => m._id.toString()));

  for (const mission of running) {
    if (mission.status === "planning" || mission.status === "pending") {
      get(GENERAL_MANAGER).task = `拆解「${mission.title}」`;
      get(GENERAL_MANAGER).work ??= { phase: "拆解中", progress: mission.progress, title: mission.title, mission: mission.title };
    }
  }

  // 所有還沒做完的任務（包含暫停中的總目標）
  const openTasks = await TaskModel.find(
    { owner: userId, status: { $in: ["pending", "in_progress", "revision", "submitted"] } },
    { level: 1, department: 1, assignee: 1, status: 1, title: 1, progress: 1, mission: 1 },
  )
    .sort({ createdAt: 1 })
    .lean();
  const openMissions = await MissionModel.find({ _id: { $in: openTasks.map((t) => t.mission) } }, { title: 1 }).lean();
  const titleOf = new Map(openMissions.map((m) => [m._id.toString(), m.title]));

  // 每個人桌上的膠囊只顯示一件事：先到先顯示（??=）
  const setWork = (agent: string, phase: string, task: (typeof openTasks)[number], running: boolean) => {
    get(agent).work ??= {
      phase: running ? phase : "暫停中",
      progress: task.progress,
      title: task.title,
      mission: titleOf.get(task.mission.toString()) ?? "",
    };
  };

  for (const task of openTasks) {
    const manager = managerOf(task.department as DepartmentId);
    const active = isRunning.has(task.mission.toString());
    if (task.level === "staff") {
      // 員工：交出去之後換經理忙（審閱），員工自己顯示「待審閱」
      setWork(task.assignee, STAFF_PHASE[task.status] ?? "執行中", task, active);
      if (!active) continue;
      if (task.status === "submitted") get(manager).task ??= `審閱「${task.title}」`;
      else get(task.assignee).task ??= task.title;
    } else {
      setWork(manager, MANAGER_PHASE[task.status] ?? "處理中", task, active);
      if (task.status === "submitted") setWork(GENERAL_MANAGER, "驗收中", task, active);
      if (!active) continue;
      if (task.status === "submitted") get(GENERAL_MANAGER).task ??= `驗收「${task.title}」`;
      else if (task.status === "pending") get(manager).task ??= `分派「${task.title}」`;
      else if (task.status === "revision") get(manager).task ??= `修改報告「${task.title}」`;
    }
  }
  // 經理正在審閱員工成果時，膠囊改成「審閱中」比較準確
  for (const status of Object.values(agents)) {
    if (status.task?.startsWith("審閱") && status.work) status.work = { ...status.work, phase: "審閱中" };
  }

  // ── 各部門的待辦與已完成（以總經理分派的「部門任務」為單位）──
  const missions = await MissionModel.find(
    { owner: userId, status: { $ne: "cancelled" } },
    { title: 1, status: 1, progress: 1, createdAt: 1 },
  )
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();
  const missionTitle = new Map(missions.map((m) => [m._id.toString(), m.title]));
  const departmentTasks = await TaskModel.find(
    { owner: userId, level: "department", mission: { $in: missions.map((m) => m._id) }, status: { $ne: "cancelled" } },
    { department: 1, title: 1, status: 1, progress: 1, mission: 1, completedAt: 1 },
  )
    .sort({ createdAt: -1 })
    .lean();

  type RoomTask = { title: string; mission: string; status: string; progress: number };
  const rooms: Record<string, { todo: RoomTask[]; done: RoomTask[]; progress: number }> = {};
  for (const task of departmentTasks) {
    const room = (rooms[task.department] ??= { todo: [], done: [], progress: 0 });
    const item = { title: task.title, mission: missionTitle.get(task.mission.toString()) ?? "", status: task.status, progress: task.progress };
    if (task.status === "approved" || task.status === "failed") room.done.push(item);
    else room.todo.push(item);
  }
  // 規劃完成進度：所有任務進度的平均（已完成算 100%）
  for (const [dept, room] of Object.entries(rooms)) {
    const all = departmentTasks.filter((t) => t.department === dept);
    room.progress = Math.round(all.reduce((sum, t) => sum + (t.status === "approved" ? 100 : t.progress), 0) / all.length);
    room.done = room.done.slice(0, 10);
  }

  // 總經理沒有更具體的事時，顯示他在督導最新一項進行中的總目標
  const supervising = missions.find((m) => !["completed", "failed", "cancelled"].includes(m.status));
  if (supervising) {
    get(GENERAL_MANAGER).work ??= {
      phase: isRunning.has(supervising._id.toString()) ? "督導中" : "暫停中",
      progress: supervising.progress,
      title: supervising.title,
      mission: supervising.title,
    };
  }

  // 等你決定的事：算在提出的人頭上
  for (const d of await DecisionModel.find({ owner: userId, status: "open" }, { agent: 1 }).lean()) get(d.agent).decisions++;

  // 時間到了的預定會議（2 小時內、還沒開始也沒取消）
  const due = (await listSchedules(userId)).find(
    (s) => s.status === "upcoming" && new Date(s.at).getTime() <= now.getTime() && now.getTime() - new Date(s.at).getTime() < 2 * 60 * 60 * 1000,
  );

  return NextResponse.json({
    reminder: due ?? null,
    now: now.toISOString(),
    agents,
    rooms,
    missions: missions.slice(0, 8).map((m) => ({ title: m.title, status: m.status, progress: m.progress })),
  });
}
