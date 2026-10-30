import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

// 登入頁：/sign-in
// (auth) 資料夾名稱有括號，代表只用來整理檔案，不會出現在網址裡
export const metadata: Metadata = { title: "登入｜CollabOffice" };

export default function SignInPage() {
  return <AuthForm mode="sign-in" />;
}
