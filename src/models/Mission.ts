import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { MISSION_STATUSES } from "@/lib/company";
import { attachmentSchema } from "./schemas/attachment";
import { resetModelInDev } from "./define";

// 總目標（missions 資料表）
// 你交給總經理的一件事，例如「幫我規劃一個咖啡店品牌官網」。
// 底下所有任務（Task）、成果（TaskResult）、進度紀錄（Activity）都會用 mission 欄位指回這裡。
const missionSchema = new Schema(
  {
    // 屬於哪位會員（Better Auth 的 user.id）。所有查詢都會加上這個條件，確保每個人只看得到自己的資料
    owner: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 }, // 標題，列表顯示用
    goal: { type: String, required: true, trim: true, maxlength: 10000 }, // 總目標的完整描述
    attachments: { type: [attachmentSchema], default: [] }, // 你附上的參考檔案（存 Blob 網址）

    status: { type: String, enum: MISSION_STATUSES, default: "pending" },
    // 整體進度 0–100，由各部門任務的進度平均算出（見 lib/office.ts 的 recomputeMissionProgress）
    progress: { type: Number, min: 0, max: 100, default: 0 },

    // 總經理拆解任務後寫下的整體規劃說明
    plan: { type: String, default: "" },

    // 總經理最後的驗收報告
    finalReport: {
      content: { type: String }, // 驗收總結：做了什麼、成果在哪、還有什麼風險
      attachments: { type: [attachmentSchema], default: [] }, // 最終交付的檔案
      reviewedAt: { type: Date },
    },

    completedAt: { type: Date }, // 完成（或失敗、取消）的時間

    // 執行鎖：有 Agent 正在處理這個總目標時，鎖到這個時間為止，
    // 避免同時有兩個流程處理同一個總目標、重複分派或重複審查
    lockedUntil: { type: Date, default: null },
  },
  // timestamps: true 會自動加上 createdAt（建立時間）和 updatedAt（最後修改時間）
  { timestamps: true },
);

// 索引：讓「列出某位會員的總目標（新到舊）」和「找出某狀態的總目標」查詢更快
missionSchema.index({ owner: 1, createdAt: -1 });
missionSchema.index({ owner: 1, status: 1, createdAt: -1 });

export type Mission = InferSchemaType<typeof missionSchema>;

resetModelInDev("Mission");
export const MissionModel: Model<Mission> =
  (models.Mission as Model<Mission>) ?? model<Mission>("Mission", missionSchema);
