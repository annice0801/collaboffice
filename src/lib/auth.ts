import "server-only";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { MongoClient } from "mongodb";
import { headers } from "next/headers";

// 會員系統（Better Auth）。
// 會員、登入狀態（session）、帳號資料存在同一個 MongoDB 資料庫的
// user、session、account、verification 這幾個資料表，由 Better Auth 自己管理。
//
// 每位會員的 user.id 會存進總目標、任務、成果、進度紀錄的 owner 欄位，
// 所有查詢都會加上 owner 條件，所以每個人只看得到、只能操作自己辦公室的資料。

// Better Auth 需要原生的 MongoDB 連線（不是 mongoose）。
// 同樣存在 globalThis，避免開發模式每次存檔都開新連線
const globalForAuth = globalThis as typeof globalThis & { authMongoClient?: MongoClient };
const client = (globalForAuth.authMongoClient ??= new MongoClient(process.env.MONGODB_URI ?? ""));

export const auth = betterAuth({
  // 登入相關網址的根網址（本機開發是 http://localhost:3001）
  baseURL: process.env.BETTER_AUTH_URL,
  // client.db() 不指定名稱時，會用連線字串裡的資料庫（collaboffice）
  database: mongodbAdapter(client.db(), { client }),
  // 用 Email + 密碼註冊登入
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  // Google 一鍵登入：金鑰從 .env.local 讀取。
  // 第一次用 Google 登入時會自動註冊：user 資料表新增一筆會員（email、名稱、頭像），
  // account 資料表記錄 providerId: "google" 和 Google 帳號 id（accountId）
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  // 同一個 Email 先用密碼註冊、之後又用 Google 登入時，自動連結成同一位會員，
  // 資料才不會分散在兩個帳號（只信任 Google，因為 Google 已驗證過 Email）
  account: {
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  // nextCookies：讓 Server Action 裡登入時也能正確寫入 cookie
  plugins: [nextCookies()],
});

export type SessionUser = { id: string; name: string; email: string };

// Server Component 用：取得目前登入的會員，沒登入回傳 null
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
}

// API（Route Handler）用：從請求的 cookie 判斷是誰，沒登入回傳 null
export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}
