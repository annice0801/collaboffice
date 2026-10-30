import { isValidObjectId } from "mongoose";
import { after, NextResponse, type NextRequest } from "next/server";
import { runMission } from "@/lib/agents/engine";
import { getUserIdFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { MissionModel } from "@/models/Mission";

// 繼續執行一個總目標：POST /api/missions/<id>/run（需要登入，只能操作自己的）
// 什麼時候會用到？
//   - 執行到一半時間用完而暫停（每次最多跑約 4 分鐘）
//   - 某一步出錯（例如 AI 暫時無法連線），修正後重試
//   - 開發時伺服器重啟，背景流程中斷
// 引擎會從資料庫的狀態判斷該從哪裡接著做，已經完成的步驟不會重做

export const maxDuration = 300;

export async function POST(request: NextRequest, ctx: RouteContext<"/api/missions/[id]/run">) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "id 格式錯誤" }, { status: 400 });
  }

  await connectDB();
  const mission = await MissionModel.findOne({ _id: id, owner: userId }, { status: 1, lockedUntil: 1 }).lean();
  if (!mission) return NextResponse.json({ error: "找不到這個總目標" }, { status: 404 });
  if (["completed", "failed", "cancelled"].includes(mission.status)) {
    return NextResponse.json({ error: "這個總目標已經結束" }, { status: 409 });
  }
  if (mission.lockedUntil && mission.lockedUntil > new Date()) {
    return NextResponse.json({ error: "正在執行中，請稍候" }, { status: 409 });
  }

  // 在背景執行，立刻回覆（202 Accepted：已接受，處理中）
  after(() => runMission(id).catch((error) => console.error("執行總目標失敗", error)));
  return NextResponse.json({ ok: true }, { status: 202 });
}
