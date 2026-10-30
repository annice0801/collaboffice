import "server-only";
import { z } from "zod";
import {
  BOSS_GENDERS,
  DEFAULT_EXECUTIVE_PERSONAS,
  EXECUTIVE_ASSISTANT,
  GENERAL_MANAGER,
  ID_PATTERN,
  managerOf,
  OFFICE_STYLE_IDS,
  READY_STYLES,
  type BossGender,
  type Department,
  type OfficeStyle,
  type Persona,
} from "./company";
import { connectDB } from "./mongodb";
import { OrganizationModel } from "@/models/Organization";

// 讀寫會員的公司組織（部門設定、辦公室風格）

export type OrgSettings = {
  companyName: string;
  officeStyle: OfficeStyle;
  bossGender: BossGender;
  departments: Department[];
};

// 部門設定的格式檢查：存檔前、AI 設計完都要通過這個檢查
const staffInput = z.object({
  id: z.string().regex(ID_PATTERN, "員工代號只能用英文小寫、數字、底線"),
  name: z.string().trim().min(1).max(30),
  nameEn: z.string().trim().max(60).default(""),
  duties: z.array(z.string().trim().min(1).max(200)).min(1).max(6),
});
// 主管背景的格式檢查
export const personaInput = z.object({
  background: z.string().trim().min(1, "請填寫背景").max(500),
  expertise: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  focus: z.string().trim().max(500).default(""),
  style: z.string().trim().max(200).default(""),
});

export const departmentInput = z.object({
  id: z.string().regex(ID_PATTERN, "部門代號只能用英文小寫、數字、底線"),
  name: z.string().trim().min(1).max(20),
  nameEn: z.string().trim().max(60).default(""),
  mission: z.string().trim().min(1).max(200),
  staff: z
    .array(staffInput)
    .min(1, "每個部門至少要有一位員工")
    .max(6, "每個部門最多 6 位員工")
    // 同一個部門裡員工代號不能重複
    .refine((list) => new Set(list.map((s) => s.id)).size === list.length, "員工代號重複"),
  knowledgeBases: z.array(z.string().trim().min(1).max(30)).max(6).optional(),
  managerPersona: personaInput.optional(),
  webSearch: z.boolean().optional(),
});
export const orgInput = z.object({
  companyName: z.string().trim().min(1).max(50).default("我的 AI 公司"),
  officeStyle: z.enum(OFFICE_STYLE_IDS).default("classic").refine((id) => READY_STYLES.includes(id), "這個主題還在製作中"),
  bossGender: z.enum(BOSS_GENDERS).default("neutral"),
  departments: z
    .array(departmentInput)
    .min(1, "至少要有一個部門")
    .max(8, "最多 8 個部門")
    .refine((list) => new Set(list.map((d) => d.id)).size === list.length, "部門代號重複"),
});

// 讀取會員的組織；還沒做問卷的會員回傳 null
export async function getOrganization(owner: string): Promise<OrgSettings | null> {
  await connectDB();
  const org = await OrganizationModel.findOne({ owner }).lean();
  if (!org) return null;
  // 轉成單純的物件（去掉 mongoose 的額外欄位），才能安全地傳給畫面
  return {
    companyName: org.companyName,
    officeStyle: org.officeStyle as OfficeStyle,
    bossGender: (org.bossGender ?? "neutral") as BossGender,
    departments: org.departments.map((d) => ({
      id: d.id,
      name: d.name,
      nameEn: d.nameEn,
      mission: d.mission,
      staff: d.staff.map((s) => ({ id: s.id, name: s.name, nameEn: s.nameEn, duties: [...s.duties] })),
      ...(d.knowledgeBases?.length ? { knowledgeBases: [...d.knowledgeBases] } : {}),
      ...(d.managerPersona?.background ? { managerPersona: toPersona(d.managerPersona) } : {}),
      ...(d.webSearch ? { webSearch: true } : {}),
    })),
  };
}

// 資料庫裡的背景 → 單純的物件
function toPersona(p: { background?: string | null; expertise?: string[] | null; focus?: string | null; style?: string | null }): Persona {
  return { background: p.background ?? "", expertise: [...(p.expertise ?? [])], focus: p.focus ?? "", style: p.style ?? "" };
}

// 首席秘書或總經理的背景：有設定用設定的，沒有用預設值
export async function getExecutivePersona(owner: string, agent: typeof EXECUTIVE_ASSISTANT | typeof GENERAL_MANAGER): Promise<Persona> {
  await connectDB();
  const org = await OrganizationModel.findOne({ owner }, { executivePersonas: 1 }).lean();
  const saved = org?.executivePersonas?.[agent];
  return saved?.background ? toPersona(saved) : DEFAULT_EXECUTIVE_PERSONAS[agent];
}

// 修改主管的背景：秘書、總經理存在 executivePersonas；部門經理存在自己部門的 managerPersona
export async function savePersona(owner: string, agent: string, persona: Persona): Promise<boolean> {
  await connectDB();
  if (agent === EXECUTIVE_ASSISTANT || agent === GENERAL_MANAGER) {
    const result = await OrganizationModel.updateOne({ owner }, { $set: { [`executivePersonas.${agent}`]: persona } });
    return result.matchedCount > 0;
  }
  const deptId = agent.replace(/\.manager$/, "");
  if (agent !== managerOf(deptId)) return false;
  const result = await OrganizationModel.updateOne({ owner, "departments.id": deptId }, { $set: { "departments.$.managerPersona": persona } });
  return result.matchedCount > 0;
}

// Agent 處理任務時用：一定要有組織，沒有就是資料有問題
export async function requireDepartments(owner: string): Promise<Department[]> {
  const org = await getOrganization(owner);
  if (!org) throw new Error("這位會員還沒有建立部門");
  return org.departments;
}

// 建立或更新組織（upsert：沒有就新增、有就更新）
export async function saveOrganization(
  owner: string,
  input: z.infer<typeof orgInput>,
  answers?: unknown,
): Promise<void> {
  await connectDB();
  await OrganizationModel.updateOne(
    { owner },
    { $set: { ...input, ...(answers !== undefined && { answers }) } },
    { upsert: true },
  );
}

// 只改你的人物（性別）
export async function setBossGender(owner: string, bossGender: BossGender): Promise<boolean> {
  await connectDB();
  const result = await OrganizationModel.updateOne({ owner }, { bossGender });
  return result.matchedCount > 0;
}

// 開關某個部門的網路搜尋
export async function setDepartmentWebSearch(owner: string, deptId: string, webSearch: boolean): Promise<boolean> {
  await connectDB();
  const result = await OrganizationModel.updateOne({ owner, "departments.id": deptId }, { $set: { "departments.$.webSearch": webSearch } });
  return result.matchedCount > 0;
}

// 只改辦公室風格
export async function setOfficeStyle(owner: string, officeStyle: OfficeStyle): Promise<boolean> {
  await connectDB();
  const result = await OrganizationModel.updateOne({ owner }, { officeStyle });
  return result.matchedCount > 0;
}
