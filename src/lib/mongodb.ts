// 這行保證這個檔案只會在伺服器端執行；
// 如果有人不小心在瀏覽器端（Client Component）import 它，build 時就會直接報錯，
// 避免資料庫連線字串被打包進前端程式碼外洩。
import "server-only";
import mongoose from "mongoose";

// 從 .env.local 讀取 MongoDB 連線字串
const MONGODB_URI = process.env.MONGODB_URI;

// 連線快取的型別：
// - conn：已經建立好的連線
// - promise：正在建立中的連線（還沒連完）
type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// 為什麼要把連線存在 globalThis？
// 開發模式下每次存檔，Next.js 會重新執行模組（HMR），
// 如果把連線存在一般變數，每存一次檔就會多開一條連線，很快就會把資料庫連線數用光。
// globalThis 在重新執行模組時不會被清掉，所以能重複使用同一條連線。
const globalForMongoose = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

// ??= 的意思是：如果左邊是 undefined 或 null，才把右邊的值指定給它
const cache: MongooseCache = (globalForMongoose.mongooseCache ??= {
  conn: null,
  promise: null,
});

// 所有要讀寫資料庫的地方，開頭都先 await connectDB()
export async function connectDB(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error("請在 .env.local 設定 MONGODB_URI");
  }

  // 已經連上了，直接回傳
  if (cache.conn) return cache.conn;

  // 還沒開始連線才發起連線；
  // 如果同時有好幾個請求進來，大家會等待同一個 promise，不會各自開連線
  cache.promise ??= mongoose.connect(MONGODB_URI, {
    // 關閉指令緩衝：沒連上時直接報錯，而不是默默排隊等到逾時
    bufferCommands: false,
  });

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    // 連線失敗就清掉 promise，下次呼叫才會重新嘗試，而不是一直拿到同一個失敗結果
    cache.promise = null;
    throw error;
  }

  return cache.conn;
}
