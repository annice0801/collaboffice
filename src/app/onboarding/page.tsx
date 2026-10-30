import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getOrganization } from "@/lib/organization";
import { Onboarding } from "./onboarding";

// 組建團隊問卷：/onboarding（需要登入）
// 新會員註冊後會先來這裡；已經有部門的會員也可以回來重新設計
export const metadata: Metadata = { title: "組建你的團隊｜CollabOffice" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<p className="p-8 text-muted">載入中…</p>}>
      <OnboardingGate />
    </Suspense>
  );
}

async function OnboardingGate() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const org = await getOrganization(user.id);
  return <Onboarding userName={user.name} existing={org} />;
}
