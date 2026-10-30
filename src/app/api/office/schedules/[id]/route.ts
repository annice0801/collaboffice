import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserIdFromRequest } from "@/lib/auth";
import { removeSchedule, updateSchedule } from "@/lib/company-plan";

// 一場預定會議：
//   PATCH  /api/office/schedules/<id> { status?, at? } → 開始開會、延後、取消
//   DELETE /api/office/schedules/<id>
const patchInput = z.object({ status: z.enum(["upcoming", "started", "cancelled"]).optional(), at: z.coerce.date().optional() });

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/office/schedules/[id]">) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const parsed = patchInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "資料格式錯誤" }, { status: 400 });
  await updateSchedule(userId, (await ctx.params).id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/office/schedules/[id]">) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  await removeSchedule(userId, (await ctx.params).id);
  return NextResponse.json({ ok: true });
}
