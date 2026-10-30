import { NextResponse, type NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { departmentName, EXECUTIVE_ASSISTANT, GENERAL_MANAGER, getDepartment, isAgentId, managerOf, managerPersonaOf } from "@/lib/company";
import { getCompanyPlan } from "@/lib/company-plan";
import { connectDB } from "@/lib/mongodb";
import { getExecutivePersona, getOrganization } from "@/lib/organization";
import { ActivityModel } from "@/models/Activity";
import { DecisionModel } from "@/models/Decision";
import { MissionModel } from "@/models/Mission";
import { TaskModel } from "@/models/Task";
import { TaskResultModel } from "@/models/TaskResult";

// 一位 Agent 的工作詳情：GET /api/office/agents/<agent>（需要登入，只看自己的）
// 點辦公室裡的人物時顯示：
//   current：手上還沒做完的工作（含工作說明、驗收標準、進度、被退回幾次）
//   recent：最近完成（或失敗）的工作，附上最後一次的審閱意見
//   stats：工作統計（總共接過幾件、通過幾件、一次就通過幾件、被退回幾次、產出多少字）
//   activities：最近的動態紀錄
//   decisions：這個人提出、等你決定的事（遇到的困難、方案、各方案的結果）
//   persona：主管的背景（經歷、專長、審查重點、說話風格）；員工沒有，是 null
//   plans：未來預計製作（你先記下、之後要交辦給這位主管的事；只有秘書、總經理有）
//   upcoming：已經排進流程、還沒開始的工作（總經理：等待拆解的總目標、等待分派的部門任務）
// 總經理、秘書不直接做任務，他們的「交辦事項」是總目標：current / recent 改列總目標
// （秘書只列她轉交給總經理的那些）。
// agent 是 Agent 身分字串，例如 "intel.crawler"（網址裡的「.」不需要編碼）

const OPEN = ["pending", "in_progress", "revision", "submitted"];

export async function GET(request: NextRequest, ctx: RouteContext<"/api/office/agents/[agent]">) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const { agent } = await ctx.params;
  const org = await getOrganization(userId);
  if (!org || !isAgentId(agent, org.departments)) {
    return NextResponse.json({ error: "找不到這位成員" }, { status: 404 });
  }

  await connectDB();
  const decisions = (await DecisionModel.find({ owner: userId, agent, status: "open" }).sort({ createdAt: 1 }).lean()).map((d) => ({
    id: d._id.toString(),
    missionId: d.mission.toString(),
    kind: d.kind,
    blocking: d.blocking,
    title: d.title,
    situation: d.situation,
    options: d.options.map((o) => ({ id: o.id, label: o.label, outcome: o.outcome, needsNote: Boolean(o.needsNote) })),
  }));
  const activities = (
    await ActivityModel.find({ owner: userId, actor: agent }, { message: 1, type: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
  ).map((a) => ({ message: a.message, type: a.type, createdAt: a.createdAt }));

  // ── 總經理、秘書：以總目標為單位 ──
  if (agent === GENERAL_MANAGER || agent === EXECUTIVE_ASSISTANT) {
    const filter: Record<string, unknown> = { owner: userId };
    if (agent === EXECUTIVE_ASSISTANT) {
      // 秘書轉交的總目標：建立紀錄的執行者是秘書
      const created = await ActivityModel.find({ owner: userId, actor: EXECUTIVE_ASSISTANT, type: "mission_created" }, { mission: 1 }).lean();
      filter._id = { $in: created.map((a) => a.mission) };
    }
    const missions = await MissionModel.find(filter, { title: 1, goal: 1, status: 1, progress: 1, updatedAt: 1, completedAt: 1 })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    const open = missions.filter((m) => !["completed", "failed", "cancelled"].includes(m.status));
    const done = missions.filter((m) => ["completed", "failed"].includes(m.status));

    // 排進流程、還沒開始的事：還沒拆解的總目標、等待部門經理分派的部門任務
    const upcoming =
      agent === GENERAL_MANAGER
        ? [
            ...open.filter((m) => m.status === "pending").map((m) => ({ title: m.title, note: "等待總經理拆解" })),
            ...(
              await TaskModel.find({ owner: userId, level: "department", status: "pending", mission: { $in: open.map((m) => m._id) } }, { title: 1, department: 1, dependsOn: 1 })
                .sort({ order: 1 })
                .lean()
            ).map((t) => ({
              title: t.title,
              note: `${departmentName(org.departments, t.department)}・${t.dependsOn.length ? "等前置任務完成後開始" : "等待部門經理分派"}`,
            })),
          ]
        : [];
    const plan = await getCompanyPlan(userId);

    return NextResponse.json({
      current: open.map((m) => ({
        id: m._id.toString(), missionId: m._id.toString(), title: m.title, mission: "", instructions: m.goal,
        acceptanceCriteria: [], status: m.status, progress: m.progress, revisionCount: 0, maxRevisions: 0,
      })),
      recent: done.slice(0, 6).map((m) => ({ missionId: m._id.toString(), title: m.title, mission: "", status: m.status, completedAt: m.completedAt ?? m.updatedAt, comments: null })),
      stats: {
        total: missions.length,
        open: open.length,
        approved: missions.filter((m) => m.status === "completed").length,
        failed: missions.filter((m) => m.status === "failed").length,
        firstPass: null,
        revisions: null,
        outputChars: null,
      },
      plans: plan?.plans.filter((p) => p.agent === agent) ?? [],
      persona: await getExecutivePersona(userId, agent),
      upcoming,
      activities,
      decisions,
    });
  }

  // ── 部門經理（部門任務）與員工（子任務）──
  const tasks = await TaskModel.find({ owner: userId, assignee: agent, status: { $ne: "cancelled" } })
    .sort({ createdAt: -1 })
    .limit(60)
    .lean();
  const missionTitles = new Map(
    (await MissionModel.find({ _id: { $in: tasks.map((t) => t.mission) } }, { title: 1 }).lean()).map((m) => [m._id.toString(), m.title]),
  );
  const results = await TaskResultModel.find({ owner: userId, task: { $in: tasks.map((t) => t._id) } }, { task: 1, content: 1, review: 1, attempt: 1 })
    .sort({ attempt: -1 })
    .lean();
  // 每個任務最新一次的審閱意見
  const latestReview = new Map<string, string | null>();
  for (const r of results) if (!latestReview.has(r.task.toString())) latestReview.set(r.task.toString(), r.review?.comments ?? null);

  const dept = getDepartment(org.departments, agent.split(".")[0]);
  const persona = dept && agent === managerOf(dept.id) ? managerPersonaOf(dept) : null;
  const open = tasks.filter((t) => OPEN.includes(t.status));
  const finished = tasks.filter((t) => t.status === "approved" || t.status === "failed");
  const approved = finished.filter((t) => t.status === "approved");

  return NextResponse.json({
    current: open.map((t) => ({
      id: t._id.toString(),
      missionId: t.mission.toString(),
      title: t.title,
      mission: missionTitles.get(t.mission.toString()) ?? "",
      instructions: t.instructions,
      acceptanceCriteria: t.acceptanceCriteria,
      status: t.status,
      progress: t.progress,
      revisionCount: t.revisionCount,
      maxRevisions: t.maxRevisions,
      lastReview: latestReview.get(t._id.toString()) ?? null,
    })),
    recent: finished.slice(0, 6).map((t) => ({
      missionId: t.mission.toString(),
      title: t.title,
      mission: missionTitles.get(t.mission.toString()) ?? "",
      status: t.status,
      completedAt: t.completedAt,
      comments: latestReview.get(t._id.toString()) ?? null,
    })),
    stats: {
      total: tasks.length,
      open: open.length,
      approved: approved.length,
      failed: finished.length - approved.length,
      firstPass: approved.filter((t) => t.revisionCount === 0).length,
      revisions: tasks.reduce((sum, t) => sum + t.revisionCount, 0),
      outputChars: results.reduce((sum, r) => sum + r.content.length, 0),
    },
    activities,
    persona,
    webSearch: Boolean(dept?.webSearch), // 部門有沒有開放網路搜尋
    decisions,
  });
}
