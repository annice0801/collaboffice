import { isValidObjectId } from "mongoose";
import { NextResponse, type NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { getMissionDetail } from "@/lib/office";

// 讀取單一總目標的完整資料：GET /api/missions/<id>（需要登入，只能看自己的）
// 回傳：總目標本身、所有任務、所有成果、所有進度紀錄。
// 畫面上的進度頁會定期呼叫它，顯示最新狀況。
//
// RouteContext 是 Next.js 內建的型別，會依資料夾名稱 [id] 自動推導出 params 的形狀。
// 注意 Next.js 16 的 params 是 Promise，要 await 才拿得到值
export async function GET(request: NextRequest, ctx: RouteContext<"/api/missions/[id]">) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const { id } = await ctx.params;
  // MongoDB 的 _id 有固定格式（24 個 16 進位字元），格式不對就不用查了
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "id 格式錯誤" }, { status: 400 });
  }

  try {
    // 查詢時會同時比對 owner，別人的總目標一律回傳「找不到」
    const detail = await getMissionDetail(userId, id);
    if (!detail) {
      return NextResponse.json({ error: "找不到這個總目標" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    console.error("讀取總目標失敗", error);
    return NextResponse.json({ error: "讀取失敗" }, { status: 500 });
  }
}
