import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";
import { uploadToBlob } from "@/lib/blob";

// 上傳檔案：POST /api/files（需要登入）
// 前端用 FormData 送出，欄位名稱是 "file"。
// 流程：檔案 → Vercel Blob → 回傳附件資料（網址等），
// 前端再把這份附件資料放進「建立總目標」的請求裡，才會存進 MongoDB。

// 部署到 Vercel 時，伺服器函式能接收的請求最大約 4.5 MB，
// 所以這裡限制 4 MB。之後若需要上傳大檔，可以改成「瀏覽器直接上傳到 Blob」的方式
const MAX_SIZE = 4 * 1024 * 1024;

// 允許的檔案類型：圖片、PDF、純文字類、Office 文件
const ALLOWED_TYPES = [
  /^image\//,
  /^application\/pdf$/,
  /^text\//,
  /^application\/json$/,
  /^application\/vnd\.openxmlformats-officedocument\./, // .docx .xlsx .pptx
];

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  // 解析 FormData；如果送來的不是 FormData，formData() 會丟錯
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  // form.get 可能拿到字串（一般欄位）或 File（檔案），這裡確認是檔案
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "請用 file 欄位上傳檔案" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "檔案是空的" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "檔案不能超過 4 MB" }, { status: 413 });
  }
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.some((pattern) => pattern.test(contentType))) {
    return NextResponse.json({ error: `不支援的檔案類型：${contentType}` }, { status: 415 });
  }

  try {
    // 依會員和年月分資料夾，例如 users/<會員 id>/2026-10/，之後在 Blob 後台比較好找
    const month = new Date().toISOString().slice(0, 7);
    const attachment = await uploadToBlob(file, {
      folder: `users/${userId}/${month}`,
      name: file.name,
      contentType,
    });
    // 201 Created：成功建立了新資源
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    console.error("上傳到 Vercel Blob 失敗", error);
    return NextResponse.json({ error: "上傳失敗，請確認 BLOB_READ_WRITE_TOKEN 設定" }, { status: 500 });
  }
}
