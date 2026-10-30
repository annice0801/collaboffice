import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { addPlan, planInput } from "@/lib/company-plan";

// 新增一筆「未來預計製作」：POST /api/office/plans { title, detail, agent }
// agent 是預計交給誰：executive_assistant（秘書）或 general_manager（總經理）
export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const parsed = planInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });
  const plan = await addPlan(userId, parsed.data);
  if (!plan) return NextResponse.json({ error: "請先完成問卷建立部門" }, { status: 404 });
  return NextResponse.json({ plan });
}
