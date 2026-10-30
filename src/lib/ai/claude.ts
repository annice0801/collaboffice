import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

// 所有 Agent 呼叫 Claude 都經過這個檔案。
// 要換模型、調整共用設定，只改這裡。

// new Anthropic() 會自動讀取環境變數 ANTHROPIC_API_KEY
const client = new Anthropic();

// 角色 → 模型 的對照表（你決定的分配）：
//   主管（秘書、總經理、部門經理）負責判斷、拆解、審查 → Sonnet 5.5
//   員工負責執行一般任務 → Haiku 5.5（便宜、快）
export const MODELS = {
  executive: "claude-sonnet-5-5",
  manager: "claude-sonnet-5-5",
  staff: "claude-haiku-5-5",
} as const;

// effort（思考深度）：low 快又省；medium、high 想得比較深，但比較慢、比較貴
type Effort = "low" | "medium" | "high";

export type AiUsage = { model: string; inputTokens: number; outputTokens: number; webSearches?: number };

// Claude 拒絕回答時丟出的錯誤，呼叫端可以分辨「被拒絕」和「其他錯誤」
export class AiRefusalError extends Error {}

// 把 API 回傳的用量整理成我們要存的格式。
// input_tokens 只算「沒命中快取」的部分；
// 要加上寫入快取和讀取快取的 token，才是這次實際送進去的總量
function toUsage(response: Anthropic.Beta.BetaMessage): AiUsage {
  return {
    model: response.model,
    inputTokens:
      response.usage.input_tokens +
      (response.usage.cache_creation_input_tokens ?? 0) +
      (response.usage.cache_read_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
  };
}

// 每次呼叫都會檢查的狀況：被拒絕、或輸出太長被截斷
function checkStopReason(response: Anthropic.Beta.BetaMessage): void {
  if (response.stop_reason === "refusal") {
    throw new AiRefusalError(response.stop_details?.explanation ?? "AI 拒絕處理這個請求");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("AI 回覆太長被截斷，請提高 maxTokens");
  }
}

// 帳戶的 AI 用量達到上限時（Anthropic Console 設定的每月上限），回傳給使用者看的說明；其他錯誤回傳 null
export function usageLimitMessage(error: unknown): string | null {
  if (error instanceof Anthropic.APIError && /usage limit/i.test(error.message)) {
    return "AI 用量已經達到帳戶設定的上限，暫時無法回覆。請到 Anthropic Console 調高用量上限，或等額度重置後再試。";
  }
  return null;
}

// 網路搜尋工具（Anthropic 伺服器端執行）：
//   web_search_20260318 會先用程式過濾搜尋結果，只把相關內容放進 AI 的上下文，比較省 token；
//   response_inclusion: excluded → 原始搜尋結果不回傳給我們（我們只需要最後的文字與引用來源）
//   搜尋地區設在台灣；每次呼叫最多搜尋 maxUses 次（每 1,000 次 10 美元，另加搜尋內容的 token）
function webSearchTool(maxUses: number) {
  return {
    type: "web_search_20260318" as const,
    name: "web_search" as const,
    max_uses: maxUses,
    response_inclusion: "excluded" as const,
    user_location: { type: "approximate" as const, country: "TW", timezone: "Asia/Taipei" },
  };
}

// 呼叫 Claude，取得一段自由格式的文字（Markdown）。
// 員工產出的成果、經理彙整的報告都用這個，內容長短不固定，不適合塞進 JSON。
// webSearch：開放上網搜尋（部門有開啟時才傳）；成果最後會附上引用的資料來源
export async function askText(options: {
  model: string;
  system: string;
  user: string;
  effort?: Effort;
  maxTokens?: number;
  webSearch?: { maxUses: number };
}): Promise<{ text: string; usage: AiUsage }> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: options.user }];
  const usage: AiUsage = { model: options.model, inputTokens: 0, outputTokens: 0, webSearches: 0 };
  const blocks: Anthropic.Beta.BetaContentBlock[] = [];

  // 搜尋比較久時 API 會先暫停（pause_turn），把目前的內容原封不動送回去就會接著做（最多接續 5 次）
  for (let round = 0; round < 6; round++) {
    const response = await client.beta.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 16000,
      system: options.system,
      messages,
      output_config: { effort: options.effort ?? "medium" },
      cache_control: { type: "ephemeral" },
      ...(options.webSearch ? { tools: [webSearchTool(options.webSearch.maxUses)] } : {}),
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    const part = toUsage(response);
    usage.model = part.model;
    usage.inputTokens += part.inputTokens;
    usage.outputTokens += part.outputTokens;
    usage.webSearches = (usage.webSearches ?? 0) + (response.usage.server_tool_use?.web_search_requests ?? 0);
    blocks.push(...response.content);
    if (response.stop_reason !== "pause_turn") {
      checkStopReason(response);
      break;
    }
    messages.push({ role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
  }

  // 回應可能包含好幾段內容（思考過程、搜尋、文字…），只取文字的部分接起來
  const text = blocks
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
  if (!text) throw new Error("AI 沒有回傳任何內容");

  // 引用的資料來源（網路搜尋）：去掉重複，附在成果最後
  const sources = new Map<string, string>();
  for (const block of blocks) {
    if (block.type !== "text") continue;
    for (const c of block.citations ?? []) if (c.type === "web_search_result_location" && c.url) sources.set(c.url, c.title ?? c.url);
  }
  const cited = sources.size ? `\n\n---\n**資料來源**\n${[...sources].map(([url, title]) => `- [${title}](${url})`).join("\n")}` : "";

  return { text: text + cited, usage: options.webSearch ? usage : { ...usage, webSearches: undefined } };
}

// 呼叫 Claude，並要求它照 schema（資料格式）回傳 JSON。
// 好處：拿到的直接是有型別的物件，例如 { route: "work", reply: "…" }，
// 不用自己從一段文字裡解析，也不怕 AI 回傳格式亂掉。
// 多輪對話的前文：一問一答交錯，最舊的在前面
export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function askStructured<Schema extends z.ZodType>(options: {
  model: string;
  system: string; // 人設 Prompt：這個 Agent 是誰、職責、規則
  user: string; //   這次要處理的內容
  history?: ChatTurn[]; // 之前的對話（有的話，AI 會依前文接續）
  schema: Schema; // 期望回傳的資料格式
  effort?: Effort;
  maxTokens?: number;
}): Promise<{ data: z.infer<Schema>; usage: AiUsage }> {
  const response = await client.beta.messages.parse({
    model: options.model,
    max_tokens: options.maxTokens ?? 16000,
    system: options.system,
    messages: [...(options.history ?? []), { role: "user", content: options.user }],
    output_config: {
      effort: options.effort ?? "medium",
      // 把 zod schema 轉成 Claude 看得懂的格式，回傳後也會自動驗證、轉成物件
      format: betaZodOutputFormat(options.schema),
    },
    // 自動快取「人設 Prompt」：同一個 Agent 重複呼叫時，這段不用重新計費，又省又快
    cache_control: { type: "ephemeral" },
    // 安全機制偶爾會誤判而拒絕回答；開啟 fallbacks 後，
    // Anthropic 會自動改用適合的備用模型重試，不用自己處理
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  // 一定要先檢查 stop_reason，再讀內容
  checkStopReason(response);
  // parsed_output 是 null 代表 AI 回傳的內容不符合 schema
  if (response.parsed_output == null) {
    throw new Error("AI 回傳的格式不正確");
  }

  return { data: response.parsed_output, usage: toUsage(response) };
}
