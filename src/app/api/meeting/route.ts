import { NextResponse } from "next/server";
import { AiRefusalError, usageLimitMessage } from "@/lib/ai/claude";
import { getUserIdFromRequest } from "@/lib/auth";
import { holdMeeting, meetingInput } from "@/lib/agents/meeting";

// 會議室發言：POST /api/meeting { meetingId?, idea, attendees, assistant }
// 回傳列席主管的意見（opinions）、總經理的會議結論（summary），以及存檔後的 meetingId 與第幾輪（round）。
// 帶 meetingId 就是接續同一場會議。
// 會同時呼叫好幾次 AI，大約需要 20 到 60 秒
export const maxDuration = 300;

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const parsed = meetingInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });

  try {
    return NextResponse.json(await holdMeeting(userId, parsed.data));
  } catch (error) {
    const limit = usageLimitMessage(error);
    if (limit) return NextResponse.json({ error: limit }, { status: 429 });
    if (error instanceof AiRefusalError) return NextResponse.json({ error: "這個議題 AI 無法討論，請換個說法" }, { status: 422 });
    console.error("會議失敗", error);
    return NextResponse.json({ error: "會議進行失敗，請稍後再試" }, { status: 500 });
  }
}
