import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { addSchedule, listSchedules, scheduleInput } from "@/lib/company-plan";

// 秘書管理的會議時程：
//   GET  /api/office/schedules → 所有時程（依時間排序）
//   POST /api/office/schedules { title, at, departments, note } → 新增一場預定會議
export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  return NextResponse.json({ schedules: await listSchedules(userId) });
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const parsed = scheduleInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });
  await addSchedule(userId, parsed.data);
  return NextResponse.json({ ok: true });
}
