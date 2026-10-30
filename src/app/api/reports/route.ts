import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { ReportModel } from "@/models/Report";

// 回報問題：POST /api/reports { where, message, context }
// 存進資料庫，之後由後台管理處理
const input = z.object({
  where: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1, "請描述遇到的問題").max(4000),
  context: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });
  // 附加資料限制大小，避免塞進太大的內容
  const context = JSON.stringify(parsed.data.context).length > 20000 ? { truncated: true } : parsed.data.context;
  await connectDB();
  const report = await ReportModel.create({ owner: user.id, email: user.email, where: parsed.data.where, message: parsed.data.message, context });
  return NextResponse.json({ id: report._id.toString() });
}
