import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getOrganization } from "@/lib/organization";
import { Office } from "./office";

// 辦公室：/office（需要登入）
//
// 這個專案開啟了 Cache Components：頁面會盡量預先產生。
// 但「誰登入了」每次請求都不同，不能預先產生，
// 所以讀取登入狀態的部分要包在 <Suspense> 裡，等請求進來時才執行。
export const metadata: Metadata = { title: "我的辦公室｜CollabOffice" };

export default function OfficePage() {
  return (
    <Suspense fallback={<p className="p-8 text-muted">載入辦公室中…</p>}>
      <OfficeGate />
    </Suspense>
  );
}

// 檢查登入：沒登入就導向登入頁；還沒建立部門就先去做問卷；都好了才進辦公室
async function OfficeGate() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const org = await getOrganization(user.id);
  if (!org) redirect("/onboarding");
  return <Office user={user} org={org} />;
}
