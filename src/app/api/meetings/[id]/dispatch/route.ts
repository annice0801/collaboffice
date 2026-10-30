import { isValidObjectId } from "mongoose";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runMission } from "@/lib/agents/engine";
import { getUserIdFromRequest } from "@/lib/auth";
import { departmentName, GENERAL_MANAGER } from "@/lib/company";
import { connectDB } from "@/lib/mongodb";
import { createMission } from "@/lib/office";
import { getOrganization } from "@/lib/organization";
import { MeetingModel } from "@/models/Meeting";

// 把會議結論交辦給總經理：POST /api/meetings/<id>/dispatch { round }
// 直接用結論和行動項目建立總目標（不經過對話判斷），回傳 { missionId }，畫面接著打開交辦事項視窗。
// 同一輪已經交辦過的話，回傳原本的總目標，不會重複建立。

type Ctx = RouteContext<"/api/meetings/[id]/dispatch">;
const input = z.object({ round: z.number().int().min(0) });
type Summary = { conclusion: string; actions: { department: string; action: string }[] };

export async function POST(request: NextRequest, ctx: Ctx) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!isValidObjectId(id) || !parsed.success) return NextResponse.json({ error: "資料格式錯誤" }, { status: 400 });

  await connectDB();
  const meeting = await MeetingModel.findOne({ _id: id, owner: userId });
  const round = meeting?.rounds[parsed.data.round];
  const summary = round?.summary as Summary | undefined;
  if (!meeting || !round || !summary) return NextResponse.json({ error: "找不到這一輪的會議結論" }, { status: 404 });
  if (round.mission) return NextResponse.json({ missionId: round.mission.toString() });

  const org = await getOrganization(userId);
  const departments = org?.departments ?? [];
  const actions = summary.actions.map((a) => `- ${departmentName(departments, a.department)}：${a.action}`).join("\n");
  const mission = await createMission({
    owner: userId,
    title: `會議結論：${round.idea.replace(/\s+/g, " ").slice(0, 60)}`,
    goal: `依照會議結論執行。\n\n會議主題：${round.idea}\n\n結論：${summary.conclusion}${actions ? `\n\n行動項目：\n${actions}` : ""}`.slice(0, 10000),
    createdBy: GENERAL_MANAGER,
  });
  round.dispatched = true;
  round.mission = mission._id;
  await meeting.save();

  const missionId = mission._id.toString();
  after(() => runMission(missionId).catch((error) => console.error("執行總目標失敗", error)));
  return NextResponse.json({ missionId });
}
