import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { MeetingModel } from "@/models/Meeting";

// 過往會議紀錄清單：GET /api/meetings（最新的在前面，最多 30 場）
export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  await connectDB();
  const meetings = await MeetingModel.find({ owner: userId }, { title: 1, attendees: 1, createdAt: 1, updatedAt: 1, rounds: 1 })
    .sort({ updatedAt: -1 })
    .limit(30)
    .lean();
  return NextResponse.json({
    meetings: meetings.map((m) => ({
      id: m._id.toString(),
      title: m.title,
      attendees: m.attendees,
      rounds: m.rounds.length,
      applied: m.rounds.some((r) => r.applied),
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    })),
  });
}
