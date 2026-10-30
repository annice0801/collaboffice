import { NextResponse, type NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { removePlan } from "@/lib/company-plan";

// 刪除一筆「未來預計製作」：DELETE /api/office/plans/<id>（交辦出去、或不做了）
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/office/plans/[id]">) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const { id } = await ctx.params;
  await removePlan(userId, id);
  return NextResponse.json({ ok: true });
}
