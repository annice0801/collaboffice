import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getOrganization } from "@/lib/organization";
import { getTheme } from "@/themes";
import { DeskView } from "./desk-view";

// 我的辦公桌：/desk（需要登入）
// 在辦公室裡點自己的辦公桌時，用新分頁打開。畫面依辦公室主題不同（星際艦橋、校長書房、總裁辦公室、園區工作室）。
export const metadata: Metadata = { title: "我的辦公桌｜CollabOffice" };

export default function DeskPage() {
  return (
    <Suspense fallback={<p className="p-8 text-muted">走進辦公室中…</p>}>
      <DeskGate />
    </Suspense>
  );
}

async function DeskGate() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const org = await getOrganization(user.id);
  if (!org) redirect("/onboarding");
  return <DeskView outfit={getTheme(org.officeStyle).outfit} userName={user.name} companyName={org.companyName} />;
}
