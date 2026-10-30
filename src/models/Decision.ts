import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { resetModelInDev } from "./define";

// 待你決定的事（decisions 資料表）
// 工作遇到狀況、需要老闆決定下一步時建立一筆，負責的人頭上會出現「❗」。
// 老闆點他就看得到：遇到什麼困難（situation）、有哪些方案（options）、各方案的結果（outcome），選一個下達決定。
//   task_failed  ：退回次數用完仍不合格、或被判定不通過（會擋住流程，等你決定才繼續）
//   missing_data ：成果裡有「待取得資料」的部分（不擋流程，問你要不要補資料）
//   run_error    ：流程執行中斷（問你要重試還是先暫停）
const optionSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true }, //   方案
    outcome: { type: String, required: true }, // 選這個會發生什麼
    needsNote: { type: Boolean, default: false }, // 需要你補充說明（例如提供資料）
  },
  { _id: false },
);

const decisionSchema = new Schema(
  {
    owner: { type: String, required: true },
    mission: { type: Schema.Types.ObjectId, ref: "Mission", required: true },
    task: { type: Schema.Types.ObjectId, ref: "Task", default: null },
    agent: { type: String, required: true }, // 提出的人（頭上出現 ❗ 的人）
    kind: { type: String, enum: ["task_failed", "missing_data", "run_error"], required: true },
    blocking: { type: Boolean, default: false }, // 是否擋住流程（等你決定才繼續）
    title: { type: String, required: true }, //    一句話標題
    situation: { type: String, required: true }, // 遇到的困難
    options: { type: [optionSchema], default: [] },
    status: { type: String, enum: ["open", "decided"], default: "open" },
    choice: { type: String },
    note: { type: String },
    decidedAt: { type: Date },
  },
  { timestamps: true },
);

decisionSchema.index({ owner: 1, status: 1 });
decisionSchema.index({ mission: 1, status: 1 });

export type Decision = InferSchemaType<typeof decisionSchema>;

resetModelInDev("Decision");
export const DecisionModel: Model<Decision> = (models.Decision as Model<Decision>) ?? model<Decision>("Decision", decisionSchema);
