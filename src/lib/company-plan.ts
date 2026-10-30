import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { EXECUTIVE_ASSISTANT, GENERAL_MANAGER } from "./company";
import { connectDB } from "./mongodb";
import { OrganizationModel } from "@/models/Organization";

// 公司的方向與未來計畫（存在 organizations 資料表）：
//   vision：公司願景（一段話）
//   goals： 公司目標，分成年度、本月、本週（可以打勾完成）
//   plans： 未來預計製作——先記下來，之後一鍵交辦給秘書或總經理

export const GOAL_PERIODS = ["year", "month", "week"] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];
export type CompanyGoal = { id: string; title: string; due: string; done: boolean; period: GoalPeriod };
export type FuturePlan = { id: string; title: string; detail: string; agent: string; createdAt: string };

export const goalsInput = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      title: z.string().trim().min(1, "目標不能是空的").max(100),
      due: z.string().trim().max(20).default(""),
      done: z.boolean().default(false),
      period: z.enum(GOAL_PERIODS).default("year"),
    }),
  )
  .max(36, "目標最多 36 項");

export const visionInput = z.string().trim().max(300, "願景最多 300 字");

export const planInput = z.object({
  title: z.string().trim().min(1, "請輸入要做什麼").max(100),
  detail: z.string().trim().max(1000).default(""),
  agent: z.enum([EXECUTIVE_ASSISTANT, GENERAL_MANAGER]),
});

export async function getCompanyPlan(owner: string) {
  await connectDB();
  const org = await OrganizationModel.findOne({ owner }, { vision: 1, goals: 1, plans: 1 }).lean();
  if (!org) return null;
  return {
    vision: org.vision ?? "",
    goals: (org.goals ?? []).map((g): CompanyGoal => ({ id: g.id, title: g.title, due: g.due ?? "", done: Boolean(g.done), period: (g.period ?? "year") as GoalPeriod })),
    plans: (org.plans ?? []).map(
      (p): FuturePlan => ({ id: p.id, title: p.title, detail: p.detail ?? "", agent: p.agent, createdAt: new Date(p.createdAt ?? Date.now()).toISOString() }),
    ),
  };
}

// 更新願景、年度目標（整份取代）
export async function saveCompanyPlan(owner: string, update: { vision?: string; goals?: CompanyGoal[] }): Promise<boolean> {
  await connectDB();
  const result = await OrganizationModel.updateOne({ owner }, { $set: update });
  return result.matchedCount > 0;
}

// 新增、刪除一筆預計製作（用 $push / $pull，兩個分頁同時操作也不會互相蓋掉）
export async function addPlan(owner: string, plan: z.infer<typeof planInput>): Promise<FuturePlan | null> {
  await connectDB();
  const item = { ...plan, id: randomUUID(), createdAt: new Date() };
  const result = await OrganizationModel.updateOne({ owner }, { $push: { plans: { $each: [item], $slice: -30 } } });
  return result.matchedCount ? { ...item, createdAt: item.createdAt.toISOString() } : null;
}

export async function removePlan(owner: string, id: string): Promise<void> {
  await connectDB();
  await OrganizationModel.updateOne({ owner }, { $pull: { plans: { id } } });
}

// 給 Agent 看的公司方向（願景 + 年度目標），規劃、對話時附上，讓大家以公司目標為依歸
export async function companyContext(owner: string): Promise<string> {
  const plan = await getCompanyPlan(owner);
  if (!plan || (!plan.vision && !plan.goals.length)) return "公司願景與年度目標：（老闆還沒設定）";
  const line = (g: CompanyGoal) => `- ${g.title}${g.due ? `（期限：${g.due}）` : ""}${g.done ? "（已達成）" : ""}`;
  const group = (period: GoalPeriod, name: string) => {
    const list = plan.goals.filter((g) => g.period === period);
    return list.length ? `\n${name}：\n${list.map(line).join("\n")}` : "";
  };
  const goals = group("year", "年度目標") + group("month", "本月目標") + group("week", "本週目標");
  return `公司願景：${plan.vision || "（還沒設定）"}${goals || "\n公司目標：（還沒設定）"}`;
}

// ── 秘書管理的會議時程 ──
export type Schedule = { id: string; title: string; at: string; departments: string[]; note: string; status: "upcoming" | "started" | "cancelled" };

export const scheduleInput = z.object({
  title: z.string().trim().min(1, "請輸入會議主題").max(100),
  at: z.coerce.date(),
  departments: z.array(z.string().max(40)).max(8).default([]),
  note: z.string().trim().max(500).default(""),
});

export async function listSchedules(owner: string): Promise<Schedule[]> {
  await connectDB();
  const org = await OrganizationModel.findOne({ owner }, { schedules: 1 }).lean();
  return (org?.schedules ?? [])
    .map((s): Schedule => ({ id: s.id, title: s.title, at: new Date(s.at).toISOString(), departments: [...(s.departments ?? [])], note: s.note ?? "", status: s.status as Schedule["status"] }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

export async function addSchedule(owner: string, input: z.infer<typeof scheduleInput>) {
  await connectDB();
  // 只保留最近 50 筆（舊的、取消的會被擠掉）
  const item = { ...input, id: randomUUID(), status: "upcoming" };
  await OrganizationModel.updateOne({ owner }, { $push: { schedules: { $each: [item], $sort: { at: 1 }, $slice: -50 } } });
}

// 開始開會、延後、取消
export async function updateSchedule(owner: string, id: string, update: { status?: Schedule["status"]; at?: Date }) {
  await connectDB();
  const set = Object.fromEntries(Object.entries(update).map(([k, v]) => [`schedules.$.${k}`, v]));
  await OrganizationModel.updateOne({ owner, "schedules.id": id }, { $set: set });
}

export async function removeSchedule(owner: string, id: string) {
  await connectDB();
  await OrganizationModel.updateOne({ owner }, { $pull: { schedules: { id } } });
}
