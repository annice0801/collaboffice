import "server-only";
import type { Types } from "mongoose";
import { GENERAL_MANAGER } from "@/lib/company";
import { connectDB } from "@/lib/mongodb";
import {
  acquireMissionLock,
  logActivity,
  refreshMissionLock,
  releaseMissionLock,
} from "@/lib/office";
import { blockedTaskIds, raiseRunError } from "@/lib/decisions";
import { MissionModel } from "@/models/Mission";
import { TaskModel } from "@/models/Task";
import { assignStaff, compileReport, reviewStaffResult } from "./department-manager";
import { finalizeMission, planMission, reviewDepartmentResult } from "./general-manager";
import { executeStaffTask } from "./staff";

// 執行引擎：推動一個總目標從頭跑到完成。
//
// 運作方式：每次只做「一步」（一次 AI 呼叫），做完就把結果存進資料庫，
// 下一步再從資料庫的狀態判斷該做什麼。好處：
//   - 中途當機或伺服器重啟，資料都在，呼叫 runMission 就能從斷掉的地方繼續
//   - 每一步都會寫進度紀錄，畫面上看得到即時進度
//
// 判斷下一步的規則（advanceMission）：
//   總目標剛建立 → 總經理拆解
//   依順序處理每個部門任務（要等 dependsOn 的任務都結束）：
//     還沒分派     → 部門經理分派給員工
//     員工子任務   → 員工執行 → 經理審閱（退回就重做）
//     員工都完成   → 經理彙整報告
//     報告交出     → 總經理驗收（退回就讓經理修改報告）
//   所有部門任務都結束 → 總經理寫總結報告，總目標完成
//
// 等你決定的任務（decisions，見 lib/decisions.ts）：先跳過、也不算結束，
// 所以依賴它的任務和總結報告都會等你決定後才繼續。

// 任務「已結束」的狀態：通過、失敗、取消都算，後面依賴它的任務就可以開始
const SETTLED = ["approved", "failed", "cancelled"];
const isSettled = (status: string) => SETTLED.includes(status);

// 每一步最多可能要一兩分鐘（AI 思考時間），鎖的期限要比這長
const LOCK_MS = 5 * 60 * 1000;

type TaskDoc = {
  _id: Types.ObjectId;
  status: string;
  dependsOn: Types.ObjectId[];
  parentTask?: Types.ObjectId | null;
};

// 推進一步。有做事回傳 true；沒事可做（已完成或卡住）回傳 false
export async function advanceMission(missionId: string): Promise<boolean> {
  await connectDB();
  const mission = await MissionModel.findById(missionId).lean();
  if (!mission) return false;

  if (["completed", "failed", "cancelled"].includes(mission.status)) return false;
  if (mission.status === "pending") {
    await planMission(missionId);
    return true;
  }

  const tasks = await TaskModel.find({ mission: missionId }).sort({ order: 1 }).lean();
  const departmentTasks = tasks.filter((t) => t.level === "department");
  // 等你決定的任務：當作「還沒結束」，而且先不處理
  const blocked = await blockedTaskIds(missionId);
  const isBlocked = (t: TaskDoc) => blocked.has(t._id.toString());
  const settled = (t: TaskDoc) => isSettled(t.status) && !isBlocked(t);
  const depsDone = (t: TaskDoc, all: TaskDoc[]) =>
    t.dependsOn.every((depId) => {
      const dep = all.find((d) => d._id.equals(depId));
      return !dep || settled(dep);
    });

  for (const dept of departmentTasks) {
    if (isBlocked(dept) || isSettled(dept.status) || !depsDone(dept, departmentTasks)) continue;
    const id = dept._id.toString();

    if (dept.status === "pending") {
      await assignStaff(id);
      return true;
    }
    if (dept.status === "submitted") {
      await reviewDepartmentResult(id);
      return true;
    }
    if (dept.status === "revision") {
      await compileReport(id); // 依總經理的意見修改報告
      return true;
    }

    // 部門任務執行中：處理底下的員工子任務
    const subtasks = tasks.filter((t) => t.parentTask?.equals(dept._id));
    for (const sub of subtasks) {
      if (isBlocked(sub) || isSettled(sub.status) || !depsDone(sub, subtasks)) continue;
      if (sub.status === "submitted") {
        await reviewStaffResult(sub._id.toString());
      } else {
        await executeStaffTask(sub._id.toString()); // pending、revision、in_progress
      }
      return true;
    }

    if (subtasks.every(settled)) {
      await compileReport(id);
      return true;
    }
  }

  // 全部部門任務都結束（或總經理一個任務都沒分派）→ 寫總結報告
  if (departmentTasks.every(settled)) {
    await finalizeMission(missionId);
    return true;
  }
  return false;
}

export type RunOutcome = "done" | "paused" | "busy" | "error";

// 連續推進，直到完成、出錯或時間用完。
//   done   → 沒有下一步了（完成，或在等某些條件）
//   paused → 時間到先暫停，之後再呼叫一次就會繼續
//   busy   → 已經有其他流程在處理這個總目標
//   error  → 某一步出錯，已寫進進度紀錄；修正後可以再呼叫一次重試
export async function runMission(
  missionId: string,
  { budgetMs = 240_000 }: { budgetMs?: number } = {},
): Promise<RunOutcome> {
  if (!(await acquireMissionLock(missionId, LOCK_MS))) return "busy";

  const deadline = Date.now() + budgetMs;
  try {
    while (Date.now() < deadline) {
      if (!(await advanceMission(missionId))) return "done";
      await refreshMissionLock(missionId, LOCK_MS);
    }
    return "paused";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("執行總目標失敗", error);
    const mission = await MissionModel.findById(missionId, { owner: 1 }).lean();
    if (mission) {
      await logActivity({
        owner: mission.owner,
        mission: missionId,
        actor: GENERAL_MANAGER,
        type: "error",
        message: `執行中斷：${message}（可以按「繼續執行」重試）`,
      });
      await raiseRunError(mission.owner, missionId, message);
    }
    return "error";
  } finally {
    // 不管成功或失敗都要解鎖，否則要等鎖過期才能再執行
    await releaseMissionLock(missionId);
  }
}
