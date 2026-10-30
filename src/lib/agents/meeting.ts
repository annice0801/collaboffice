import "server-only";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { askStructured, MODELS, usageLimitMessage } from "@/lib/ai/claude";
import { EXECUTIVE_ASSISTANT, GENERAL_MANAGER, getDepartment, managerOf } from "@/lib/company";
import { getCompanyPlan } from "@/lib/company-plan";
import { connectDB } from "@/lib/mongodb";
import { getExecutivePersona, requireDepartments } from "@/lib/organization";
import { MeetingModel } from "@/models/Meeting";
import { meetingAssistantPrompt, meetingChairPrompt, meetingManagerPrompt } from "./prompts";

// 會議室：老闆提出想法 → 列席的部門經理（和秘書）同時發言（平行呼叫）→ 總經理做結論、建議怎麼修訂公司目標。
// 每位主管都依自己的背景（Persona）發言，並以公司的願景與年度目標為依歸。
// 每一輪都存進 meetings 資料表；帶 meetingId 就是接續同一場會議（前面的發言會一起給大家看）。
// 這裡只負責「討論」，不會建立任務；修訂目標、交辦工作由老闆在畫面上決定。

export const meetingInput = z.object({
  meetingId: z.string().optional(), // 接續哪一場會議；沒有就開新的一場
  idea: z.string().trim().min(1, "請說說你的想法").max(2000),
  attendees: z.array(z.string()).min(1, "至少要有一個部門列席").max(8), // 列席的部門代號
  assistant: z.boolean().default(false), // 秘書是否列席發言
});

const opinionSchema = z.object({
  stance: z.enum(["support", "conditional", "concern"]),
  opinion: z.string(),
  alignment: z.string(),
  suggestions: z.array(z.string()),
});

const summarySchema = z.object({
  conclusion: z.string(),
  actions: z.array(z.object({ department: z.string(), action: z.string() })),
  goalChanges: z.array(
    z.object({
      type: z.enum(["add", "update", "complete", "remove"]),
      goalId: z.string(),
      title: z.string(),
      due: z.string(),
      reason: z.string(),
    }),
  ),
  visionChange: z.string(),
});

export type MeetingOpinion = z.infer<typeof opinionSchema> & { agent: string; department: string };
export type MeetingSummary = z.infer<typeof summarySchema>;
type Round = { idea: string; opinions: MeetingOpinion[]; summary?: MeetingSummary };

export async function holdMeeting(owner: string, input: z.infer<typeof meetingInput>) {
  await connectDB();
  const [departments, company, gmPersona, eaPersona] = await Promise.all([
    requireDepartments(owner),
    getCompanyPlan(owner),
    getExecutivePersona(owner, GENERAL_MANAGER),
    getExecutivePersona(owner, EXECUTIVE_ASSISTANT),
  ]);
  const attending = input.attendees.map((id) => getDepartment(departments, id)).filter((d) => d !== undefined);
  if (!attending.length) throw new Error("列席的部門不存在");

  // 接續的會議：前面幾輪的發言
  const existing = input.meetingId && isValidObjectId(input.meetingId) ? await MeetingModel.findOne({ _id: input.meetingId, owner }) : null;
  const rounds = (existing?.rounds ?? []) as unknown as Round[];
  const nameOf = (o: MeetingOpinion) => (o.agent === EXECUTIVE_ASSISTANT ? "首席秘書" : `${getDepartment(departments, o.department)?.name ?? o.department}經理`);
  const history = rounds
    .slice(-5)
    .flatMap((r) => [
      `老闆：${r.idea}`,
      ...r.opinions.map((o) => `${nameOf(o)}：${o.opinion}`),
      ...(r.summary ? [`總經理（結論）：${r.summary.conclusion}`] : []),
    ]);

  // 每個人都會看到的背景：公司願景、年度目標、前面的討論、這次的想法
  const goals = company?.goals.length
    ? company.goals.map((g) => `- [${g.id}] ${g.title}${g.due ? `（期限：${g.due}）` : ""}${g.done ? "（已達成）" : ""}`).join("\n")
    : "（還沒設定）";
  const background = [
    `公司願景：${company?.vision || "（還沒設定）"}`,
    `年度目標（方括號內是目標 id）：\n${goals}`,
    history.length ? `前面的討論：\n${history.join("\n")}` : "",
    `老闆這次提出的想法：\n${input.idea}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // 列席的人同時發言；某一位失敗不影響其他人（用量上限除外，那樣大家都會失敗）
  const speakers = [
    ...(input.assistant ? [{ agent: EXECUTIVE_ASSISTANT, department: "", system: meetingAssistantPrompt(eaPersona) }] : []),
    ...attending.map((dept) => ({ agent: managerOf(dept.id), department: dept.id, system: meetingManagerPrompt(dept) })),
  ];
  const opinions: MeetingOpinion[] = await Promise.all(
    speakers.map(async ({ agent, department, system }) => {
      try {
        const { data } = await askStructured({ model: MODELS.manager, system, user: background, schema: opinionSchema, effort: "low", maxTokens: 3000 });
        return { ...data, agent, department };
      } catch (error) {
        if (usageLimitMessage(error)) throw error;
        console.error(`會議：${agent} 發言失敗`, error);
        return { agent, department, stance: "conditional", opinion: "（暫時無法發言，請稍後再問一次）", alignment: "", suggestions: [] };
      }
    }),
  );

  const said = opinions
    .map((o) => `${nameOf(o)}（${o.stance}）：${o.opinion}\n與目標的關係：${o.alignment}\n建議：${o.suggestions.join("；")}`)
    .join("\n\n");
  const { data: summary } = await askStructured({
    model: MODELS.manager,
    system: meetingChairPrompt(departments, gmPersona),
    user: `${background}\n\n各列席主管的發言：\n${said}`,
    schema: summarySchema,
    effort: "medium",
    maxTokens: 6000,
  });

  // 只保留指向「真的存在的目標」的修訂建議，避免 AI 填錯 id
  const goalIds = new Set(company?.goals.map((g) => g.id));
  summary.goalChanges = summary.goalChanges.filter((c) => c.type === "add" || goalIds.has(c.goalId));
  summary.actions = summary.actions.filter((a) => getDepartment(departments, a.department));

  // 存檔：接續的會議加一輪；新會議用這次的想法當標題
  const round = { idea: input.idea, opinions, summary };
  const attendees = { departments: input.attendees, assistant: input.assistant };
  const meeting = existing
    ? await MeetingModel.findByIdAndUpdate(existing._id, { $push: { rounds: round }, $set: { attendees } }, { new: true })
    : await MeetingModel.create({ owner, title: input.idea.slice(0, 60), attendees, rounds: [round] });

  return { meetingId: meeting!._id.toString(), round: meeting!.rounds.length - 1, opinions, summary };
}
