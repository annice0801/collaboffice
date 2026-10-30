import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runMission } from "@/lib/agents/engine";
import { getUserIdFromRequest } from "@/lib/auth";
import { decide } from "@/lib/decisions";

// 下達決定：POST /api/decisions/<id> { choice, note }
// 依方案更新任務；需要接續的話，回覆送出後在背景繼續執行總目標
export const maxDuration = 300;
const input = z.object({ choice: z.string().max(40), note: z.string().max(4000).default("") });

export async function POST(request: NextRequest, ctx: RouteContext<"/api/decisions/[id]">) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "資料格式錯誤" }, { status: 400 });
  const { id } = await ctx.params;
  try {
    const { resume } = await decide(userId, id, parsed.data.choice, parsed.data.note);
    if (resume) after(() => runMission(resume).catch((error) => console.error("接續執行失敗", error)));
    return NextResponse.json({ ok: true, resume });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "處理失敗" }, { status: 400 });
  }
}
