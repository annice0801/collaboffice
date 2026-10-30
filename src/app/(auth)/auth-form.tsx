"use client";

// 註冊與登入共用的表單。
// "use client"：這個元件在瀏覽器執行，才能處理輸入、按鈕點擊

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/logo";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // 阻止瀏覽器預設的「送出表單後整頁重新載入」
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    // Better Auth 會呼叫 /api/auth/...，成功後自動寫入登入 cookie
    const { error } = isSignUp
      ? await authClient.signUp.email({ name: String(form.get("name")), email, password })
      : await authClient.signIn.email({ email, password });

    setPending(false);
    if (error) {
      setError(
        error.status === 401 || error.code === "INVALID_EMAIL_OR_PASSWORD"
          ? "Email 或密碼錯誤"
          : error.code === "USER_ALREADY_EXISTS" || error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
            ? "這個 Email 已經註冊過了，請直接登入"
            : (error.message ?? "發生錯誤，請再試一次"),
      );
      return;
    }
    // 登入成功：進入辦公室；refresh 讓伺服器端重新讀取登入狀態
    router.push("/office");
    router.refresh();
  }

  // Google 登入：會跳轉到 Google 授權頁，授權後進入辦公室（第一次登入會自動註冊）
  async function signInWithGoogle() {
    setError(null);
    setPending(true);
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/office" });
    // 成功的話瀏覽器已經跳轉到 Google；只有失敗才會執行到這裡
    if (error) {
      setPending(false);
      setError(error.message ?? "Google 登入失敗，請再試一次");
    }
  }

  const inputClass =
    "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base outline-none transition focus:border-accent";

  return (
    // 寬螢幕：左邊品牌介紹、右邊表單；手機：只顯示表單
    <main className="grid flex-1 lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-paper lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-accent/40 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-2 font-semibold">
          <LogoMark />
          CollabOffice
        </Link>
        <div className="relative">
          <p className="font-serif text-4xl leading-tight font-bold">
            一句話交辦，
            <br />
            整間 AI 公司為你運轉
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-sm opacity-80">
            <li>✓ 秘書與總經理都能直接對話、交辦工作</li>
            <li>✓ 專員執行、經理審閱、總經理驗收</li>
            <li>✓ 每位會員的資料完全獨立</li>
          </ul>
        </div>
        <p className="relative text-xs opacity-50">© 2026 CollabOffice</p>
      </aside>

      <div className="flex items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2 font-semibold lg:hidden">
          <LogoMark />
          CollabOffice
        </Link>
        <h1 className="mt-8 font-serif text-3xl font-bold lg:mt-0">{isSignUp ? "開設你的辦公室" : "歡迎回來"}</h1>
        <p className="mt-2 text-sm text-muted">
          {isSignUp ? "建立帳號，開始交辦你的第一個目標" : "登入你的 AI 辦公室"}
        </p>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={pending}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 font-medium transition hover:border-ink/40 disabled:opacity-50"
        >
          {/* Google 標誌（官方四色 G） */}
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
            <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
          </svg>
          使用 Google {isSignUp ? "註冊" : "登入"}
        </button>

        <div className="my-6 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" />
          或使用 Email
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isSignUp && (
            <label className="flex flex-col gap-1 text-sm">
              名稱
              <input name="name" required maxLength={50} autoComplete="name" className={inputClass} />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input name="email" type="email" required autoComplete="email" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            密碼{isSignUp && <span className="text-xs text-muted">至少 8 個字元</span>}
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              className={inputClass}
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-full bg-ink px-4 py-2.5 font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "處理中…" : isSignUp ? "註冊" : "登入"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-muted">
          {isSignUp ? "已經有帳號？" : "還沒有帳號？"}
          <Link
            href={isSignUp ? "/sign-in" : "/sign-up"}
            className="ml-1 font-medium text-accent underline underline-offset-4"
          >
            {isSignUp ? "登入" : "註冊"}
          </Link>
        </p>
      </div>
      </div>
    </main>
  );
}
