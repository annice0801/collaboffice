import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { resetModelInDev } from "./define";

// 問題回報（reports 資料表）：使用者在畫面上按「回報問題」送出。
// 之後的後台管理會讀這張表（處理狀態、回覆）。
const reportSchema = new Schema(
  {
    owner: { type: String, required: true }, // 回報的會員
    email: { type: String }, //                 方便後台聯絡
    where: { type: String, required: true }, // 在哪裡遇到（例如「交辦事項：下個月 IG 貼文」「會議室」）
    message: { type: String, required: true, maxlength: 4000 }, // 使用者描述
    context: { type: Schema.Types.Mixed }, //   自動附上的資料（錯誤訊息、相關 id、網址、瀏覽器）
    status: { type: String, enum: ["open", "in_progress", "resolved"], default: "open" },
    reply: { type: String }, //                 後台的回覆（之後做）
  },
  { timestamps: true },
);
reportSchema.index({ status: 1, createdAt: -1 });

export type Report = InferSchemaType<typeof reportSchema>;

resetModelInDev("Report");
export const ReportModel: Model<Report> = (models.Report as Model<Report>) ?? model<Report>("Report", reportSchema);
