import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// 所有 /api/auth/... 的請求（註冊、登入、登出、取得 session）都交給 Better Auth 處理。
// [...all] 代表「這個資料夾底下的任何路徑」都會進到這支程式
export const { GET, POST } = toNextJsHandler(auth);
