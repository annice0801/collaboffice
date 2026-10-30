import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserIdFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { DeskNoteModel } from "@/models/DeskNote";

// 辦公桌筆記（第一人稱辦公桌畫面用，需要登入）
//   GET /api/desk → { notebook, stickies }
//   PUT /api/desk { notebook?, stickies? } → 存檔（有傳的欄位才更新）

const input = z.object({
  notebook: z.string().max(20000, "筆記最多兩萬字").optional(),
  stickies: z
    .array(z.object({ id: z.string().min(1).max(64), text: z.string().trim().min(1).max(200), color: z.enum(["yellow", "pink", "blue", "green"]).default("yellow") }))
    .max(12, "便利貼最多 12 張")
    .optional(),
});

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  await connectDB();
  const note = await DeskNoteModel.findOne({ owner: userId }).lean();
  return NextResponse.json({
    notebook: note?.notebook ?? "",
    stickies: (note?.stickies ?? []).map((s) => ({ id: s.id, text: s.text, color: s.color ?? "yellow" })),
  });
}

export async function PUT(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });
  await connectDB();
  await DeskNoteModel.updateOne({ owner: userId }, { $set: parsed.data }, { upsert: true });
  return NextResponse.json({ ok: true });
}
