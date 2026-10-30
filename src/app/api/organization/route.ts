import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserIdFromRequest } from "@/lib/auth";
import { BOSS_GENDERS, OFFICE_STYLE_IDS, READY_STYLES } from "@/lib/company";
import { getOrganization, orgInput, saveOrganization, setBossGender, setOfficeStyle } from "@/lib/organization";

// 會員的公司組織（需要登入，只能讀寫自己的）
//   GET   /api/organization → 讀取部門設定與辦公室風格；還沒建立回傳 { organization: null }
//   PUT   /api/organization → 建立或整份更新（問卷確認後呼叫）
//   PATCH /api/organization → 只改辦公室主題或你的人物 { officeStyle?, bossGender? }

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  return NextResponse.json({ organization: await getOrganization(userId) });
}

export async function PUT(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = orgInput.safeParse(body?.organization);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });
  }
  await saveOrganization(userId, parsed.data, body?.answers);
  return NextResponse.json({ organization: await getOrganization(userId) });
}

// 只改辦公室主題或你的人物（兩個至少要有一個）
const patchInput = z
  .object({ officeStyle: z.enum(OFFICE_STYLE_IDS).refine((id) => READY_STYLES.includes(id)).optional(), bossGender: z.enum(BOSS_GENDERS).optional() })
  .refine((v) => v.officeStyle || v.bossGender, "沒有要修改的內容");

export async function PATCH(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const parsed = patchInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "不支援的設定" }, { status: 400 });
  const { officeStyle, bossGender } = parsed.data;
  if (bossGender && !(await setBossGender(userId, bossGender))) {
    return NextResponse.json({ error: "請先完成問卷建立部門" }, { status: 404 });
  }
  if (officeStyle && !(await setOfficeStyle(userId, officeStyle))) {
    return NextResponse.json({ error: "請先完成問卷建立部門" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
