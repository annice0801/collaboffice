import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

// 註冊頁：/sign-up
export const metadata: Metadata = { title: "註冊｜CollabOffice" };

export default function SignUpPage() {
  return <AuthForm mode="sign-up" />;
}
