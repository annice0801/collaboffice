import "server-only";
import { z } from "zod";
import { askStructured, MODELS } from "@/lib/ai/claude";
import { ID_PATTERN, OFFICE_STYLE_IDS, OFFICE_STYLES, type Department, type OfficeStyle } from "@/lib/company";

// 組織設計顧問：依會員在問卷的回答，設計這位會員需要的部門與員工。
// 設計結果先給會員看過、確認後才會存檔（見 /api/organization）。

export const answersInput = z.object({
  companyName: z.string().trim().max(50).optional(),
  identity: z.string().trim().min(1, "請選擇你的身分").max(50),
  areas: z.array(z.string().trim().min(1).max(50)).min(1, "請至少選一個想交給團隊的領域").max(12),
  timeSinks: z.string().trim().max(1000).default(""),
  size: z.enum(["small", "medium", "large"]),
  vibe: z.array(z.string().trim().max(60)).max(6).default([]), // 喜好題的回答（理想的週末、夢想的辦公地點）
});
export type Answers = z.infer<typeof answersInput>;

const SIZE_HINT = {
  small: "精簡：3 個部門，每個部門 2～3 位員工",
  medium: "標準：4～5 個部門，每個部門 2～4 位員工",
  large: "完整：6～8 個部門，每個部門 2～5 位員工",
};

const SYSTEM = `你是 CollabOffice 的組織設計顧問。CollabOffice 是一間由 AI Agent 組成的公司：
老闆底下有兩位同職級的核心主管——首席秘書（負責老闆的生活、健康、日程、晨報）和總經理（負責接收工作、拆解分派、驗收）。
總經理底下有好幾個部門，每個部門有一位部門經理（負責分派、審閱、把關）和幾位員工（實際執行）。

你的工作：依照老闆在問卷的回答，設計最適合他的部門與員工。

設計原則：
- 部門要對應老闆真正會交辦的工作，不要放用不到的部門。
- 生活、健康、行程、提醒由首席秘書負責，不要另外設部門。
- 每位員工的職責要具體、可以直接拿來分派工作（例如「把 20 則新聞整理成 3 行市場結論與風險警示」），2～4 條。
- 同一部門內員工分工不要重疊。
- 員工不能操作外部系統（自動發文、寄信、行事曆），這類職責寫成「產出草稿／準備資料」的形式。
- 需要最新資料（新聞、股價、市場行情、法規更新、競品動態）的部門，webSearch 設為 true，員工就能上網搜尋（每次搜尋另外計費）；其他部門設為 false。
- name、mission、duties 一律使用繁體中文；nameEn 用簡短英文。
- 每個部門經理都要設計符合部門專業的背景（managerPersona）：例如法務相關部門的經理要有法律背景、會審查法規與合約風險；行銷部門經理要有品牌與社群操盤經驗。背景要具體、可信，但不要寫真實人名或公司名。
- id 用英文小寫與底線，例如 market_intel、copywriter；同一份設計裡部門 id 不重複，同部門內員工 id 不重複。

另外，依老闆的身分、工作領域與喜好，從下面的辦公室主題挑一個最適合他的（theme），並用一句話說明理由（themeReason）：
${OFFICE_STYLES.map((s) => `- ${s.id}：${s.name}（${s.description}）`).join("\n")}`;

const designSchema = z.object({
  theme: z.enum(OFFICE_STYLE_IDS),
  themeReason: z.string().describe("為什麼適合這個主題，一句話"),
  departments: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      nameEn: z.string(),
      mission: z.string().describe("部門定位，一句話"),
      webSearch: z.boolean().describe("這個部門的工作是否需要上網查最新資料"),
      // 部門經理的背景：開會、審查時依這個專業角度判斷
      managerPersona: z.object({
        background: z.string().describe("學經歷，一兩句"),
        expertise: z.array(z.string()).describe("3～5 項專長"),
        focus: z.string().describe("審查成果、開會發言時特別注意的地方"),
        style: z.string().describe("說話風格，一句話"),
      }),
      staff: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          nameEn: z.string(),
          duties: z.array(z.string()),
        }),
      ),
    }),
  ),
});

// 把 AI 給的代號整理成合法格式；不合法或重複時改用編號
function cleanIds<T extends { id: string }>(items: T[], prefix: string): T[] {
  const used = new Set<string>();
  return items.map((item, i) => {
    let id = item.id.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "").slice(0, 24);
    if (!ID_PATTERN.test(id) || used.has(id)) id = `${prefix}${i + 1}`;
    used.add(id);
    return { ...item, id };
  });
}

export async function designDepartments(answers: Answers): Promise<{ departments: Department[]; theme: OfficeStyle; themeReason: string }> {
  const { data } = await askStructured({
    model: MODELS.executive,
    system: SYSTEM,
    user: `老闆的問卷回答：
- 身分：${answers.identity}
- 想交給團隊處理的領域：${answers.areas.join("、")}
- 目前最花時間、最想交出去的事：${answers.timeSinks || "（沒有填寫）"}
- 團隊規模：${SIZE_HINT[answers.size]}
- 喜好：${answers.vibe.join("、") || "（沒有填寫）"}

請設計部門。`,
    schema: designSchema,
    effort: "medium",
  });

  const departments = cleanIds(data.departments, "dept").map((dept) => ({
    ...dept,
    staff: cleanIds(dept.staff, "staff").slice(0, 6).map((s) => ({ ...s, duties: s.duties.slice(0, 6) })),
  })).slice(0, 8);
  return { departments, theme: data.theme, themeReason: data.themeReason };
}
