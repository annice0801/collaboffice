"use client";

// 首頁的立體辦公室展示：用範例部門與模擬資料，右上角可以切換辦公室主題
import { useState } from "react";
import { OfficeFloor } from "@/app/office/floor/office-floor";
import { DEFAULT_DEPARTMENTS, type OfficeStyle } from "@/lib/company";

export function ShowcaseFloor() {
  const [style, setStyle] = useState<OfficeStyle>("campus");
  return <OfficeFloor demo departments={DEFAULT_DEPARTMENTS} style={style} onStyleChange={setStyle} />;
}
