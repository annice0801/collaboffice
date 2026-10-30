import { Schema, type InferSchemaType } from "mongoose";

// 附件（子文件）：檔案本體放在 Vercel Blob，這裡只記錄網址和基本資訊。
// 總目標、任務、成果都可能有附件，所以抽出來共用。
export const attachmentSchema = new Schema(
  {
    url: { type: String, required: true }, //      Blob 網址，前端直接用它顯示或下載
    pathname: { type: String, required: true }, // Blob 內的路徑，刪除或整理檔案時用
    name: { type: String, required: true }, //     原始檔名，顯示給人看
    contentType: { type: String, required: true }, // 檔案類型，例如 image/png、application/pdf
    size: { type: Number, required: true, min: 0 }, // 檔案大小（bytes）
  },
  // 附件不需要自己的 _id，它永遠跟著所屬的文件一起讀寫
  { _id: false },
);

// 從 schema 自動推導出 TypeScript 型別，不用自己再寫一次
export type Attachment = InferSchemaType<typeof attachmentSchema>;
