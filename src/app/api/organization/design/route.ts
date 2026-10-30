import { NextResponse } from "next/server";
import { AiRefusalError, usageLimitMessage } from "@/lib/ai/claude";
import { answersInput, designDepartments } from "@/lib/agents/designer";
import { getUserIdFromRequest } from "@/lib/auth";

// 依問卷回答設計部門：POST /api/organization/design（需要登入）
// 內容：問卷回答（見 lib/agents/designer.ts 的 answersInput）
// 回傳：{ departments, theme, themeReason }——只是提案（theme 是推薦的辦公室主題），還沒存檔；會員確認後再用 PUT /api/organization 存檔

export const maxDuration = 120;

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const parsed = answersInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });
  }

  try {
    return NextResponse.json(await designDepartments(parsed.data));
  } catch (error) {
    // AI 用量到上限：講清楚原因，畫面上會提供「先用範例部門建立」（不需要 AI）
    const limit = usageLimitMessage(error);
    if (limit) return NextResponse.json({ error: limit, fallback: true }, { status: 429 });
    if (error instanceof AiRefusalError) {
      return NextResponse.json({ error: "無法依這些回答設計部門，請調整內容再試一次" }, { status: 422 });
    }
    console.error("設計部門失敗", error);
    return NextResponse.json({ error: "設計部門失敗，請稍後再試" }, { status: 500 });
  }
}
