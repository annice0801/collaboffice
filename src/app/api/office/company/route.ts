import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserIdFromRequest } from "@/lib/auth";
import { countAgents } from "@/lib/company";
import { getCompanyPlan, goalsInput, saveCompanyPlan, visionInput } from "@/lib/company-plan";
import { connectDB } from "@/lib/mongodb";
import { getOrganization } from "@/lib/organization";
import { MissionModel } from "@/models/Mission";
import { TaskModel } from "@/models/Task";

// 公司總覽（點辦公室裡的老闆時顯示）：
//   GET   /api/office/company → 願景、年度目標、預計製作、營運數字、近 8 週趨勢、未來走勢、各部門負載
//   PATCH /api/office/company → 更新願景或年度目標 { vision?, goals? }

const WEEKS = 8;
const DAY = 24 * 60 * 60 * 1000;
const OPEN = ["pending", "in_progress", "revision", "submitted"];
const FINISHED = ["completed", "failed", "cancelled"];

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const [org, plan] = await Promise.all([getOrganization(userId), getCompanyPlan(userId)]);
  if (!org || !plan) return NextResponse.json({ error: "請先完成問卷建立部門" }, { status: 404 });

  await connectDB();
  const now = Date.now();
  const since = new Date(now - WEEKS * 7 * DAY);
  const [missions, tasks] = await Promise.all([
    MissionModel.find({ owner: userId }, { title: 1, status: 1, progress: 1, createdAt: 1, completedAt: 1 }).sort({ createdAt: -1 }).lean(),
    TaskModel.find({ owner: userId, status: { $ne: "cancelled" } }, { department: 1, level: 1, status: 1, progress: 1, completedAt: 1 }).lean(),
  ]);

  // ── 近 8 週，每週完成（通過）的任務數 ──
  const weekly = Array.from({ length: WEEKS }, (_, i) => {
    const start = now - (WEEKS - i) * 7 * DAY;
    return { start: new Date(start).toISOString(), done: 0 };
  });
  for (const t of tasks) {
    if (t.status !== "approved" || !t.completedAt || t.completedAt < since) continue;
    const index = Math.floor((t.completedAt.getTime() - since.getTime()) / (7 * DAY));
    if (weekly[index]) weekly[index].done++;
  }

  // ── 未來走勢：用最近 4 週的平均速度，推估目前待辦多久做完 ──
  const openTasks = tasks.filter((t) => OPEN.includes(t.status)).length;
  const perWeek = weekly.slice(-4).reduce((sum, w) => sum + w.done, 0) / 4;
  const openMissions = missions.filter((m) => !FINISHED.includes(m.status));
  // 每個進行中的總目標：依「已經花的時間」和「目前進度」推估還要幾天
  const forecasts = openMissions.slice(0, 8).map((m) => {
    const elapsedDays = (now - new Date(m.createdAt).getTime()) / DAY;
    const etaDays = m.progress > 0 ? Math.max(1, Math.ceil((elapsedDays * (100 - m.progress)) / m.progress)) : null;
    return { id: m._id.toString(), title: m.title, status: m.status, progress: m.progress, etaDays };
  });

  const completed = missions.filter((m) => m.status === "completed");
  const durations = completed.filter((m) => m.completedAt).map((m) => (m.completedAt!.getTime() - new Date(m.createdAt).getTime()) / DAY);

  return NextResponse.json({
    companyName: org.companyName,
    ...plan,
    stats: {
      missions: missions.length,
      completed: completed.length,
      open: openMissions.length,
      failed: missions.filter((m) => m.status === "failed").length,
      members: countAgents(org.departments),
      departments: org.departments.length,
      openTasks,
      approvedTasks: tasks.filter((t) => t.status === "approved").length,
      avgDays: durations.length ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : null,
    },
    weekly,
    projection: { perWeek: Math.round(perWeek * 10) / 10, openTasks, weeksToClear: perWeek > 0 ? Math.ceil(openTasks / perWeek) : null },
    forecasts,
    departments: org.departments.map((d) => {
      const own = tasks.filter((t) => t.department === d.id && t.level === "staff");
      return {
        id: d.id,
        name: d.name,
        open: own.filter((t) => OPEN.includes(t.status)).length,
        done: own.filter((t) => t.status === "approved").length,
      };
    }),
  });
}

const patchInput = z.object({ vision: visionInput.optional(), goals: goalsInput.optional() });

export async function PATCH(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const parsed = patchInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });
  if (!(await saveCompanyPlan(userId, parsed.data))) return NextResponse.json({ error: "請先完成問卷建立部門" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
