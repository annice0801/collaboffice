import { after, NextResponse } from "next/server";
import { z } from "zod";
import { AiRefusalError, usageLimitMessage } from "@/lib/ai/claude";
import { runMission } from "@/lib/agents/engine";
import { CHAT_AGENTS, chatWith, chatWithMember, type ChatAgent } from "@/lib/agents/chat";
import { isAgentId, USER } from "@/lib/company";
import { getUserIdFromRequest } from "@/lib/auth";
import { getOrganization } from "@/lib/organization";

// 跟公司成員說話：POST /api/assistant（需要登入）
// 內容：{ "agent": "executive_assistant"、"general_manager"，或部門成員（例如 "media.copywriter"），
//         "message": "幫我規劃下個月的 IG 貼文",
//         "history": [{ "role": "user", "content": "…" }, { "role": "assistant", "content": "…" }] }
//       agent 沒填的話預設找首席秘書；history 是之前的對話，可省略
// 回傳：{ route, reply, missionId }
//
// 流程：
//   部門經理、員工只聊天（說明自己的工作、給建議），不建立任務
//   1. 主管判斷訊息類型並回覆（約幾秒）
//   2. 如果是工作，建立總目標，API 立刻回覆你
//   3. 回覆送出後，整個公司在背景開始運作（總經理拆解 → 部門經理分派 → 員工執行 → 審閱…），
//      進度可以用 GET /api/missions/<missionId> 查看

// 背景工作最多可以跑多久（秒）。Vercel 免費方案的上限是 300 秒
export const maxDuration = 300;

const inputSchema = z.object({
  agent: z.string().max(80).default("executive_assistant"),
  message: z.string().trim().min(1, "請輸入訊息").max(5000),
  // 之前的對話（可省略）：讓主管依前文接續
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(5000) }))
    .max(30)
    .default([]),
});

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  // 還沒完成問卷、沒有部門的話，沒有人可以接工作
  const org = await getOrganization(userId);
  if (!org) {
    return NextResponse.json({ error: "請先完成問卷，建立你的部門" }, { status: 409 });
  }

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" },
      { status: 400 },
    );
  }

  try {
    const { agent, message, history } = parsed.data;
    if (agent === USER || !isAgentId(agent, org.departments)) {
      return NextResponse.json({ error: "找不到這位成員" }, { status: 404 });
    }
    const result = (CHAT_AGENTS as readonly string[]).includes(agent)
      ? await chatWith(agent as ChatAgent, userId, message, history)
      : await chatWithMember(agent, userId, message, history);

    // after()：等回應送出後才執行，你不用等整個流程跑完才看到秘書的回覆
    const { missionId } = result;
    if (missionId) {
      after(() => runMission(missionId).catch((error) => console.error("執行總目標失敗", error)));
    }

    return NextResponse.json({
      route: result.route,
      reply: result.reply,
      missionId: result.missionId,
    });
  } catch (error) {
    const limit = usageLimitMessage(error);
    if (limit) return NextResponse.json({ error: limit }, { status: 429 });
    if (error instanceof AiRefusalError) {
      return NextResponse.json({ error: "無法處理這個請求，請換個說法" }, { status: 422 });
    }
    console.error("處理訊息失敗", error);
    return NextResponse.json({ error: "暫時無法回覆，請稍後再試" }, { status: 500 });
  }
}
