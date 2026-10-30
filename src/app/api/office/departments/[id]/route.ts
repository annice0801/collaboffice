import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserIdFromRequest } from "@/lib/auth";
import { setDepartmentWebSearch } from "@/lib/organization";

// 部門設定：PATCH /api/office/departments/<部門代號> { webSearch } → 開關這個部門的網路搜尋
// （開啟後員工執行任務時可以上網查最新資料，每次搜尋另外計費）

const input = z.object({ webSearch: z.boolean() });

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/office/departments/[id]">) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "資料格式錯誤" }, { status: 400 });
  if (!(await setDepartmentWebSearch(userId, id, parsed.data.webSearch))) {
    return NextResponse.json({ error: "找不到這個部門" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
