import mongoose from "mongoose";

// 開發模式下，先把舊的 Model 刪掉，讓下面的 model() 用最新的欄位規則重新建立。
//
// 為什麼需要這個函式？
// 開發模式下改了檔案（例如在 lib/company.ts 新增部門），Next.js 會重新執行 Model 檔案，
// 但 mongoose 已經記住舊的 Model，直接沿用就會拿到舊的欄位規則（例如舊的部門清單）。
// 正式環境模組只會載入一次，不需要這麼做。
export function resetModelInDev(name: string): void {
  if (process.env.NODE_ENV !== "production" && mongoose.models[name]) {
    mongoose.deleteModel(name);
  }
}
