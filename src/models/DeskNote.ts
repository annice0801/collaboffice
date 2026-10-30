import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { resetModelInDev } from "./define";

// 辦公桌筆記（desknotes 資料表）：第一人稱辦公桌畫面（/desk）上的筆記本與便利貼，一位會員一份。
const stickySchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, maxlength: 200 },
    color: { type: String, default: "yellow" }, // yellow、pink、blue、green
  },
  { _id: false },
);

const deskNoteSchema = new Schema(
  {
    owner: { type: String, required: true, unique: true },
    notebook: { type: String, default: "", maxlength: 20000 }, // 筆記本內容
    stickies: { type: [stickySchema], default: [] }, //           便利貼（最多 12 張）
  },
  { timestamps: true },
);

export type DeskNote = InferSchemaType<typeof deskNoteSchema>;

resetModelInDev("DeskNote");
export const DeskNoteModel: Model<DeskNote> = (models.DeskNote as Model<DeskNote>) ?? model<DeskNote>("DeskNote", deskNoteSchema);
