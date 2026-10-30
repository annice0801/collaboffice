import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { REVIEW_VERDICTS } from "@/lib/company";
import { attachmentSchema } from "./schemas/attachment";
import { resetModelInDev } from "./define";

// 任務成果（taskresults 資料表）
// 每「交一次」就新增一筆，不會覆蓋舊的。
// 所以一個任務被退回兩次再通過，會有三筆成果，可以看出每一版改了什麼、為什麼被退。
const taskResultSchema = new Schema(
  {
    owner: { type: String, required: true }, // 屬於哪位會員（跟總目標相同）
    task: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    mission: { type: Schema.Types.ObjectId, ref: "Mission", required: true }, // 冗餘存一份，方便直接查整個總目標的成果
    submittedBy: { type: String, required: true }, // 交出成果的 Agent，例如 "intel.crawler"
    attempt: { type: Number, required: true, min: 1 }, // 第幾次交（1、2、3…）

    content: { type: String, required: true }, // 成果內容（文字或 Markdown）
    attachments: { type: [attachmentSchema], default: [] }, // 產出的檔案（存 Blob 網址）

    // 上級的審閱結果；剛交出時還沒審，整個 review 是空的
    review: {
      reviewer: { type: String }, //  審閱者，例如 "intel.manager"、"general_manager"
      verdict: { type: String, enum: REVIEW_VERDICTS },
      comments: { type: String }, //  審閱意見
      issues: { type: [String], default: undefined }, // 具體要修改的問題清單
      reviewedAt: { type: Date },
    },

    // 這次產出用了哪個 AI 模型、花了多少 token，之後可以拿來算成本
    usage: {
      model: { type: String },
      inputTokens: { type: Number },
      outputTokens: { type: Number },
      webSearches: { type: Number }, // 上網搜尋了幾次（每 1,000 次 10 美元）
    },
  },
  { timestamps: true },
);

// 依交出順序列出某個任務的所有成果
taskResultSchema.index({ task: 1, attempt: 1 }, { unique: true });
taskResultSchema.index({ mission: 1, createdAt: 1 });

export type TaskResult = InferSchemaType<typeof taskResultSchema>;

resetModelInDev("TaskResult");
export const TaskResultModel: Model<TaskResult> =
  (models.TaskResult as Model<TaskResult>) ?? model<TaskResult>("TaskResult", taskResultSchema);
