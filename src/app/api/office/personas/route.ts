import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserIdFromRequest } from "@/lib/auth";
import { EXECUTIVE_ASSISTANT, GENERAL_MANAGER, managerOf } from "@/lib/company";
import { getOrganization, personaInput, savePersona } from "@/lib/organization";

// 修改主管的背景：PUT /api/office/personas { agent, persona: { background, expertise, focus, style } }
// 只有首席秘書、總經理、部門經理有背景設定
const input = z.object({ agent: z.string().max(80), persona: personaInput });

export async function PUT(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });

  const org = await getOrganization(userId);
  const { agent, persona } = parsed.data;
  const allowed = [EXECUTIVE_ASSISTANT, GENERAL_MANAGER, ...(org?.departments.map((d) => managerOf(d.id)) ?? [])];
  if (!allowed.includes(agent)) return NextResponse.json({ error: "只有主管可以設定背景" }, { status: 400 });
  if (!(await savePersona(userId, agent, persona))) return NextResponse.json({ error: "儲存失敗" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
