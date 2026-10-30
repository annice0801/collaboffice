import "server-only";
import { z } from "zod";
import { askStructured, MODELS, type AiUsage, type ChatTurn } from "@/lib/ai/claude";
import { EXECUTIVE_ASSISTANT, GENERAL_MANAGER, getDepartment } from "@/lib/company";
import { connectDB } from "@/lib/mongodb";
import { createMission } from "@/lib/office";
import { MissionModel } from "@/models/Mission";
import { TaskModel } from "@/models/Task";
import { getExecutivePersona, requireDepartments } from "@/lib/organization";
import { companyContext } from "@/lib/company-plan";
import { executiveAssistantPrompt, generalManagerPrompt, memberChatPrompt } from "./prompts";

// 跟核心主管對話。首席秘書和總經理是同一職級，你可以直接找任何一位：
//   首席秘書：生活、健康、日程；工作會整理後轉交總經理
//   總經理：直接交辦工作、詢問進度
// 兩位都會拿到「目前的工作」清單，被問到進度時可以據實回答。
// 對話有前文：畫面會把同一位主管最近的幾輪對話一起送來，主管能依你的回答接著問或接著做。

export const CHAT_AGENTS = [EXECUTIVE_ASSISTANT, GENERAL_MANAGER] as const;
export type ChatAgent = (typeof CHAT_AGENTS)[number];

// 回傳的資料格式。總經理不處理個人事務，所以沒有 personal 這個選項
const ROUTES = {
  [EXECUTIVE_ASSISTANT]: ["work", "personal", "clarify", "chat"],
  [GENERAL_MANAGER]: ["work", "clarify", "chat"],
} as const;

function schemaFor(agent: ChatAgent) {
  return z.object({
    route: z.enum(ROUTES[agent]),
    reply: z.string().describe("直接回覆老闆的話"),
    // 只有 route 是 work 時才需要；其他情況填 null
    mission: z.object({ title: z.string(), goal: z.string() }).nullable(),
  });
}

export type ChatResult = {
  route: "work" | "personal" | "clarify" | "chat";
  reply: string;
  missionId: string | null; // 有交辦工作時，新建立的總目標 id
  usage: AiUsage;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "等待開始",
  planning: "總經理拆解中",
  in_progress: "執行中",
  reviewing: "驗收中",
  completed: "已完成",
  failed: "失敗",
  cancelled: "已取消",
};

// 最近的工作清單，附在訊息後面，讓主管回答進度時有根據
async function recentWork(owner: string): Promise<string> {
  await connectDB();
  const missions = await MissionModel.find({ owner }, { title: 1, status: 1, progress: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();
  if (!missions.length) return "（目前沒有任何工作）";
  return missions
    .map((m) => `- ${m.title}：${STATUS_LABEL[m.status] ?? m.status}，進度 ${m.progress}%`)
    .join("\n");
}

// 整理前文：一定要「你說 → 主管回」交錯，而且從你說的話開始（API 的規定）
function cleanHistory(history: ChatTurn[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const turn of history) {
    if (!turn.content.trim()) continue;
    if (turns.length === 0 && turn.role !== "user") continue;
    if (turns.at(-1)?.role === turn.role) turns[turns.length - 1] = turn; // 連續同一方，只留最後一則
    else turns.push(turn);
  }
  // 最後一則要是主管的回覆，這次的新訊息才能接在後面
  if (turns.at(-1)?.role === "user") turns.pop();
  return turns.slice(-12);
}

// owner：傳訊息的會員 id，建立的總目標會歸在這位會員名下
export async function chatWith(
  agent: ChatAgent,
  owner: string,
  message: string,
  history: ChatTurn[] = [],
): Promise<ChatResult> {
  const departments = await requireDepartments(owner);
  const { data, usage } = await askStructured({
    model: MODELS.executive,
    system:
      agent === GENERAL_MANAGER
        ? generalManagerPrompt(departments, await getExecutivePersona(owner, GENERAL_MANAGER))
        : executiveAssistantPrompt(departments, await getExecutivePersona(owner, EXECUTIVE_ASSISTANT)),
    // 開頭標明「直接對話」，總經理才知道這次要做四件事裡的哪一件
    user: `${agent === GENERAL_MANAGER ? "這次的工作：【直接對話】\n\n" : ""}老闆說：${message}\n\n---\n目前的工作：\n${await recentWork(owner)}\n\n${await companyContext(owner)}`,
    history: cleanHistory(history),
    schema: schemaFor(agent),
    // 對話不需要想太久，用 low 比較快
    effort: "low",
  });

  // 交辦工作 → 建立總目標（後續流程由呼叫端在背景啟動）
  if (data.route === "work" && data.mission) {
    const mission = await createMission({
      owner,
      title: data.mission.title,
      goal: data.mission.goal,
      createdBy: agent,
    });
    return { route: "work", reply: data.reply, missionId: mission._id.toString(), usage };
  }

  // AI 說是 work 卻沒給總目標內容：當成需要釐清，不建立空的總目標
  const route = data.route === "work" ? "clarify" : data.route;
  return { route, reply: data.reply, missionId: null, usage };
}

// ── 部門經理、員工：老闆點他的辦公桌，他走回座位跟老闆聊 ──
// 只回答、不建立任務（新工作要經過總經理）。經理用 Sonnet、員工用 Haiku，跟平常工作一樣

const TASK_LABEL: Record<string, string> = {
  pending: "等待開始",
  in_progress: "執行中",
  submitted: "已交出，等待審閱",
  revision: "被退回修改中",
  approved: "已通過",
  failed: "未完成",
};

// 這位成員手上的工作（還沒做完的全部列出，加上最近完成的幾項）
async function memberWork(owner: string, agent: string): Promise<string> {
  await connectDB();
  const tasks = await TaskModel.find({ owner, assignee: agent, status: { $ne: "cancelled" } }, { title: 1, status: 1, progress: 1 })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  if (!tasks.length) return "（目前沒有任何工作）";
  return tasks.map((t) => `- ${t.title}：${TASK_LABEL[t.status] ?? t.status}，進度 ${t.progress}%`).join("\n");
}

export async function chatWithMember(agent: string, owner: string, message: string, history: ChatTurn[] = []) {
  const departments = await requireDepartments(owner);
  const [deptId, role] = agent.split(".");
  const dept = getDepartment(departments, deptId);
  if (!dept) throw new Error("找不到這位成員");
  const isManager = role === "manager";
  const { data } = await askStructured({
    model: isManager ? MODELS.manager : MODELS.staff,
    system: memberChatPrompt(dept, isManager ? null : role),
    user: `老闆說：${message}\n\n---\n你手上的工作：\n${await memberWork(owner, agent)}\n\n${await companyContext(owner)}`,
    history: cleanHistory(history),
    schema: z.object({ reply: z.string().describe("直接回覆老闆的話") }),
    effort: "low",
  });
  return { route: "chat" as const, reply: data.reply, missionId: null };
}
