// 問卷的喜好題：依回答替每個辦公室主題加分，算出最適合的工作場域。
// 純規則計算，在瀏覽器裡瞬間算完，不需要呼叫 AI。
// （之後 AI 設計部門時也會參考這些回答再推薦一次，那是同一次呼叫，不會多花費用）

import { OFFICE_STYLES, type OfficeStyle } from "./company";

type Option = { id: string; emoji: string; label: string; scores: Partial<Record<OfficeStyle, number>> };
export type QuizQuestion = { id: string; title: string; options: Option[] };

export const THEME_QUIZ: QuizQuestion[] = [
  {
    id: "weekend",
    title: "理想的週末怎麼過？",
    options: [
      { id: "tech", emoji: "🛸", label: "逛科技展、玩新 3C", scores: { scifi: 3, campus: 1 } },
      { id: "fantasy", emoji: "🪄", label: "看奇幻小說、電影", scores: { magic: 3, comic: 1 } },
      { id: "cafe", emoji: "☕", label: "在安靜的咖啡廳看書", scores: { classic: 3, manor: 1 } },
      { id: "outdoor", emoji: "🌳", label: "跟朋友去戶外野餐", scores: { campus: 3, manor: 1 } },
      { id: "sport", emoji: "🥋", label: "去道館、健身房流汗", scores: { sports: 3 } },
      { id: "manor", emoji: "🌹", label: "莊園下午茶、賞花", scores: { manor: 3, classic: 1 } },
      { id: "oldtown", emoji: "🏮", label: "逛古鎮、看古蹟", scores: { ancient: 3 } },
      { id: "comic", emoji: "📚", label: "追漫畫、畫圖", scores: { comic: 3, magic: 1 } },
      { id: "idol", emoji: "🎤", label: "追星、看演唱會", scores: { kpop: 3, comic: 1 } },
    ],
  },
  {
    id: "place",
    title: "夢想中的辦公地點？",
    options: [
      { id: "station", emoji: "🚀", label: "太空站、未來城市", scores: { scifi: 3 } },
      { id: "castle", emoji: "🏰", label: "魔法城堡、古老學院", scores: { magic: 3, ancient: 1 } },
      { id: "tower", emoji: "🏢", label: "市中心的玻璃大樓", scores: { classic: 3 } },
      { id: "park", emoji: "🌈", label: "像 Google 的開放園區", scores: { campus: 3, scifi: 1 } },
      { id: "villa", emoji: "🌹", label: "歐洲莊園、海邊別墅", scores: { manor: 3 } },
      { id: "courtyard", emoji: "🏯", label: "古風庭院、櫻花樹下", scores: { ancient: 3 } },
      { id: "gym", emoji: "🏀", label: "運動中心、道館", scores: { sports: 3 } },
      { id: "studio", emoji: "🎨", label: "漫畫工作室、練舞室", scores: { comic: 2, kpop: 2 } },
    ],
  },
];

// 依回答排出主題；best：可以用的主題裡分數最高的；top：所有主題裡分數最高的（可能還在製作中）
export function recommendTheme(answers: Record<string, string>): { best: OfficeStyle | null; top: OfficeStyle | null } {
  const scores = new Map<OfficeStyle, number>();
  for (const q of THEME_QUIZ) {
    const option = q.options.find((o) => o.id === answers[q.id]);
    for (const [id, n] of Object.entries(option?.scores ?? {})) scores.set(id as OfficeStyle, (scores.get(id as OfficeStyle) ?? 0) + n);
  }
  if (!scores.size) return { best: null, top: null };
  const ranked = OFFICE_STYLES.filter((s) => scores.has(s.id)).sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));
  return { top: ranked[0]?.id ?? null, best: ranked.find((s) => s.ready)?.id ?? "classic" };
}

// 選了哪些答案（文字），給 AI 參考
export function quizLabels(answers: Record<string, string>): string[] {
  return THEME_QUIZ.flatMap((q) => {
    const option = q.options.find((o) => o.id === answers[q.id]);
    return option ? [`${q.title}${option.label}`] : [];
  });
}
