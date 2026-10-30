import { createAuthClient } from "better-auth/react";

// 瀏覽器端的會員功能（註冊、登入、登出）。
// 登入 API 和網站在同一個網址，所以直接用目前網頁的網址；
// 伺服器端預先產生頁面時不會呼叫登入 API，給一個固定值即可
export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? "http://localhost:3001" : window.location.origin,
});
