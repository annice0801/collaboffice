import "server-only";
import { del, put } from "@vercel/blob";
import type { Attachment } from "@/models/schemas/attachment";

// 整個專案的檔案儲存規則：
//   檔案本體（圖片、PDF、文件…）→ 放 Vercel Blob
//   MongoDB → 只存 Blob 回傳的網址與基本資訊（見 models/schemas/attachment.ts）
// 這樣資料庫保持輕量，檔案則由 Blob 的 CDN 負責傳送。

// 讀取 Vercel Blob 的讀寫金鑰。
// 去掉頭尾的空白與引號：從 .env.local 複製到 Vercel 後台時，常會連引號一起貼上，
// 結果造成「Access denied」，這裡先幫忙清掉。
export function blobToken(): string | undefined {
  const raw = process.env.BLOB_READ_WRITE_TOKEN;
  return raw ? raw.trim().replace(/^["']|["']$/g, "").trim() : undefined;
}

// Vercel Blob 產生的網址都長這樣：https://<store id>.public.blob.vercel-storage.com/...
// 用來檢查前端送來的網址，確定是我們自己 Blob 裡的檔案，而不是任意外部連結
export function isBlobUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    // new URL() 遇到格式錯誤的字串會丟出錯誤，這種一律視為不合法
    return false;
  }
}

// 把檔名裡可能造成問題的字元換掉（斜線會被當成資料夾、空白在網址裡要轉碼…）。
// 中文保留，方便辨識；其餘特殊符號換成 "-"
function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "file";
}

type UploadOptions = {
  // 放在 Blob 裡的哪個資料夾，例如 "uploads"、"missions/<id>"、"results/<taskId>"
  folder: string;
  // 原始檔名（會被清理過）
  name: string;
  contentType: string;
};

// 上傳一個檔案到 Vercel Blob，回傳可以直接存進 MongoDB 的附件資料。
// 使用者上傳檔案、以及之後 Agent 產出檔案（例如生成的圖片），都走這個函式。
export async function uploadToBlob(
  body: Blob | ArrayBuffer | Buffer | string,
  { folder, name, contentType }: UploadOptions,
): Promise<Attachment> {
  const fileName = safeFileName(name);

  const blob = await put(`${folder}/${fileName}`, body, {
    // 公開讀取：拿到網址的人都能看到檔案。
    // （如果你在 Vercel 建立的是 Private 儲存空間，這裡要改成 "private"）
    access: "public",
    // 自動在檔名後面加一串亂碼，避免同名檔案互相覆蓋，也讓網址難以被猜到
    addRandomSuffix: true,
    contentType,
    token: blobToken(),
  });

  // Blob 的 put 不會回傳檔案大小，所以自己算
  const size =
    typeof body === "string"
      ? Buffer.byteLength(body)
      : body instanceof Blob
        ? body.size
        : body.byteLength;

  return {
    url: blob.url,
    pathname: blob.pathname,
    name,
    contentType,
    size,
  };
}

// 刪除 Blob 裡的檔案（傳入網址即可）。
// 刪除資料庫紀錄時記得一起呼叫，否則檔案會變成沒人引用的「孤兒檔案」繼續佔空間
export async function deleteFromBlob(urls: string | string[]): Promise<void> {
  await del(urls, { token: blobToken() });
}
