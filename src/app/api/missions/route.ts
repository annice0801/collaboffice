import { after, NextResponse } from "next/server";
import { z } from "zod";
import { runMission } from "@/lib/agents/engine";
import { getUserIdFromRequest } from "@/lib/auth";
import { getOrganization } from "@/lib/organization";
import { isBlobUrl } from "@/lib/blob";
import { createMission, listMissions } from "@/lib/office";

// 用 zod 定義「請求內容應該長什麼樣子」。
// 前端送來的資料不能信任，先檢查格式正確才存進資料庫
const attachmentInput = z.object({
  // 只接受我們自己 Blob 裡的網址，避免存進任意外部連結
  url: z.string().refine(isBlobUrl, "附件必須是 Vercel Blob 的網址"),
  pathname: z.string().min(1),
  name: z.string().min(1).max(255),
  contentType: z.string().min(1),
  size: z.number().int().min(0),
});

const createMissionInput = z.object({
  title: z.string().trim().min(1, "請輸入標題").max(200),
  goal: z.string().trim().min(1, "請描述總目標").max(10000),
  attachments: z.array(attachmentInput).max(10).default([]),
});

// 列出自己的總目標：GET /api/missions（需要登入）
// 讀取了請求的 cookie（判斷是誰），所以每次請求都會即時執行，不會被預先產生成固定內容
export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  try {
    const missions = await listMissions(userId);
    return NextResponse.json({ missions });
  } catch (error) {
    console.error("讀取總目標失敗", error);
    return NextResponse.json({ error: "讀取失敗，請確認 MONGODB_URI 設定" }, { status: 500 });
  }
}

// 直接建立總目標（不經過秘書）：POST /api/missions（需要登入）
// 內容範例：{ "title": "咖啡店官網", "goal": "幫我規劃…", "attachments": [] }
// 建立後會在背景開始執行
export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  // 還沒完成問卷、沒有部門的話，沒有人可以接工作
  if (!(await getOrganization(userId))) {
    return NextResponse.json({ error: "請先完成問卷，建立你的部門" }, { status: 409 });
  }

  // safeParse 不會丟錯，而是回傳 { success, data } 或 { success, error }
  const parsed = createMissionInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // 只回傳第一個錯誤訊息，前端直接顯示給使用者
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" },
      { status: 400 },
    );
  }

  // 附件只能是自己上傳的檔案（上傳時放在 users/<會員 id>/ 底下），不能引用別人的檔案
  const notMine = parsed.data.attachments.some(
    (a) => !a.pathname.startsWith(`users/${userId}/`) || !a.url.endsWith(`/${a.pathname}`),
  );
  if (notMine) {
    return NextResponse.json({ error: "附件必須是你自己上傳的檔案" }, { status: 403 });
  }

  try {
    const mission = await createMission({ ...parsed.data, owner: userId });
    const missionId = mission._id.toString();
    after(() => runMission(missionId).catch((error) => console.error("執行總目標失敗", error)));
    return NextResponse.json({ mission }, { status: 201 });
  } catch (error) {
    console.error("建立總目標失敗", error);
    return NextResponse.json({ error: "建立失敗，請確認 MONGODB_URI 設定" }, { status: 500 });
  }
}
