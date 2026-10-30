import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { resetModelInDev } from "./define";

// 會議紀錄（meetings 資料表）
// 在會議室召開的一場會議。每「提出一次想法」就是一輪（round），
// 記下你的想法、每位列席主管的發言、總經理的結論，以及你後來有沒有套用目標修訂、交辦執行。
const roundSchema = new Schema(
  {
    idea: { type: String, required: true }, //  你提出的想法
    opinions: { type: Schema.Types.Mixed, default: [] }, // 主管發言：[{ agent, department, stance, opinion, alignment, suggestions }]
    summary: { type: Schema.Types.Mixed }, // 總經理結論：{ conclusion, actions, goalChanges, visionChange }
    applied: { type: Boolean, default: false }, //    已套用目標修訂
    dispatched: { type: Boolean, default: false }, // 已把結論交辦給總經理
    mission: { type: Schema.Types.ObjectId, ref: "Mission" }, // 交辦後建立的總目標
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const meetingSchema = new Schema(
  {
    owner: { type: String, required: true },
    title: { type: String, required: true, maxlength: 100 }, // 用第一輪的想法當標題
    attendees: {
      departments: { type: [String], default: [] }, // 列席的部門
      assistant: { type: Boolean, default: false }, //  秘書是否列席
    },
    rounds: { type: [roundSchema], default: [] },
  },
  { timestamps: true },
);

meetingSchema.index({ owner: 1, updatedAt: -1 });

export type Meeting = InferSchemaType<typeof meetingSchema>;

resetModelInDev("Meeting");
export const MeetingModel: Model<Meeting> = (models.Meeting as Model<Meeting>) ?? model<Meeting>("Meeting", meetingSchema);
