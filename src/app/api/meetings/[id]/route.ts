import { isValidObjectId } from "mongoose";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserIdFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { MeetingModel } from "@/models/Meeting";

// 一場會議的完整紀錄：
//   GET    /api/meetings/<id> → 每一輪的想法、主管發言、總經理結論
//   PATCH  /api/meetings/<id> { round, applied?, dispatched? } → 記下這一輪已套用目標修訂、已交辦
//   DELETE /api/meetings/<id> → 刪除這場會議紀錄

type Ctx = RouteContext<"/api/meetings/[id]">;

async function ownerAndId(request: NextRequest, ctx: Ctx) {
  const userId = await getUserIdFromRequest(request);
  const { id } = await ctx.params;
  return { userId, id: isValidObjectId(id) ? id : null };
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const { userId, id } = await ownerAndId(request, ctx);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  if (!id) return NextResponse.json({ error: "找不到這場會議" }, { status: 404 });
  await connectDB();
  const meeting = await MeetingModel.findOne({ _id: id, owner: userId }).lean();
  if (!meeting) return NextResponse.json({ error: "找不到這場會議" }, { status: 404 });
  return NextResponse.json({
    id: meeting._id.toString(),
    title: meeting.title,
    attendees: meeting.attendees,
    createdAt: meeting.createdAt,
    rounds: meeting.rounds.map((r) => ({ idea: r.idea, opinions: r.opinions, summary: r.summary, applied: r.applied, dispatched: r.dispatched, missionId: r.mission?.toString() ?? null, createdAt: r.createdAt })),
  });
}

const patchInput = z.object({ round: z.number().int().min(0), applied: z.boolean().optional(), dispatched: z.boolean().optional() });

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { userId, id } = await ownerAndId(request, ctx);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const parsed = patchInput.safeParse(await request.json().catch(() => null));
  if (!id || !parsed.success) return NextResponse.json({ error: "資料格式錯誤" }, { status: 400 });
  const { round, ...flags } = parsed.data;
  const set = Object.fromEntries(Object.entries(flags).map(([k, v]) => [`rounds.${round}.${k}`, v]));
  await connectDB();
  await MeetingModel.updateOne({ _id: id, owner: userId }, { $set: set });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { userId, id } = await ownerAndId(request, ctx);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  if (id) {
    await connectDB();
    await MeetingModel.deleteOne({ _id: id, owner: userId });
  }
  return NextResponse.json({ ok: true });
}
