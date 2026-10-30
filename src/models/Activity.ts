import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { ACTIVITY_TYPES } from "@/lib/company";
import { resetModelInDev } from "./define";

// 進度紀錄（activities 資料表）
// 像公司的工作日誌：誰、在什麼時候、做了什麼。
// 畫面上的「即時進度」時間軸就是讀這張表，按時間排列顯示。
// 只新增、不修改，所以是完整的歷史紀錄。
const activitySchema = new Schema(
  {
    owner: { type: String, required: true }, // 屬於哪位會員（跟總目標相同）
    mission: { type: Schema.Types.ObjectId, ref: "Mission", required: true },
    task: { type: Schema.Types.ObjectId, ref: "Task", default: null }, // 跟總目標本身有關的紀錄就留空
    actor: { type: String, required: true }, // 做這件事的人，例如 "general_manager" 或 "user"
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    message: { type: String, required: true }, // 給人看的一句話，例如「研發部經理開始處理任務」
    progress: { type: Number, min: 0, max: 100 }, // 當下的進度（有的話）
    // 其他補充資料，格式不固定（例如狀態從什麼變成什麼、錯誤訊息）
    meta: { type: Schema.Types.Mixed },
  },
  // 紀錄只會新增不會修改，所以只需要 createdAt
  { timestamps: { createdAt: true, updatedAt: false } },
);

activitySchema.index({ mission: 1, createdAt: 1 });
activitySchema.index({ task: 1, createdAt: 1 });

export type Activity = InferSchemaType<typeof activitySchema>;

resetModelInDev("Activity");
export const ActivityModel: Model<Activity> =
  (models.Activity as Model<Activity>) ?? model<Activity>("Activity", activitySchema);
