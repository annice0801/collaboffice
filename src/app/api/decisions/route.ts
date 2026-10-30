import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { DecisionModel } from "@/models/Decision";
import { MissionModel } from "@/models/Mission";

// 待你決定的事：GET /api/decisions?mission=<id>（不帶 mission 就是全部還沒決定的）
export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const mission = new URL(request.url).searchParams.get("mission");
  await connectDB();
  const decisions = await DecisionModel.find({ owner: userId, ...(mission ? { mission } : { status: "open" }) })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  const titles = new Map(
    (await MissionModel.find({ _id: { $in: decisions.map((d) => d.mission) } }, { title: 1 }).lean()).map((m) => [m._id.toString(), m.title]),
  );
  return NextResponse.json({
    decisions: decisions.map((d) => ({
      id: d._id.toString(),
      missionId: d.mission.toString(),
      mission: titles.get(d.mission.toString()) ?? "",
      agent: d.agent,
      kind: d.kind,
      blocking: d.blocking,
      title: d.title,
      situation: d.situation,
      options: d.options,
      status: d.status,
      choice: d.choice ?? null,
      note: d.note ?? "",
      createdAt: d.createdAt,
    })),
  });
}
