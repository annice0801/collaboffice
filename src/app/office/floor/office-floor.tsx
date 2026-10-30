"use client";

// 立體辦公室樓層。
//
// 平面圖依「這位會員的部門」與「辦公室風格」產生（plan.ts 的 buildPlan）。
// 每位 Agent 的狀態每 5 秒從 /api/office/status 更新一次，決定他「想做什麼」：
//   有工作                  → 回座位，或帶筆電去沙發、懶骨頭、跑步機辦公桌工作
//   沒工作                  → 四處晃：溜滑梯、攀岩、球池、按摩椅、瑜伽、花園…
//   很久沒工作（SLEEP_AFTER）→ 趴在座位上或去睡眠艙睡覺（秘書負責接待你，不會睡）
//   你點了會議室            → 打開會議室視窗，列席的主管走進會議室開會（散會後回去）
//   你點了某人的辦公桌      → 他走回座位坐下，跟你對話
//   老闆（你）              → 有時在辦公室處理公事，有時到處走走、坐沙發，
//                             或走到空閒的部門經理、秘書旁邊聊天（兩人頭上輪流出現對話泡泡）
//
// 走動：route() 算出沿走廊的路線（不穿牆），一段一段用 CSS transition 滑過去；
// 溜滑梯、攀岩這類有高度的動作，路線點會帶 z（離地高度）和姿勢。
// 互動：
//   點秘書或總經理 → 頭上出現寶可夢風格對話框，可以直接對話；同時顯示目前交辦事項、未來預計製作
//                    （手機畫面太小，只顯示資訊面板，面板上有「跟他對話」按鈕）
//   點老闆（你）   → 公司總覽：願景、年度目標、營運數字、趨勢、未來走勢（company-panel.tsx）
//   點其他人       → 員工詳細資訊（職責、目前工作、統計…，見 agent-panel.tsx）
//   點辦公桌       → 他走回座位坐下，頭上出現對話框跟你聊（點老闆桌 → 公司總覽）
//   每張桌子前面有職稱名牌與「工作膠囊」：目前階段（執行中、待審閱…）與進度
//   點辦公區       → 顯示這個區域的待辦、已完成、規劃完成進度（點會議室還會召集開會）
//   會議室牆上的白板顯示目前交辦事項的進度條
//   點遊戲室的機台 → 老闆走過去玩（背對我們按按鈕），接著在新分頁打開遊戲（/games/tetris、/games/pinball）
// 畫面可以拖曳平移、用按鈕縮放。

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { agentLabel, EXECUTIVE_ASSISTANT, GENERAL_MANAGER, OFFICE_STYLES, USER, type Department, type OfficeStyle } from "@/lib/company";
import { agentProfile } from "@/lib/agent-profile";
import { AgentPanel, phaseColor, type AgentDetail, type Schedule, type Work } from "./agent-panel";
import { CompanyPanel, type CompanyData } from "./company-panel";
import { attendeeAgents, MeetingRoom, type Attendees } from "./meeting-room";
import type { BossGender } from "@/lib/company";
import { Character, headHeight, type Pose } from "./character";
import { RetroDialog, RoomPanel, type MissionItem, type RoomInfo } from "./overlays";
import { buildPlan, depthOf, GAMES, project, ROOM, route, TILE_H, TILE_W, type Arcade, type GameId, type Plan, type Rest, type Room, type Waypoint } from "./plan";
import { Ambient } from "./ambient";
import { Background, sceneItems, Whiteboard, type Drawable } from "./scene";

// 多久沒工作就會睡著（毫秒）
const SLEEP_AFTER = 3 * 60 * 1000;
// 走一格要多久（毫秒）
const MS_PER_TILE = 380;
// 模擬多久更新一次（毫秒）：越短，走到轉角後越快接著走下一段
const TICK = 300;
// 工作時不坐辦公桌、帶筆電去別處的機率；想睡時去睡眠艙的機率
const WORK_ELSEWHERE = 0.45;
const NAP_POD = 0.35;

// task：手上正在處理的工作（有的話就回座位忙）；work：桌上工作膠囊顯示的階段與進度
type AgentStatus = { lastActiveAt: string | null; task: string | null; work?: Work | null; decisions?: number };
// 現在想做什麼：工作、閒晃、睡覺、開會、跟你說話、提醒開會、玩遊戲機（只有老闆）
type Want = "work" | "idle" | "sleep" | "meeting" | "talk" | "remind" | "play" | "coffee" | "errand";
type Sim = {
  room: string; //          目前所在的房間（或 "garden"）
  x: number; //             目前這段路的終點（CSS 會從上一個位置滑過來）
  y: number;
  z: number; //             離地高度（爬上溜滑梯、攀岩牆時 > 0）
  path: Waypoint[]; //      還沒走的路段
  goal: Rest | null; //     要去（或已經在）的定點
  pending: Rest | null; //  站起來、或走完目前這段特殊路線後，接著要去的定點
  leaving: Rest | null; //  剛離開的定點（要先走它的 exit，例如從攀岩牆爬下來）
  mode: Want;
  pose: Pose;
  rest: boolean; //         停在定點上（坐著、躺著、站著玩）：跟家具一起排前後順序
  moving: boolean;
  dur: number; //           這段移動花多久（CSS transition 用）
  flip: boolean; //         往左走時左右翻轉
  arriveAt: number; //      這段路的抵達時間
  nextMoveAt: number; //    閒晃時下一次出發的時間；站起來後出發的時間
  talkTo: string | null; // 正在跟誰聊天（老闆和主管的自然互動）
  talkStart: number;
  talkUntil: number;
};

// 老闆和主管聊天時，頭上輪流出現的話（只是畫面上的互動，不會呼叫 AI）
const BOSS_LINES = ["最近進度如何？", "這週有需要我幫忙的嗎？", "上次那份報告做得不錯！", "有什麼新點子嗎？", "辛苦了，記得休息喔"];
const MANAGER_LINES = ["團隊進行得很順利！", "正好有件事想跟您報告", "預計這週可以交件", "我們還在調整細節", "謝謝老闆！"];
const ASSISTANT_LINES = ["老闆，記得喝水喔", "今天的行程我都排好了", "下午幫您留了休息時間", "要不要幫您準備咖啡？", "晨報已經整理好了"];
const TALK_MS = 15000; //   聊多久
const LINE_MS = 3500; //    每句話停留多久

// 現在這一刻誰在說哪一句：老闆先說，對方接著回
function talkLine(sim: Sim, agent: string, now: number): string | null {
  if (!sim.talkTo || now >= sim.talkUntil) return null;
  const k = Math.floor((now - sim.talkStart) / LINE_MS);
  const bossSpeaks = k % 2 === 0;
  if ((agent === USER) !== bossSpeaks) return null;
  const seed = Math.floor(sim.talkStart / 1000) + Math.floor(k / 2);
  const other = agent === USER ? sim.talkTo : agent;
  const lines = agent === USER ? BOSS_LINES : other === EXECUTIVE_ASSISTANT ? ASSISTANT_LINES : MANAGER_LINES;
  return lines[seed % lines.length];
}

// 對話框：誰在說話、說什麼、是不是還在等回覆
export type Dialog = { agent: string; text: string; pending: boolean } | null;
// 可以直接對話的人
const TALKERS = [EXECUTIVE_ASSISTANT, GENERAL_MANAGER];

const random = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const chance = (p: number) => Math.random() < p;

// 喝了魔藥會變成的動物（五分鐘）
const ANIMALS = [
  { kind: "frog", emoji: "🐸", name: "青蛙" },
  { kind: "cat", emoji: "🐱", name: "貓咪" },
  { kind: "rabbit", emoji: "🐰", name: "兔子" },
  { kind: "pig", emoji: "🐷", name: "小豬" },
  { kind: "owl", emoji: "🦉", name: "貓頭鷹" },
] as const;
type AnimalKind = (typeof ANIMALS)[number]["kind"];
const ANIMAL_MS = 5 * 60 * 1000;

// 計算一位 Agent 現在「想」做什麼（優先順序由上到下）
function wantOf(agent: string, status: AgentStatus | undefined, speaking: boolean, meeting: boolean, reminding: boolean, now: number): Want {
  // 預定的會議時間到了：秘書在會議室門口等你（跟她說話時也留在那裡）
  if (reminding && agent === EXECUTIVE_ASSISTANT) return "remind";
  if (speaking) return "talk";
  if (meeting) return "meeting";
  if (agent === USER) return "idle"; // 老闆自由走動：辦公室、各部門、沙發，或找主管聊天（見 pickBossSpot）
  if (status?.task) return "work";
  if (agent === EXECUTIVE_ASSISTANT) return "idle"; // 秘書負責接待你，不會睡
  if (status?.work?.phase === "督導中") return "idle"; // 總經理督導進行中的總目標時不睡覺
  const last = status?.lastActiveAt ? new Date(status.lastActiveAt).getTime() : 0;
  return now - last > SLEEP_AFTER ? "sleep" : "idle";
}

type Seat = Plan["seats"][number];

// 依「想做的事」挑一個定點。有 key 的定點（沙發、睡眠艙…）已經有人要用的話就不選
// spot：開會的位置，或老闆要去玩的機台
function chooseGoal(plan: Plan, seat: Seat, want: Want, taken: Set<string>, spot?: Rest): Rest | null {
  const desk = (pose: Pose, label: string): Rest => ({ key: `desk:${seat.agent}`, room: seat.room.id, x: seat.x, y: seat.y, pose, label });
  const free = (list: Rest[]) => list.filter((s) => !s.key || !taken.has(s.key));
  if (want === "meeting" || want === "play" || want === "coffee" || want === "errand") return spot ?? null;
  if (want === "talk") return desk("sit", "在座位上跟你對話"); // 跟你說話：回到自己的座位坐下
  if (want === "remind") {
    // 站在會議室門口附近等你
    const room = plan.rooms.find((r) => r.kind === "meeting");
    return room ? { room: room.id, x: room.ox + 6.8, y: room.oy + 7.2, pose: "stretch", label: "在會議室提醒你開會" } : null;
  }
  if (want === "work") {
    const spots = free(plan.workSpots);
    if (seat.agent !== USER && spots.length && Math.random() < WORK_ELSEWHERE) return pick(spots);
    return desk("sit", "在座位上工作");
  }
  if (want === "sleep") {
    const pods = free(plan.napSpots);
    if (pods.length && Math.random() < NAP_POD) return pick(pods);
    return desk("sleep", "趴在座位上睡覺");
  }
  return null;
}

// 閒著的時候要去哪：有時在自己辦公室走走，有時去休憩間、遊樂區、紓壓室、花園
function pickHangout(plan: Plan, seat: Seat, taken: Set<string>, others: Record<string, Sim> = {}): Rest {
  if (seat.agent === USER) return pickBossSpot(plan, seat, taken, others);
  const spots = plan.hangouts.filter((h) => !h.key || !taken.has(h.key));
  if (Math.random() < 0.35 || !spots.length) {
    const [x, y] = pick(seat.room.spots);
    return { room: seat.room.id, x, y, pose: "stand" };
  }
  return pick(spots);
}

// 老闆下一步去哪：回辦公室處理公事、找空閒的主管或秘書聊天、或到處走走
function pickBossSpot(plan: Plan, seat: Seat, taken: Set<string>, others: Record<string, Sim>): Rest {
  const roll = Math.random();
  if (roll < 0.4) return { key: `desk:${USER}`, room: seat.room.id, x: seat.x, y: seat.y, pose: "sit", label: "在辦公室處理公事" };
  if (roll < 0.8) {
    // 找一位正在閒著、站在地上、沒在跟別人聊的主管或秘書
    const free = Object.entries(others).filter(
      ([id, s]) => (id === EXECUTIVE_ASSISTANT || id.endsWith(".manager")) && s.mode === "idle" && !s.moving && !s.talkTo && s.z === 0,
    );
    if (free.length) {
      const [id, s] = pick(free);
      const room = plan.rooms.find((r) => r.id === s.room);
      const dx = room && s.x + 0.9 > room.ox + ROOM - 0.3 ? -0.9 : 0.9; // 站在對方旁邊（不要站出房間外）
      return { room: s.room, x: s.x + dx, y: s.y + 0.15, pose: "stand", label: "在跟同事聊天", visit: id };
    }
  }
  const spots = plan.hangouts.filter((h) => !h.key || !taken.has(h.key));
  return spots.length ? pick(spots) : { key: `desk:${USER}`, room: seat.room.id, x: seat.x, y: seat.y, pose: "sit", label: "在辦公室處理公事" };
}

// 走一段路：從 sim 目前位置走到路線上的下一個點
function step(plan: Plan, sim: Sim, point: Waypoint, now: number): Sim {
  const z = point.z ?? 0;
  const distance = Math.hypot(point.x - sim.x, point.y - sim.y, (z - sim.z) / 30);
  // 老闆趕去玩遊戲機時用小跑步
  const dur = Math.max(250, (distance * MS_PER_TILE) / (point.speed ?? (sim.mode === "play" ? 2.5 : 1)));
  const [fromX] = project(plan, sim.x, sim.y);
  const [toX] = project(plan, point.x, point.y);
  const flip = Math.abs(toX - fromX) < 1 ? sim.flip : toX < fromX; // 直直往上爬時不轉身
  return { ...sim, x: point.x, y: point.y, z, pose: point.pose ?? "walk", moving: true, rest: false, dur, flip, arriveAt: now + dur };
}

// 從目前位置到某個定點的完整路線：（離開舊定點的路）→ 走廊 →（定點的特別路線）→ 定點
function pathTo(plan: Plan, sim: Sim, goal: Rest): Waypoint[] {
  const exit = sim.leaving?.exit ?? [];
  const start = exit.at(-1) ?? sim;
  const entry = goal.via?.[0] ?? goal;
  const legs = route(plan, { x: start.x, y: start.y }, { room: goal.room, x: entry.x, y: entry.y })
    .slice(0, -1)
    .map(([x, y]): Waypoint => ({ x, y }));
  return [...exit, ...legs, ...(goal.via ?? []), { x: goal.x, y: goal.y, z: goal.z }];
}

function travel(plan: Plan, sim: Sim, goal: Rest, now: number): Sim {
  const [first, ...rest] = pathTo(plan, sim, goal);
  return step(plan, { ...sim, path: rest, goal, pending: null, leaving: null }, first, now);
}

// 改去別的定點
function redirect(plan: Plan, sim: Sim, goal: Rest, now: number): Sim {
  // 坐著（或在玩）：先站起來，下一次更新再出發（CSS 才有起點可以滑過去）
  if (sim.rest) {
    return { ...sim, rest: false, moving: false, pose: sim.pose === "climb" ? "climb" : "stand", dur: 0, leaving: sim.goal, goal, pending: goal, nextMoveAt: now + TICK };
  }
  if (sim.moving) {
    // 在溜滑梯、攀岩牆上：先把這段玩完再走
    const aloft = sim.z > 0 || sim.path.some((p) => (p.z ?? 0) > 0);
    if (aloft) return { ...sim, pending: goal };
    return { ...sim, path: pathTo(plan, { ...sim, leaving: null }, goal), goal, pending: null };
  }
  return travel(plan, sim, goal, now);
}

// 走到定點了：換成定點的姿勢
function arrive(sim: Sim, now: number): Sim {
  const goal = sim.goal;
  if (!goal) return { ...sim, moving: false, pose: "stand", dur: 0, nextMoveAt: now + random(3000, 8000) };
  // 老闆回到辦公室會待久一點，處理完公事再出去走走
  const stay = goal.key === `desk:${USER}` ? random(25000, 50000) : random(4000, 10000);
  return { ...sim, room: goal.room, rest: true, moving: false, pose: goal.pose, flip: false, dur: 0, nextMoveAt: now + stay };
}

// ── 展示模式（首頁用）──────────────────────────────
// 不用登入、不讀資料庫：隨機挑幾位在工作、幾位剛閒下來、其他人睡覺，每 15 秒換一批；
// 秘書和總經理輪流冒出對話氣泡
const DEMO_TASKS = ["整理本週市場快訊", "撰寫 IG 貼文文案", "審閱內容日曆", "彙整管委會議程", "優化履歷自我介紹", "規劃新產品功能"];
const DEMO_LINES: { agent: string; text: string }[] = [
  { agent: "executive_assistant", text: "老闆早安！今天有 3 項工作進行中，記得先喝杯水 ☕" },
  { agent: "general_manager", text: "IG 貼文規劃已分派給社群行銷部，預計今天下午交件。" },
  { agent: "executive_assistant", text: "下午 3 點有管委會會議，議程已經請社區部準備好了。" },
  { agent: "general_manager", text: "市場情報部的晨報驗收通過，重點我整理在總結報告裡。" },
];

const DEMO_MISSIONS: MissionItem[] = [
  { title: "下個月 IG 命理主題貼文", status: "in_progress", progress: 72 },
  { title: "社區太陽能板可行性評估", status: "in_progress", progress: 45 },
  { title: "顧問職缺履歷自我介紹", status: "completed", progress: 100 },
  { title: "新產品功能規劃", status: "planning", progress: 10 },
];
const DEMO_ROOM: RoomInfo = {
  progress: 64,
  todo: [
    { title: "撰寫 12 篇 IG 貼文文案", mission: "下個月 IG 命理主題貼文", status: "in_progress", progress: 72 },
    { title: "估算廣告投放預算", mission: "下個月 IG 命理主題貼文", status: "pending", progress: 0 },
  ],
  done: [{ title: "規劃命理主題內容日曆", mission: "下個月 IG 命理主題貼文", status: "approved", progress: 100 }],
};

function demoWork(): Work {
  const mission = pick(DEMO_MISSIONS);
  return { phase: pick(["執行中", "執行中", "審閱中", "修改中", "待審閱"]), progress: Math.round(random(10, 90)), title: pick(DEMO_TASKS), mission: mission.title };
}

// 首頁展示：點人物時的詳細資訊用假資料
function demoDetail(status: AgentStatus | undefined): AgentDetail {
  const work = status?.work;
  return {
    current: work
      ? [{
          id: "demo", missionId: "", title: work.title, mission: work.mission, status: "in_progress", progress: work.progress,
          instructions: "（展示資料）依部門經理的說明完成這項工作，交出後由經理審閱。",
          acceptanceCriteria: ["內容符合需求與語氣", "資料有來源，取不到的標示「待取得資料」"],
          revisionCount: work.phase === "修改中" ? 1 : 0, maxRevisions: 2, lastReview: work.phase === "修改中" ? "（展示資料）第二段數據請補上來源。" : null,
        }]
      : [],
    recent: DEMO_MISSIONS.slice(0, 2).map((m) => ({ missionId: "", title: m.title, mission: m.title, status: "approved", completedAt: null, comments: null })),
    stats: { total: 12, open: work ? 1 : 0, approved: 10, failed: 1, firstPass: 8, revisions: 3, outputChars: 18250 },
    activities: [],
  };
}

// 首頁展示：公司總覽的假資料
function demoCompany(plan: Plan, departments: Department[]): CompanyData {
  const week = 7 * 24 * 60 * 60 * 1000;
  const start = Date.UTC(2026, 7, 24);
  return {
    companyName: "範例公司",
    vision: "用一支 AI 團隊，讓一個人也能同時經營多個事業。",
    goals: [
      { id: "1", title: "IG 追蹤數成長到 1 萬", due: "2026 Q4", done: false, period: "year" },
      { id: "2", title: "本月產出 12 篇社群貼文", due: "10/31", done: true, period: "month" },
      { id: "3", title: "完成社區太陽能板評估", due: "11 月", done: false, period: "year" },
      { id: "4", title: "這週整理 3 則市場快訊", due: "週五", done: false, period: "week" },
    ],
    plans: [{ id: "p", title: "年底做一份年度成果簡報", detail: "", agent: "general_manager", createdAt: new Date(start).toISOString() }],
    stats: { missions: 9, completed: 6, open: 3, failed: 0, members: plan.seats.length - 1, departments: departments.length, openTasks: 11, approvedTasks: 48, avgDays: 2.4 },
    weekly: [3, 5, 4, 7, 6, 8, 7, 9].map((done, i) => ({ start: new Date(start + i * week).toISOString(), done })),
    projection: { perWeek: 7.5, openTasks: 11, weeksToClear: 2 },
    forecasts: DEMO_MISSIONS.filter((m) => m.status !== "completed").map((m, i) => ({ id: "", title: m.title, status: m.status, progress: m.progress, etaDays: m.progress ? 2 + i * 3 : null })),
    departments: departments.map((d, i) => ({ id: d.id, name: d.name, open: [4, 3, 2, 1, 1][i % 5], done: [12, 15, 8, 6, 7][i % 5] })),
  };
}

function demoStatuses(plan: Plan): Record<string, AgentStatus> {
  const now = Date.now();
  const result: Record<string, AgentStatus> = {};
  for (const { agent } of plan.seats) {
    const roll = Math.random();
    result[agent] =
      roll < 0.3
        ? { lastActiveAt: new Date(now).toISOString(), task: pick(DEMO_TASKS), work: demoWork() } // 工作中
        : roll < 0.7
          ? { lastActiveAt: new Date(now - 30_000).toISOString(), task: null } // 剛閒下來，四處走走
          : { lastActiveAt: null, task: null }; // 很久沒工作，睡覺
  }
  return result;
}

export function OfficeFloor({
  departments,
  style,
  onStyleChange,
  userName = "老闆",
  dialog: externalDialog = null,
  onTalk,
  onSend,
  onCloseDialog,
  onHistory,
  onOpenMission,
  onDispatch,
  highlight = [],
  bossGender = "neutral",
  onBossGenderChange,
  actions,
  fill = false,
  demo = false,
}: {
  departments: Department[];
  style: OfficeStyle;
  onStyleChange?: (style: OfficeStyle) => void; // 有傳才顯示風格切換按鈕
  userName?: string;
  dialog?: Dialog; //                         目前打開的對話框
  onTalk?: (agent: string) => void; //       點秘書或總經理時呼叫（打開對話框）
  onSend?: (message: string) => void; //     在對話框裡送出回覆
  onCloseDialog?: () => void;
  onHistory?: () => void; //                 對話框上的「紀錄」按鈕
  onOpenMission?: (missionId: string) => void; // 員工資訊卡上的「查看這項交辦」
  onDispatch?: (agent: string, message: string) => void; // 把預計製作的事交辦給秘書或總經理
  highlight?: string[]; //                   要標示的人（打開交辦事項時，參與的人腳下出現黃色光圈）
  bossGender?: BossGender; //                你的人物（性別）；穿搭跟著辦公室風格
  onBossGenderChange?: (gender: BossGender) => void;
  actions?: ReactNode; //                    左上角的額外按鈕（對話紀錄、工作進度）
  fill?: boolean; //                         填滿外層的高度（辦公室頁面），整間公司縮放到看得到全貌
  demo?: boolean;
}) {
  const plan = useMemo(() => buildPlan(departments, style), [departments, style]);
  // 一開始都是 null：首頁會在 build 時預先產生，那時不能用亂數或目前時間，等瀏覽器載入後才填入
  const [statuses, setStatuses] = useState<Record<string, AgentStatus> | null>(null);
  const [sims, setSims] = useState<Record<string, Sim>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [companyOpen, setCompanyOpen] = useState(false); // 公司總覽（點老闆）
  // 辦公室頁面一開始放大一點（約等於按三次「＋」），畫面中央對準建築中心；首頁展示維持全貌
  const [view, setView] = useState(() => {
    if (!fill) return { x: 0, y: 0, k: 1 };
    const k = 1.25 ** 3;
    const [cx, cy] = project(plan, plan.buildingW / 2, plan.buildingH / 2);
    return { x: plan.viewW / 2 - cx * k, y: plan.viewH / 2 - cy * k, k };
  });
  const [now, setNow] = useState(0);
  const [demoDialog, setDemoDialog] = useState<Dialog>(null);
  const dialog = demo ? demoDialog : externalDialog;
  const [rooms, setRooms] = useState<Record<string, RoomInfo>>({});
  const [missions, setMissions] = useState<MissionItem[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  // 開會到什麼時候（0：沒有在開會）
  // 會議：null 表示沒有在開會；有的話記錄列席的部門與是否請秘書列席
  const [meeting, setMeeting] = useState<Attendees | null>(null);
  const [meetingTopic, setMeetingTopic] = useState(""); // 從預定會議開始時，先填好主題
  const [reminder, setReminder] = useState<Schedule | null>(null); // 時間到了的預定會議
  const [statusVersion, setStatusVersion] = useState(0); //        +1 就立刻重新讀取狀態（例如下達決定後）
  const [meetingSpeech, setMeetingSpeech] = useState<Record<string, string>>({}); // 與會者頭上的發言提示
  const [meetingPending, setMeetingPending] = useState(false);
  const attendees = useMemo(() => (meeting ? attendeeAgents(meeting, USER) : []), [meeting]);
  // 老闆正在玩的機台：opened＝遊戲分頁打開了；blocked＝瀏覽器擋下自動開分頁，改顯示按鈕讓你點
  const [arcade, setArcade] = useState<{ game: GameId; opened: boolean; blocked: boolean } | null>(null);
  // 咖啡機：brewing 煮咖啡中（冒蒸氣）→ ready 做好了等人來拿 → fetch 有人走過來拿；drinking：誰在喝咖啡（喝到什麼時候）
  const [coffee, setCoffee] = useState<{ phase: "brewing" | "ready" | "fetch"; taker: string | null } | null>(null);
  const coffeeTaker = coffee?.phase === "fetch" ? coffee.taker : null;
  const [drinking, setDrinking] = useState<Record<string, number>>({});
  // 被叫去用設施的人：要去哪裡（errands）；保養中的設備（key → 保養到什麼時候）；
  // 設施旁邊冒出的提示（例如「器材保養中」）；喝了魔藥變成動物的人；魔藥大鍋的狀態
  const [errands, setErrands] = useState<Record<string, { spot: Rest }>>({});
  const errandsRef = useRef(errands);
  const [maintenance, setMaintenance] = useState<Record<string, number>>({});
  const [notices, setNotices] = useState<{ id: number; x: number; y: number; z: number; text: string; until: number }[]>([]);
  const [animals, setAnimals] = useState<Record<string, { kind: AnimalKind; until: number }>>({});
  const [potion, setPotion] = useState<"brewing" | "ready" | null>(null);
  // 被點醒的人：嚇一跳到什麼時候（頭上冒出「！」）
  const [startled, setStartled] = useState<Record<string, number>>({});
  const nowRef = useRef(0);
  const simsRef = useRef(sims);
  useEffect(() => {
    simsRef.current = sims;
  }, [sims]);
  useEffect(() => {
    nowRef.current = now;
  }, [now]);
  useEffect(() => {
    errandsRef.current = errands;
  }, [errands]);

  // 部門或風格改變時（平面圖重算），所有人重新就位
  const [planVersion, setPlanVersion] = useState(plan);
  // 換主題：播 0.8 秒的轉場（鏡頭微拉遠、白光一閃，整個空間翻新）
  const [transition, setTransition] = useState(0);
  if (planVersion !== plan) {
    if (planVersion.config.id !== plan.config.id) setTransition((t) => t + 1);
    setPlanVersion(plan);
    setSims({});
  }

  // ── 展示模式：定時換一批狀態、輪流說話 ──
  useEffect(() => {
    if (!demo) return;
    let line = 0;
    const first = setTimeout(() => {
      setStatuses(demoStatuses(plan));
      setMissions(DEMO_MISSIONS);
    }, 0);
    const reshuffle = setInterval(() => setStatuses(demoStatuses(plan)), 15000);
    const talk = setInterval(() => {
      setDemoDialog({ ...DEMO_LINES[line++ % DEMO_LINES.length], pending: false });
      setTimeout(() => setDemoDialog(null), 6000);
    }, 9000);
    return () => {
      clearTimeout(first);
      clearInterval(reshuffle);
      clearInterval(talk);
    };
  }, [demo, plan]);

  // ── 讀取真實狀態（每 5 秒）──
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    const load = () =>
      fetch("/api/office/status")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data || cancelled) return;
          setStatuses(data.agents);
          setReminder(data.reminder ?? null);
          setRooms(data.rooms ?? {});
          setMissions(data.missions ?? []);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [demo, statusVersion]);

  // ── 模擬：每個人想做什麼、要去哪、到了沒 ──
  useEffect(() => {
    if (!statuses) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      setSims((prev) => {
        // 已經有人要用的定點（沙發座位、睡眠艙、溜滑梯…）
        const taken = new Set<string>();
        for (const sim of Object.values(prev)) {
          if (sim.goal?.key) taken.add(sim.goal.key);
          if (sim.pending?.key) taken.add(sim.pending.key);
        }
        const reserve = <T extends Rest | null>(goal: T): T => {
          if (goal?.key) taken.add(goal.key);
          return goal;
        };

        // 老闆要玩的機台：其他人不要再過去
        const playSpot = arcade ? plan.arcades.find((a) => a.game === arcade.game)?.spot : undefined;
        if (playSpot?.key) taken.add(playSpot.key);
        // 被叫去用設施的人要去的位置、保養中的設備：其他人不要再過去
        const reserved = new Set<string>([...Object.values(errands).map((e) => e.spot.key ?? ""), ...Object.keys(maintenance).filter((k) => maintenance[k] > t)]);
        for (const key of reserved) if (key) taken.add(key);

        const next: Record<string, Sim> = {};
        for (const seat of plan.seats) {
          const attendeeIndex = attendees.indexOf(seat.agent);
          const errand = errands[seat.agent];
          const want: Want =
            seat.agent === USER && playSpot
              ? "play"
              : errand
                ? "errand" // 被叫去用某個設施（溜滑梯、掃帚、魔藥大鍋…）
                : seat.agent === coffeeTaker
                ? "coffee" // 被選中去拿剛煮好的咖啡
                : wantOf(seat.agent, statuses[seat.agent], dialog?.agent === seat.agent, attendeeIndex >= 0, Boolean(reminder) && !meeting, t);
          const meetingSpot =
            want === "play" ? playSpot : want === "errand" ? errand.spot : want === "coffee" ? (plan.coffee?.spot ?? undefined) : attendeeIndex >= 0 ? plan.meetingSpots[Math.min(attendeeIndex, plan.meetingSpots.length - 1)] : undefined;
          let sim = prev[seat.agent];

          // 第一次出現：直接放在該在的定點上
          if (!sim) {
            const goal = reserve(chooseGoal(plan, seat, want, taken, meetingSpot) ?? pickHangout(plan, seat, taken, prev));
            next[seat.agent] = {
              room: goal.room, x: goal.x, y: goal.y, z: goal.z ?? 0, path: [], goal, pending: null, leaving: null,
              mode: want, pose: goal.pose, rest: true, moving: false, dur: 0, flip: false, arriveAt: t, nextMoveAt: t + random(1000, 6000),
              talkTo: null, talkStart: 0, talkUntil: 0,
            };
            continue;
          }

          // 1. 走完這一段了：接著走下一段、改去下一個地方、或抵達
          if (sim.moving && t >= sim.arriveAt) {
            if (sim.path.length) {
              const [point, ...rest] = sim.path;
              sim = step(plan, { ...sim, path: rest }, point, t);
            } else if (sim.pending) {
              sim = travel(plan, { ...sim, leaving: sim.goal }, sim.pending, t);
            } else {
              sim = arrive(sim, t);
            }
          }

          // 正在玩老闆要玩的機台：讓位（下一次更新就會走開）
          if (seat.agent !== USER && playSpot && sim.goal?.key === playSpot.key && sim.rest) sim = { ...sim, nextMoveAt: 0 };
          // 正在用的設施要保養、或別人被叫來用：先讓開
          if (!errand && sim.rest && sim.mode === "idle" && sim.goal?.key && reserved.has(sim.goal.key)) sim = { ...sim, nextMoveAt: 0 };

          // 2. 想做的事變了
          if (want !== sim.mode) {
            sim = { ...sim, mode: want };
            if (want === "idle") {
              // 不用工作了：過一下子就起身去晃晃
              if (sim.rest) sim = { ...sim, nextMoveAt: t + random(500, 2500) };
            } else {
              // 工作、睡覺、開會、跟你說話（回座位）：挑一個定點走過去
              const goal = reserve(chooseGoal(plan, seat, want, taken, meetingSpot));
              if (goal) sim = redirect(plan, sim, goal, t);
            }
          }

          // 3. 停在定點上、或站起來準備出發
          if (sim.rest) {
            if (sim.mode === "idle" && t >= sim.nextMoveAt) sim = redirect(plan, { ...sim, talkTo: null }, reserve(pickHangout(plan, seat, taken, prev)), t);
            // 跟你說話時醒過來
            else if (sim.mode === "talk" && sim.pose === "sleep") sim = { ...sim, pose: sim.goal?.key?.startsWith("desk:") ? "sit" : "lounge" };
          } else if (!sim.moving && sim.pending && t >= sim.nextMoveAt) {
            sim = travel(plan, sim, sim.pending, t);
          } else if (!sim.moving && !sim.pending && sim.mode === "idle" && t >= sim.nextMoveAt) {
            sim = travel(plan, sim, reserve(pickHangout(plan, seat, taken, prev)), t);
          }
          // 聊天結束、或不再閒著（被叫去工作、開會）：停止聊天
          if (sim.talkTo && (t >= sim.talkUntil || sim.mode !== "idle" || sim.moving)) sim = { ...sim, talkTo: null };
          // 老闆走到要找的人旁邊了：對方還閒著的話就開始聊
          if (seat.agent === USER && sim.rest && sim.goal?.visit && !sim.talkTo && sim.mode === "idle") {
            const other = next[sim.goal.visit] ?? prev[sim.goal.visit];
            const near = other && !other.moving && other.mode === "idle" && Math.hypot(other.x - sim.x, other.y - sim.y) < 2;
            sim = near
              ? { ...sim, talkTo: sim.goal.visit, talkStart: t, talkUntil: t + TALK_MS, nextMoveAt: t + TALK_MS + 500 }
              : { ...sim, goal: { ...sim.goal, visit: undefined } }; // 對方走掉了，下一次再找別人
          }
          next[seat.agent] = sim;
        }
        // 對方也進入聊天狀態（留在原地，聊完才走）
        const boss = next[USER];
        if (boss?.talkTo && next[boss.talkTo] && next[boss.talkTo].talkTo !== USER) {
          const other = next[boss.talkTo];
          next[boss.talkTo] = { ...other, talkTo: USER, talkStart: boss.talkStart, talkUntil: boss.talkUntil, nextMoveAt: Math.max(other.nextMoveAt, boss.talkUntil + 800) };
        }
        return next;
      });
    };
    tick();
    const timer = setInterval(tick, TICK);
    return () => clearInterval(timer);
  }, [statuses, dialog?.agent, plan, attendees, reminder, meeting, arcade, coffeeTaker, errands, maintenance]);

  // ── 遊戲機台：老闆走到機台前（或最多等 3.5 秒）就打開遊戲分頁 ──
  // 瀏覽器只允許「點擊後幾秒內」自動開新分頁，所以不等太久；被擋下的話改顯示按鈕
  const playArcade = (game: GameId, event: React.MouseEvent) => {
    event.stopPropagation();
    if (drag.current?.moved) return;
    setSelected(null);
    setCompanyOpen(false);
    setSelectedRoom(null);
    setArcade({ game, opened: false, blocked: false });
    const spotKey = plan.arcades.find((a) => a.game === game)?.spot.key;
    let waited = 0;
    const timer = setInterval(() => {
      waited += 200;
      const boss = simsRef.current[USER];
      const arrived = boss?.rest && boss.goal?.key === spotKey;
      if (!arrived && waited < 3500) return;
      clearInterval(timer);
      const tab = window.open(`/games/${game}`, "_blank");
      setArcade((a) => (a?.game === game ? { ...a, opened: true, blocked: !tab } : a));
    }, 200);
  };
  // ── 設施互動 ──
  // 設施旁邊冒出一句提示（幾秒後消失）
  const notify = (x: number, y: number, z: number, text: string, ms = 4000) =>
    setNotices((list) => [...list.filter((n) => n.until > nowRef.current), { id: nowRef.current + list.length, x, y, z, text, until: nowRef.current + ms }]);
  // 隨機找一位沒在工作（閒晃或打瞌睡）、沒在聊天、沒被叫去做別的事的人
  const pickIdle = (exclude: string[] = []): string | null => {
    const idle = Object.entries(simsRef.current)
      .filter(([id, s]) => id !== USER && (s.mode === "idle" || s.mode === "sleep") && !s.talkTo && s.z === 0 && !errandsRef.current[id] && !exclude.includes(id))
      .map(([id]) => id);
    return idle.length ? pick(idle) : null;
  };
  // 叫某人去某個位置，到了之後待 stay 毫秒再自由活動；onDone(到了沒)
  const runErrand = (agent: string, spot: Rest, stay: number, onDone?: (arrived: boolean) => void) => {
    setErrands((e) => ({ ...e, [agent]: { spot } }));
    let waited = 0;
    let arrivedAt = -1;
    const timer = setInterval(() => {
      waited += 500;
      const sim = simsRef.current[agent];
      if (arrivedAt < 0 && sim?.rest && Math.hypot(sim.x - spot.x, sim.y - spot.y) < 0.25) arrivedAt = waited;
      if ((arrivedAt >= 0 && waited - arrivedAt >= stay) || (arrivedAt < 0 && waited > 60000)) {
        clearInterval(timer);
        setErrands((e) => {
          const next = { ...e };
          delete next[agent];
          return next;
        });
        onDone?.(arrivedAt >= 0);
      }
    }, 500);
  };
  // 點空閒的設施（沙發、溜滑梯、睡眠艙、飛天掃帚…）：通常會有閒著的人過來用；偶爾設備在保養
  const facilities = useMemo(() => {
    const seen = new Set<string>();
    return [...plan.hangouts, ...plan.napSpots, ...plan.workSpots].filter((s) => {
      if (!s.key || s.key.startsWith("desk:") || /tetris|pinball|coffee|cauldron/.test(s.key) || seen.has(s.key)) return false;
      seen.add(s.key);
      return true;
    });
  }, [plan]);
  const summonToFacility = (spot: Rest) => {
    const key = spot.key!;
    const z = (spot.z ?? 0) + 60;
    if ((maintenance[key] ?? 0) > now) return notify(spot.x, spot.y, z, "🔧 器材保養中，晚點再來");
    if (chance(0.15)) {
      setMaintenance((m) => ({ ...m, [key]: now + 45000 }));
      return notify(spot.x, spot.y, z, "🔧 器材保養中", 6000);
    }
    if (Object.values(sims).some((s) => s.goal?.key === key)) return notify(spot.x, spot.y, z, "有人正在用喔");
    const agent = pickIdle();
    if (!agent) return notify(spot.x, spot.y, z, "大家都在忙，沒人有空");
    runErrand(agent, spot, spot.pose === "ride" ? 60000 : 20000);
    notify(spot.x, spot.y, z, `${agentLabel(agent, departments).split("・").at(-1)} 來了！`);
  };

  // ── 魔藥大鍋：有人拿大湯匙攪拌 → 魔藥做好（冒紫色泡泡）→ 隨機一位閒著的人來喝 → 變成動物五分鐘 ──
  const brewPotion = (event: React.MouseEvent) => {
    event.stopPropagation();
    const pot = plan.cauldron;
    if (drag.current?.moved || potion || !pot) return;
    const stirrer = pickIdle();
    if (!stirrer) return notify(pot.x, pot.y, 70, "大家都在忙，沒人有空攪拌");
    setPotion("brewing");
    notify(pot.x, pot.y, 70, "🪄 拿大湯匙來攪拌魔藥！");
    runErrand(stirrer, pot.spot, 7000, (ok) => {
      if (!ok) return setPotion(null);
      setPotion("ready");
      let tries = 0;
      const wait = setInterval(() => {
        const drinker = pickIdle([stirrer]) ?? (tries > 20 ? stirrer : null);
        tries++;
        if (!drinker) return;
        clearInterval(wait);
        runErrand(drinker, { ...pot.spot, pose: "stand", label: "在喝魔藥" }, 2500, (drank) => {
          setPotion(null);
          if (!drank) return;
          const animal = pick([...ANIMALS]);
          setAnimals((a) => ({ ...a, [drinker]: { kind: animal.kind, until: nowRef.current + ANIMAL_MS } }));
          notify(pot.x, pot.y, 70, `${animal.emoji} 變成${animal.name}了！（五分鐘）`, 6000);
        });
      }, 1000);
    });
  };

  // ── 咖啡機：冒蒸氣煮 2.5 秒 → 做好一杯 → 隨機一位閒著的人走過來拿走，邊走邊喝 ──
  const brewCoffee = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (drag.current?.moved || coffee || !plan.coffee) return;
    setCoffee({ phase: "brewing", taker: null });
    const spotKey = plan.coffee.spot.key;
    let waited = 0;
    let taker: string | null = null;
    const timer = setInterval(() => {
      waited += 500;
      if (waited < 2500) return;
      const all = simsRef.current;
      if (!taker) {
        const idle = Object.entries(all).filter(([id, s]) => id !== USER && (s.mode === "idle" || s.mode === "sleep") && !s.talkTo && s.z === 0 && !errandsRef.current[id]).map(([id]) => id);
        if (!idle.length) {
          // 現在大家都在忙：咖啡先放著，等有人閒下來（最多等一分鐘）
          setCoffee({ phase: "ready", taker: null });
          if (waited > 60000) {
            clearInterval(timer);
            setCoffee(null);
          }
          return;
        }
        taker = pick(idle);
        setCoffee({ phase: "fetch", taker });
        return;
      }
      const sim = all[taker];
      if (sim?.rest && sim.goal?.key === spotKey) {
        clearInterval(timer);
        setCoffee(null);
        const who = taker;
        setDrinking((d) => ({ ...d, [who]: nowRef.current + 30000 }));
      } else if (waited > 90000) {
        clearInterval(timer);
        setCoffee(null);
      }
    }, 500);
  };

  // 玩完回到辦公室分頁：老闆再玩一下下就離開機台
  useEffect(() => {
    if (!arcade?.opened || arcade.blocked) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      timer = setTimeout(() => setArcade(null), 12000);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(timer);
    };
  }, [arcade]);

  // ── SVG 在畫面上的大小與位置 ──
  // 樓層圖會等比例縮放、置中（上下或左右可能留白），這裡算出縮放比例和留白，
  // 才能把對話框放在人物頭上、把拖曳的距離換算回 SVG 座標
  const svgRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0, scale: 1, left: 0, top: 0 });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(() => {
      const width = svg.clientWidth;
      const height = svg.clientHeight;
      const scale = Math.min(width / plan.viewW, height / plan.viewH);
      setBox({ width, height, scale, left: (width - plan.viewW * scale) / 2, top: (height - plan.viewH * scale) / 2 });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [plan]);
  const toScreen = (x: number, y: number, lift: number): [number, number] => {
    const [sx, sy] = project(plan, x, y);
    return [box.left + (sx * view.k + view.x) * box.scale, box.top + ((sy - lift) * view.k + view.y) * box.scale];
  };

  // ── 拖曳平移 ──
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (!drag.current.moved && Math.hypot(dx, dy) < 4) return; // 移動太少當作點擊
    if (!drag.current.moved) e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: true };
    setView((v) => ({ ...v, x: v.x + dx / box.scale, y: v.y + dy / box.scale }));
  };
  const onPointerUp = () => {
    // 延後清除，讓 click 事件能判斷剛剛是不是在拖曳
    setTimeout(() => (drag.current = null), 0);
  };
  const zoom = useCallback(
    (factor: number) => {
      setView((v) => {
        const k = Math.min(4, Math.max(0.6, v.k * factor));
        // 以畫面中心為基準縮放
        const cx = plan.viewW / 2;
        const cy = plan.viewH / 2;
        return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
      });
    },
    [plan],
  );

  // 打開某個人的資訊：老闆 → 公司總覽；其他人 → 員工詳細資訊（兩個面板一次只開一個）
  const showInfo = (agent: string) => {
    setSelectedRoom(null);
    setCompanyOpen(agent === USER);
    setSelected(agent === USER ? null : agent);
  };

  // 點人物：秘書、總經理 → 對話框 + 交辦資訊（手機只開資訊）；其他人 → 詳細資訊（再點一次關閉）
  const select = (agent: string, event: React.MouseEvent) => {
    event.stopPropagation(); // 不要同時觸發「點辦公區」
    if (drag.current?.moved) return;
    // 點打瞌睡的人：嚇一跳、頭上冒出「！」，過一下又睡回去
    if (sims[agent]?.pose === "sleep") setStartled((s) => ({ ...s, [agent]: now + 1600 }));
    if (onTalk && TALKERS.includes(agent)) {
      showInfo(agent);
      if (box.width >= 640) onTalk(agent);
    } else if (selected === agent) setSelected(null);
    else showInfo(agent);
  };

  // 點辦公桌（含桌上的名牌）：請他走回座位坐下，打開對話框跟他聊
  //   老闆桌 → 公司總覽；首頁展示（不能對話）→ 詳細資訊
  const callToDesk = (agent: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (drag.current?.moved) return;
    // 你的辦公桌：在新分頁打開第一人稱的辦公桌畫面（可以寫筆記）；首頁展示沒有登入，改開公司總覽
    if (agent === USER && !demo) {
      window.open("/desk", "_blank");
      return;
    }
    if (agent === USER || !onTalk) return showInfo(agent);
    setSelectedRoom(null);
    setCompanyOpen(false);
    setSelected(null);
    onTalk(agent);
  };

  // 點地板：換算成世界座標，看點到哪一間辦公區
  const pickRoom = (event: React.MouseEvent<SVGSVGElement>) => {
    if (drag.current?.moved) return;
    const svg = event.currentTarget;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    // 去掉拖曳與縮放，再反推等角投影
    const px = (point.x - view.x) / view.k;
    const py = (point.y - view.y) / view.k;
    const a = (px - plan.originX) / (TILE_W / 2); // = x − y
    const b = (py - plan.originY) / (TILE_H / 2); // = x + y
    const x = (a + b) / 2;
    const y = (b - a) / 2;
    const room = plan.rooms.find((r) => x >= r.ox && x < r.ox + ROOM && y >= r.oy && y < r.oy + ROOM);
    setSelected(null);
    setCompanyOpen(false);
    // 點到設施附近（點在高的家具上時，換算出來的位置會偏後面，所以也往前找一點）
    const near = (s: Rest) => Math.min(Math.hypot(s.x - x, s.y - y), Math.hypot(s.x - x - 0.7, s.y - y - 0.7));
    const facility = facilities.filter((s) => near(s) < 1.2).sort((a, b) => near(a) - near(b))[0];
    if (facility) {
      setSelectedRoom(null);
      return summonToFacility(facility);
    }
    // 點老闆辦公室（艦長室、校長室…）：打開公司總覽（願景、年度／本月／本週目標）
    if (room?.kind === "boss") {
      setSelectedRoom(null);
      setCompanyOpen(true);
      return;
    }
    // 點會議室：打開會議室視窗、召集主管開會（已經在開會就維持原樣）
    if (room?.kind === "meeting") {
      setSelectedRoom(null);
      if (!meeting) setMeeting({ departments: departments.map((d) => d.id), assistant: false });
      return;
    }
    setSelectedRoom(room && selectedRoom?.id !== room.id ? room : null);
  };

  // ── 組合畫面 ──
  const allScenery = useMemo(() => sceneItems(plan), [plan]);
  const scenery = useMemo(() => allScenery.filter((d) => !d.behind), [allScenery]);
  const background = useMemo(
    () => (
      <Background
        plan={plan}
        behind={allScenery
          .filter((d) => d.behind)
          .sort((a, b) => a.depth - b.depth)
          .map((d) => <g key={d.key}>{d.node}</g>)}
      />
    ),
    [plan, allScenery],
  );
  const shirtOf = (agent: string) => plan.shirts[agent.split(".")[0]];
  const bossLook = { gender: bossGender, style };
  const screenOf = (sim: Sim) => project(plan, sim.x, sim.y, sim.z);

  // 被點醒的人暫時坐直（桌前）或坐起來（沙發、睡眠艙）
  const poseOf = (agent: string, sim: Sim): Pose => (startled[agent] > now && sim.pose === "sleep" ? (sim.goal?.key?.startsWith("desk:") ? "sit" : "lounge") : sim.pose);
  const resting = plan.seats.filter((s) => sims[s.agent]?.rest);
  const moving = plan.seats.filter((s) => sims[s.agent] && !sims[s.agent].rest);

  // ── 桌上的名牌與工作膠囊（貼在桌子正面）──
  const titles = useMemo(
    () => Object.fromEntries(plan.seats.map((s) => [s.agent, agentProfile(s.agent, departments)?.shortTitle ?? ""])),
    [plan, departments],
  );
  const activeMissions = missions.filter((m) => !["completed", "failed", "cancelled"].includes(m.status)).length;
  const capsuleOf = (agent: string): Capsule => {
    const sim = sims[agent];
    const work = statuses?.[agent]?.work ?? null;
    if (agent === USER) return { text: activeMissions ? `交辦 ${activeMissions} 項` : "沒有交辦", color: "#c9a227", progress: null };
    if (sim?.mode === "meeting") return { text: "開會中", color: phaseColor("開會"), progress: null };
    if (dialog?.agent === agent) return { text: "跟你對話中", color: phaseColor("執行"), progress: null };
    if ((statuses?.[agent]?.decisions ?? 0) > 0) return { text: "❗ 等你決定", color: "#f29900", progress: null };
    if (work) return { text: `${work.phase} ${work.progress}%`, color: phaseColor(work.phase), progress: work.progress };
    if (sim?.pose === "sleep") return { text: "休息中", color: phaseColor("休息"), progress: null };
    return { text: "待命中", color: phaseColor("待命"), progress: null };
  };
  // 名牌畫在家具和坐著的人上面（不參與深度排序），才不會被前一排的桌子擋住
  const deskTags = plan.seats.map((seat) => {
    const boss = seat.agent === USER;
    // 桌子正面的中間（辦公桌深 0.8 格、老闆桌深 1 格）
    const [x, y] = project(plan, seat.x, seat.y + (boss ? 1.35 : 1.15));
    return <DeskTag key={`${seat.agent}-desktag`} id={seat.agent} x={x} y={y} title={titles[seat.agent]} gold={boss} capsule={capsuleOf(seat.agent)} onClick={(e) => callToDesk(seat.agent, e)} />;
  });

  // 家具 + 停在定點上的人，一起依深度排序（人坐在椅子上、桌子後面、沙發前面）
  const sorted: Drawable[] = [
    ...scenery,
    ...resting.map(({ agent }) => {
      const sim = sims[agent];
      const [sx, sy] = screenOf(sim);
      return {
        depth: depthOf(sim.x, sim.y) + (sim.goal?.bias ?? 0),
        key: agent,
        node: (
          <g transform={`translate(${sx} ${sy})`} onClick={(e) => select(agent, e)} className="cursor-pointer" role="button" aria-label={`人物：${agentLabel(agent, departments)}`}>
            {highlight.includes(agent) && <HighlightRing />}
            <g className={startled[agent] > now ? "startle-jump" : undefined}>
            {(animals[agent]?.until ?? 0) > now ? (
              <Animal kind={animals[agent].kind} pose={sim.pose} />
            ) : (
              <Character agent={agent} pose={poseOf(agent, sim)} shirt={shirtOf(agent)} boss={agent === USER ? bossLook : undefined} outfit={plan.config.outfit} />
            )}
            </g>
          </g>
        ),
      };
    }),
  ].sort((a, b) => a.depth - b.depth);

  const count = (test: (sim: Sim) => boolean) => plan.seats.filter((s) => sims[s.agent] && test(sims[s.agent])).length;
  const working = count((s) => s.mode === "work" && s.rest);
  const sleeping = count((s) => s.pose === "sleep");
  const inMeeting = count((s) => s.mode === "meeting");
  const roaming = plan.seats.length - working - sleeping - inMeeting;

  return (
    <div
      className={`relative overflow-hidden ${fill ? "h-full" : "rounded-2xl border border-line"}`}
      style={{ background: plan.theme.background }}
    >
      {transition > 0 && <div key={transition} className="theme-flash pointer-events-none absolute inset-0 z-20" aria-hidden="true" />}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${plan.viewW} ${plan.viewH}`}
        className={`block w-full cursor-grab touch-none select-none active:cursor-grabbing ${fill ? "h-full" : ""}`}
        role="img"
        aria-label={`辦公室樓層：${working} 位工作中、${sleeping} 位在睡覺`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={pickRoom}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g key={transition} className={transition ? "theme-zoom" : undefined}>
          {background}
          <Whiteboard plan={plan} items={missions} />
          {/* 點選的辦公區：地板加上一圈亮框 */}
          {selectedRoom && <RoomHighlight plan={plan} room={selectedRoom} />}
          {meeting && plan.rooms.find((r) => r.kind === "meeting") && <RoomHighlight plan={plan} room={plan.rooms.find((r) => r.kind === "meeting")!} />}
          {sorted.map((d) => (
            <g key={d.key}>{d.node}</g>
          ))}
          {deskTags}
          {plan.arcades.map((a) => (
            <ArcadeSign key={a.game} plan={plan} arcade={a} active={arcade?.game === a.game} onClick={(e) => playArcade(a.game, e)} />
          ))}
          {plan.coffee && <CoffeeMachine plan={plan} phase={coffee?.phase ?? null} onClick={brewCoffee} />}
          {plan.cauldron && <Cauldron plan={plan} phase={potion} onClick={brewPotion} />}
          {plan.book && <MagicBook plan={plan} missions={missions} />}

          {/* 走動中的人：用 CSS transition 滑到目的地 */}
          {moving.map(({ agent }) => {
            const sim = sims[agent];
            const [sx, sy] = screenOf(sim);
            return (
              <g
                key={agent}
                style={{ transform: `translate(${sx}px, ${sy}px)`, transition: `transform ${sim.dur}ms linear` }}
                onClick={(e) => select(agent, e)}
                className="cursor-pointer"
                role="button"
                aria-label={`人物：${agentLabel(agent, departments)}`}
              >
                {highlight.includes(agent) && <HighlightRing />}
                <g transform={sim.flip ? "scale(-1 1)" : undefined}>
                  {(animals[agent]?.until ?? 0) > now ? (
              <Animal kind={animals[agent].kind} pose={sim.pose} />
            ) : (
              <Character agent={agent} pose={poseOf(agent, sim)} shirt={shirtOf(agent)} boss={agent === USER ? bossLook : undefined} outfit={plan.config.outfit} />
            )}
                </g>
              </g>
            );
          })}

          {/* 呼吸感環境：光影起伏、走道上的小機器人、天空的流星或魔法光點 */}
          <Ambient plan={plan} />
          </g>

          {/* 頭上的標示：老闆的金色名牌、工作中的「…」、點選的人顯示名牌 */}
          {plan.seats.map(({ agent }) => {
            const sim = sims[agent];
            if (!sim || dialog?.agent === agent) return null;
            if (startled[agent] > now) return <AlertBadge key={`${agent}-startle`} x={screenOf(sim)[0]} y={screenOf(sim)[1] - headHeight(poseOf(agent, sim))} icon="！" color="#ea4335" />;
            // ❗ 有事等你決定；⏰ 秘書提醒你預定的會議時間到了
            if (!demo && (statuses?.[agent]?.decisions ?? 0) > 0)
              return <AlertBadge key={`${agent}-alert`} x={screenOf(sim)[0]} y={screenOf(sim)[1] - headHeight(sim.pose)} icon="❗" color="#f29900" />;
            if (agent === EXECUTIVE_ASSISTANT && reminder && !meeting)
              return <AlertBadge key={`${agent}-alert`} x={screenOf(sim)[0]} y={screenOf(sim)[1] - headHeight(sim.pose)} icon="⏰" color="#1a73e8" />;
            const [sx, sy] = screenOf(sim);
            const top = sy - headHeight(sim.pose);
            const line = talkLine(sim, agent, now);
            if (agent === USER)
              return (
                <g key={`${agent}-tag`}>
                  <NameTag x={sx} y={top - 6} name={`老闆 ${userName}`} gold />
                  {line ? <SpeechBubble x={sx} y={top - 28} text={line} /> : sim.mode === "play" && sim.rest && <SpeechBubble x={sx} y={top - 28} text="🎮 玩得正開心！" />}
                </g>
              );
            if (line) return <SpeechBubble key={`${agent}-say`} x={sx} y={top} text={line} />;
            if (drinking[agent] > now) return <SpeechBubble key={`${agent}-coffee`} x={sx} y={top} text="☕ 喝咖啡中" />;
            if (coffeeTaker === agent) return <SpeechBubble key={`${agent}-coffee`} x={sx} y={top} text="☕ 我去拿！" />;
            if (meeting && attendees.includes(agent)) {
              if (meetingPending) return <ThinkingDots key={`${agent}-dots`} x={sx} y={top} />;
              if (meetingSpeech[agent]) return <NameTag key={`${agent}-say`} x={sx} y={top} name={`💬 ${meetingSpeech[agent]}`} />;
            }
            if (sim.rest && sim.mode === "work" && statuses?.[agent]?.task) return <ThinkingDots key={`${agent}-dots`} x={sx} y={top} />;
            if (selected === agent) return <NameTag key={`${agent}-tag`} x={sx} y={top} name={agentLabel(agent, departments)} />;
            // 變成動物的人：頭上一個小名牌
            const animal = (animals[agent]?.until ?? 0) > now ? ANIMALS.find((a) => a.kind === animals[agent].kind) : null;
            if (animal) return <NameTag key={`${agent}-animal`} x={sx} y={sy - 30} name={`${animal.emoji} ${agentLabel(agent, departments).split("・").at(-1)}`} />;
            return null;
          })}
          {/* 設施旁的提示：有人來了、器材保養中… */}
          {notices
            .filter((n) => n.until > now)
            .map((n) => {
              const [nx, ny] = project(plan, n.x, n.y, n.z);
              return <SpeechBubble key={n.id} x={nx} y={ny} text={n.text} />;
            })}
        </g>
      </svg>

      {/* 寶可夢風格對話框：寬螢幕出現在說話的人頭上；手機樓層太小，改放在畫面下方 */}
      {dialog && sims[dialog.agent] && (() => {
        const sim = sims[dialog.agent];
        const [left, top] = toScreen(sim.x, sim.y, headHeight(sim.pose) + sim.z);
        const docked = box.width < 640;
        return (
          <RetroDialog
            // 對話框不要超出樓層左右兩邊
            x={Math.min(Math.max(left, 175), Math.max(175, box.width - 175))}
            y={Math.max(top, 190)}
            docked={docked}
            name={agentLabel(dialog.agent, departments)}
            text={dialog.text}
            pending={dialog.pending}
            onSend={demo ? undefined : onSend}
            onClose={demo ? undefined : onCloseDialog}
            onHistory={demo ? undefined : onHistory}
          />
        );
      })()}

      {/* 點選辦公區後的資訊面板 */}
      {selectedRoom && <RoomPanelFor plan={plan} room={selectedRoom} rooms={demo ? null : rooms} missions={missions} sims={sims} departments={departments} onClose={() => setSelectedRoom(null)} />}

      {/* 上方：額外按鈕（左）、辦公室風格切換（右） */}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap gap-2">{actions}</div>
        <div className="pointer-events-auto relative flex shrink-0 flex-col items-end gap-2">
        {onStyleChange && <ThemePicker style={style} onChange={onStyleChange} />}
        </div>
      </div>

      {/* 老闆在玩遊戲機：自動開分頁被瀏覽器擋下時，給你一個按鈕 */}
      {arcade && (
        <div className="absolute top-14 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-pink-200 bg-white/95 py-1.5 pr-1.5 pl-4 text-xs shadow-lg backdrop-blur dark:bg-surface">
          <span>
            {GAMES[arcade.game].emoji} {arcade.opened ? (arcade.blocked ? "準備好了！" : "遊戲在新分頁開好了") : `老闆正走向${GAMES[arcade.game].name}…`}
          </span>
          {arcade.opened && (
            <a href={`/games/${arcade.game}`} target="_blank" rel="noopener" className="rounded-full bg-pink-400 px-3 py-1 font-medium text-white hover:bg-pink-500">
              {arcade.blocked ? "開始遊戲 →" : "再開一次"}
            </a>
          )}
          <button type="button" onClick={() => setArcade(null)} className="rounded-full px-2 py-1 text-muted hover:bg-ink/5">
            不玩了
          </button>
        </div>
      )}

      {/* 點選人物後的詳細資訊 */}
      {selected && (() => {
        const status = statuses?.[selected];
        const { state, place } = describe(sims[selected], status);
        const last = status?.lastActiveAt ? Math.round((now - new Date(status.lastActiveAt).getTime()) / 60000) : null;
        return (
          <AgentPanel
            key={selected}
            agent={selected}
            departments={departments}
            shirt={shirtOf(selected)}
            state={state}
            place={place}
            work={status?.work ?? null}
            lastActiveMinutes={last}
            demoDetail={demo ? demoDetail(status) : undefined}
            onClose={() => setSelected(null)}
            onTalk={onTalk && TALKERS.includes(selected) ? () => { setSelected(null); onTalk(selected); } : undefined}
            onOpenMission={onOpenMission}
            onDecided={() => setStatusVersion((v) => v + 1)}
            reminder={selected === EXECUTIVE_ASSISTANT ? reminder : null}
            onStartMeeting={(schedule) => {
              // 從預定會議開始：依時程的列席部門召開會議，主題先填好
              fetch(`/api/office/schedules/${schedule.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "started" }) });
              setReminder(null);
              setSelected(null);
              setMeetingTopic(schedule.title);
              setMeeting({ departments: schedule.departments.length ? schedule.departments : departments.map((d) => d.id), assistant: false });
            }}
            onDispatch={
              onDispatch && !demo
                ? (message) => {
                    onDispatch(selected, message);
                    if (box.width < 640) setSelected(null); // 手機：關掉面板，才看得到對話框
                  }
                : undefined
            }
          />
        );
      })()}

      {/* 會議室視窗（手機上打開公司總覽時先藏起來，避免疊在一起） */}
      {meeting && (
        <div className={companyOpen ? "max-sm:hidden" : ""}>
          <MeetingRoom
            departments={departments}
            attendees={meeting}
            onAttendees={setMeeting}
            topic={meetingTopic}
            demo={demo}
            onEnd={() => {
              setMeeting(null);
              setMeetingTopic("");
              setMeetingSpeech({});
            }}
            onSpeech={setMeetingSpeech}
            onPending={setMeetingPending}
            onOpenCompany={() => {
              setSelected(null);
              setCompanyOpen(true);
            }}
            onOpenMission={demo ? undefined : onOpenMission}
          />
        </div>
      )}

      {/* 點老闆後的公司總覽 */}
      {companyOpen && (
        <CompanyPanel
          userName={userName}
          bossGender={bossGender}
          onBossGenderChange={demo ? undefined : onBossGenderChange}
          demoData={demo ? demoCompany(plan, departments) : undefined}
          onClose={() => setCompanyOpen(false)}
          onOpenMission={demo ? undefined : onOpenMission}
        />
      )}

      {/* 控制列：一般版面在手機上放在樓層下方；填滿模式一律浮在樓層底部 */}
      <div
        className={`flex items-center justify-between gap-2 ${fill ? "pointer-events-none absolute inset-x-3 bottom-3" : "border-t border-line bg-surface/90 p-2 sm:absolute sm:inset-x-3 sm:bottom-3 sm:border-0 sm:bg-transparent sm:p-0"}`}
      >
        <p className="pointer-events-auto flex gap-2.5 whitespace-nowrap rounded-full border border-line bg-surface/90 px-3 py-1.5 text-[11px] shadow-sm backdrop-blur sm:text-xs">
          <span><span className="text-accent">●</span> 工作 {working}</span>
          {inMeeting > 0 && <span><span className="text-blue-600">●</span> 開會 {inMeeting}</span>}
          <span><span className="text-gold">●</span> 走動 {roaming}</span>
          <span><span className="text-muted">●</span> 睡覺 {sleeping}</span>
        </p>
        <div className="pointer-events-auto flex shrink-0 overflow-hidden rounded-full border border-line bg-surface/90 text-sm shadow-sm backdrop-blur">
          <button type="button" onClick={() => zoom(1.25)} className="px-3 py-1.5 hover:bg-ink/5" aria-label="放大">＋</button>
          <button type="button" onClick={() => zoom(0.8)} className="border-x border-line px-3 py-1.5 hover:bg-ink/5" aria-label="縮小">－</button>
          <button type="button" onClick={() => setView({ x: 0, y: 0, k: 1 })} className="px-3 py-1.5 hover:bg-ink/5">全貌</button>
        </div>
      </div>
    </div>
  );
}

// ── 頭上的小元件 ────────────────────────────────────

function ThinkingDots({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} className="pointer-events-none">
      <rect x={-16} y={-18} width={32} height={16} rx={8} fill="#ffffff" stroke="#16150f" strokeWidth={1.5} />
      {[-7, 0, 7].map((cx, i) => (
        <circle key={cx} cx={cx} cy={-10} r={2} fill="#16150f" className="zzz" style={{ animationDuration: "1.2s", animationDelay: `${i * 0.2}s` }} />
      ))}
    </g>
  );
}

// 主題選單：右上角的按鈕，展開後列出所有主題（還在製作中的顯示「即將推出」）
function ThemePicker({ style, onChange }: { style: OfficeStyle; onChange: (style: OfficeStyle) => void }) {
  const [open, setOpen] = useState(false);
  const current = OFFICE_STYLES.find((s) => s.id === style) ?? OFFICE_STYLES[0];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur hover:bg-ink/5"
      >
        <span aria-hidden="true">{current.emoji}</span>
        {current.name}
        <span aria-hidden="true" className="text-muted">▾</span>
      </button>
      {open && (
        <ul role="listbox" aria-label="辦公室主題" className="absolute top-full right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 text-sm shadow-xl">
          {OFFICE_STYLES.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                role="option"
                aria-selected={style === s.id}
                disabled={!s.ready}
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${style === s.id ? "bg-accent-soft" : "hover:bg-ink/5"}`}
              >
                <span aria-hidden="true" className="text-lg leading-none">{s.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    {s.name}
                    {!s.ready && <span className="rounded-full bg-ink/10 px-1.5 text-[10px] font-normal">即將推出</span>}
                    {style === s.id && <span className="text-accent">✓</span>}
                  </span>
                  <span className="block text-xs text-muted">{s.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 魔藥大鍋的點擊範圍與泡泡：攪拌中冒綠色泡泡、做好了冒紫色泡泡
function Cauldron({ plan, phase, onClick }: { plan: Plan; phase: "brewing" | "ready" | null; onClick: (e: React.MouseEvent) => void }) {
  const c = plan.cauldron!;
  const [x, y] = project(plan, c.x, c.y, 26);
  const color = phase === "ready" ? "#c084fc" : "#86efac";
  return (
    <g>
      <circle cx={x} cy={y + 10} r={24} fill="transparent" className="cursor-pointer" role="button" aria-label="熬一鍋魔藥" onClick={onClick}>
        <title>熬一鍋魔藥</title>
      </circle>
      {phase && (
        <g className="pointer-events-none">
          {[0, 1, 2, 3].map((i) => (
            <circle key={i} cx={x - 8 + i * 5} cy={y} r={3 + (i % 2) * 2} fill={color} opacity={0}>
              <animate attributeName="opacity" values="0;0.9;0" dur="1.4s" begin={`${i * 0.35}s`} repeatCount="indefinite" />
              <animateTransform attributeName="transform" type="translate" values={`0 0;${i % 2 ? 4 : -4} -34`} dur="1.4s" begin={`${i * 0.35}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
      )}
    </g>
  );
}

// 會議桌上漂浮的魔法書：點一下翻一頁（第一頁是會議錄，接著是每項交辦的進度，最後幾頁是咒語）
const SPELLS = ["⚡ 加速咒：交辦提早完成", "🛡️ 防錯咒：審閱更仔細", "💡 靈感咒：點子源源不絕", "🍀 幸運咒：今天一切順利"];
function MagicBook({ plan, missions }: { plan: Plan; missions: MissionItem[] }) {
  const [page, setPage] = useState(0);
  const pages = ["📖 魔法會議錄", ...missions.slice(0, 6).map((m) => `${m.title.slice(0, 9)}｜${m.progress}%`), ...SPELLS];
  const b = plan.book!;
  const [x, y] = project(plan, b.x, b.y, b.z);
  const left = pages[(page * 2) % pages.length];
  const right = pages[(page * 2 + 1) % pages.length];
  const wrap = (text: string) => [text.slice(0, 7), text.slice(7, 14)];
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="cursor-pointer"
      role="button"
      aria-label="翻魔法書"
      onClick={(e) => {
        e.stopPropagation();
        setPage((p) => p + 1);
      }}
    >
      <title>點一下翻頁</title>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0;0 -6;0 0" dur="3s" repeatCount="indefinite" />
        <ellipse cx={0} cy={6} rx={46} ry={16} fill="#fff3b0" opacity={0.25}>
          <animate attributeName="opacity" values="0.15;0.4;0.15" dur="3s" repeatCount="indefinite" />
        </ellipse>
        {/* 封面與兩頁 */}
        <path d="M -42 -4 L 0 4 L 42 -4 L 42 -34 L 0 -26 L -42 -34 Z" fill="#6b2f2f" />
        <path d="M -38 -6 L 0 1 L 0 -28 L -38 -35 Z" fill="#fbf3dc" />
        <path d="M 38 -6 L 0 1 L 0 -28 L 38 -35 Z" fill="#f6ecd0" />
        {[left, right].map((text, i) =>
          wrap(text).map((line, k) => (
            <text key={`${i}-${k}`} x={i ? 19 : -19} y={-20 + k * 8} textAnchor="middle" fontSize={5.6} fill="#5a3a22" transform={`skewY(${i ? -10 : 10})`}>
              {line}
            </text>
          )),
        )}
        {/* 翻頁：換頁時一張紙從右邊翻到左邊 */}
        {page > 0 && (
          <path key={page} fill="#fffaf0" stroke="#e3d3a8" strokeWidth={0.6} opacity={0.95} d="M 0 1 L 38 -6 L 38 -35 L 0 -28 Z">
            <animate attributeName="d" values="M 0 1 L 38 -6 L 38 -35 L 0 -28 Z;M 0 1 L 2 -10 L 2 -40 L 0 -28 Z;M 0 1 L -38 -6 L -38 -35 L 0 -28 Z" dur="0.5s" fill="freeze" />
            <animate attributeName="opacity" values="0.95;0.95;0" keyTimes="0;0.8;1" dur="0.5s" fill="freeze" />
          </path>
        )}
        <text y={-38} textAnchor="middle" fontSize={6} fill="#fff3b0">✦ ✦ ✦</text>
      </g>
    </g>
  );
}

// 變成動物（喝了魔藥，五分鐘）：像素小動物，走路時上下跳
function Animal({ kind, pose }: { kind: AnimalKind; pose: Pose }) {
  const body = { frog: "#5bbf4a", cat: "#f4a261", rabbit: "#f1f1f1", pig: "#f7a8c8", owl: "#a07a50" }[kind];
  const dark = { frog: "#3e8a32", cat: "#d9823f", rabbit: "#cfcfcf", pig: "#e07fa6", owl: "#7a5a3a" }[kind];
  return (
    <g shapeRendering="crispEdges" className={pose === "walk" ? "leg-a" : undefined}>
      <ellipse cx={0} cy={0} rx={9} ry={3.5} fill="#000" opacity={0.15} />
      <rect x={-8} y={-14} width={16} height={12} fill={body} />
      <rect x={-6} y={-24} width={12} height={10} fill={body} />
      {kind === "rabbit" && <><rect x={-5} y={-34} width={3} height={10} fill={body} /><rect x={2} y={-34} width={3} height={10} fill={body} /></>}
      {kind === "cat" && <><rect x={-6} y={-28} width={3} height={4} fill={dark} /><rect x={3} y={-28} width={3} height={4} fill={dark} /></>}
      {kind === "owl" && <><rect x={-6} y={-27} width={3} height={3} fill={dark} /><rect x={3} y={-27} width={3} height={3} fill={dark} /><rect x={-10} y={-13} width={3} height={8} fill={dark} /><rect x={7} y={-13} width={3} height={8} fill={dark} /></>}
      {kind === "pig" && <rect x={-3} y={-19} width={6} height={4} fill={dark} />}
      {kind === "frog" ? (
        <>
          <rect x={-7} y={-28} width={5} height={5} fill="#ffffff" />
          <rect x={2} y={-28} width={5} height={5} fill="#ffffff" />
          <rect x={-5} y={-26} width={2} height={2} fill="#1d1d1d" />
          <rect x={4} y={-26} width={2} height={2} fill="#1d1d1d" />
        </>
      ) : (
        <>
          <rect x={-4} y={-21} width={2} height={2} fill="#1d1d1d" />
          <rect x={2} y={-21} width={2} height={2} fill="#1d1d1d" />
        </>
      )}
      <rect x={-6} y={-4} width={3} height={3} fill={dark} />
      <rect x={3} y={-4} width={3} height={3} fill={dark} />
    </g>
  );
}

// 咖啡機的點擊範圍、煮咖啡時的蒸氣泡泡、做好的那杯咖啡
function CoffeeMachine({ plan, phase, onClick }: { plan: Plan; phase: "brewing" | "ready" | "fetch" | null; onClick: (e: React.MouseEvent) => void }) {
  const c = plan.coffee!;
  const [x, y] = project(plan, c.x, c.y, c.z);
  const [cx, cy] = project(plan, c.x + 0.45, c.y + 0.25, c.z - 18);
  return (
    <g>
      <circle cx={x} cy={y + 8} r={18} fill="transparent" className="cursor-pointer" role="button" aria-label="煮一杯咖啡" onClick={onClick}>
        <title>煮一杯咖啡</title>
      </circle>
      {phase && (
        <g className="pointer-events-none">
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={x - 3 + i * 3} cy={y} r={3 + i} fill="#ffffff" opacity={0}>
              <animate attributeName="opacity" values="0;0.85;0" dur="1.6s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
              <animateTransform attributeName="transform" type="translate" values="0 0;4 -26" dur="1.6s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
      )}
      {phase && phase !== "brewing" && (
        <g transform={`translate(${cx} ${cy})`} className="pointer-events-none">
          <rect x={-4} y={-8} width={8} height={8} rx={1.5} fill="#ffffff" stroke="#8a5a3b" />
          <path d="M 4 -6 q 3 0 3 2.5 q 0 2.5 -3 2.5" fill="none" stroke="#8a5a3b" />
          <rect x={-3} y={-7} width={6} height={2} fill="#6b4423" />
        </g>
      )}
    </g>
  );
}

// 頭上的提醒：❗（等你決定）、⏰（會議時間到了），上下跳動吸引注意
function AlertBadge({ x, y, icon, color }: { x: number; y: number; icon: string; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`} className="pointer-events-none">
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0; 0 -5; 0 0" dur="1s" repeatCount="indefinite" />
        <circle cy={-14} r={11} fill="#ffffff" stroke={color} strokeWidth={2.5} />
        <text y={-9.5} textAnchor="middle" fontSize={13}>{icon}</text>
      </g>
    </g>
  );
}

// 自然互動的對話泡泡（白底、下面有小尾巴）
function SpeechBubble({ x, y, text }: { x: number; y: number; text: string }) {
  const w = text.length * 10 + 14;
  return (
    <g transform={`translate(${x} ${y})`} className="pointer-events-none">
      <rect x={-w / 2} y={-24} width={w} height={18} rx={9} fill="#ffffff" stroke="#16150f" strokeWidth={1.2} />
      <path d="M -4 -6.5 L 0 -1 L 4 -6.5 Z" fill="#ffffff" stroke="#16150f" strokeWidth={1.2} />
      <rect x={-5} y={-7.5} width={10} height={2} fill="#ffffff" />
      <text y={-11} textAnchor="middle" fontSize={10} fill="#16150f">{text}</text>
    </g>
  );
}

// 遊戲機台：整台機器都可以點，上方飄著寫遊戲名稱的小招牌
function ArcadeSign({ plan, arcade, active, onClick }: { plan: Plan; arcade: Arcade; active: boolean; onClick: (e: React.MouseEvent) => void }) {
  const { x, y, w, d, h } = arcade;
  const P = (px: number, py: number, pz: number) => project(plan, px, py, pz).join(",");
  const outline = [P(x, y + d, 0), P(x + w, y + d, 0), P(x + w, y, 0), P(x + w, y, h + 30), P(x, y, h + 30), P(x, y + d, h + 30)].join(" ");
  const [sx, sy] = project(plan, x + w / 2, y + d / 2, h + 34);
  const { name, emoji } = GAMES[arcade.game];
  const label = `${emoji} ${name}`;
  const width = textWidth(label, 8) + 16;
  return (
    <g onClick={onClick} className="cursor-pointer" role="button" aria-label={`玩${name}`}>
      <polygon points={outline} fill="transparent" />
      <g transform={`translate(${sx} ${sy})`}>
        <g className="arcade-bob">
          <rect x={-width / 2} y={-12} width={width} height={15} rx={7.5} fill={active ? "#ff8fb8" : "#ffffff"} stroke="#ff8fb8" strokeWidth={1.5} />
          <text y={-1.5} textAnchor="middle" fontSize={8} fontWeight={700} fill={active ? "#ffffff" : "#d6336c"}>
            {label}
          </text>
          <path d="M -3 3 L 0 7 L 3 3 Z" fill="#ff8fb8" />
        </g>
      </g>
    </g>
  );
}

// 交辦事項打開時，參與的人腳下的黃色光圈
function HighlightRing() {
  return <ellipse cx={0} cy={0} rx={15} ry={6.5} fill="#fbbc05" fillOpacity={0.25} stroke="#fbbc05" strokeWidth={2.5} className="pointer-events-none" />;
}

function NameTag({ x, y, name, gold = false }: { x: number; y: number; name: string; gold?: boolean }) {
  const w = name.length * 12 + 16;
  return (
    <g transform={`translate(${x} ${y})`} className="pointer-events-none">
      <rect x={-w / 2} y={-20} width={w} height={18} rx={9} fill={gold ? "#c9a227" : "#16150f"} stroke={gold ? "#7a5c12" : "none"} />
      <text y={-7} textAnchor="middle" fontSize={11} fill={gold ? "#2b1b12" : "#f5f2ec"} fontWeight={700}>
        {name}
      </text>
    </g>
  );
}

const PLACE_NAMES: Record<string, string> = { break: "休憩間", library: "圖書館", game: "遊戲室", playground: "遊樂區", wellness: "紓壓室", garden: "花園" };

// 一個人現在在做什麼（state）、在哪裡（place）
function describe(sim: Sim | undefined, status: AgentStatus | undefined): { state: string; place?: string } {
  const room = sim ? PLACE_NAMES[sim.goal?.room ?? sim.room] : undefined;
  // 停在定點上時，定點的說明就是他在做的事（例如「在跑步機辦公桌邊走邊工作」）
  const doing = sim?.rest ? sim.goal?.label : undefined;
  const state =
    sim?.pose === "sleep"
      ? "睡覺中 💤"
      : sim?.mode === "meeting"
        ? sim.rest ? "開會中" : "趕去會議室"
        : sim?.mode === "talk"
          ? "正在跟你對話"
          : sim?.talkTo
            ? sim.talkTo === "user" ? "正在跟老闆聊天" : "正在跟同事聊天"
          : status?.task
            ? `工作中：${status.task}`
            : doing
              ? doing
              : sim?.moving
                ? room ? `正要去${room}` : "走動中"
                : room ? `在${room}放鬆` : "閒晃中";
  return { state, place: doing ?? (room ? `在${room}` : undefined) };
}

type Capsule = { text: string; color: string; progress: number | null };

// 估算文字寬度：中文字約一個字高，英文數字約一半
const textWidth = (text: string, size: number) =>
  [...text].reduce((sum, ch) => sum + (/[\x00-\x7f]/.test(ch) ? size * 0.58 : size * 1.02), 0);

// 桌子正面的職稱名牌 + 工作膠囊（膠囊底色依進度填滿）
function DeskTag({
  id, x, y, title, gold, capsule, onClick,
}: { id: string; x: number; y: number; title: string; gold: boolean; capsule: Capsule; onClick: (e: React.MouseEvent) => void }) {
  const plate = textWidth(title, 8.5) + 10;
  const width = Math.max(50, textWidth(capsule.text, 7) + 18);
  const clip = `capsule-${id.replace(/\W/g, "-")}`;
  return (
    <g transform={`translate(${x} ${y})`} onClick={onClick} className="cursor-pointer" role="button" aria-label={`${title}：${capsule.text}（點辦公桌請他回座位對話）`}>
      {/* 透明的點擊範圍：涵蓋整張桌子，比名牌好點 */}
      <rect x={-46} y={-50} width={92} height={56} fill="transparent" />
      {/* 名牌 */}
      <rect x={-plate / 2} y={-22} width={plate} height={12} rx={2} fill={gold ? "#c9a227" : "#202124"} />
      <text y={-13} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={gold ? "#2b1b12" : "#ffffff"}>
        {title}
      </text>
      {/* 工作膠囊：白底、彩色外框，進度用半透明色塊填滿 */}
      <clipPath id={clip}>
        <rect x={-width / 2} y={-7} width={width} height={11} rx={5.5} />
      </clipPath>
      <rect x={-width / 2} y={-7} width={width} height={11} rx={5.5} fill="#ffffff" />
      {capsule.progress !== null && (
        <rect x={-width / 2} y={-7} width={(width * capsule.progress) / 100} height={11} fill={capsule.color} opacity={0.28} clipPath={`url(#${clip})`} />
      )}
      <rect x={-width / 2} y={-7} width={width} height={11} rx={5.5} fill="none" stroke={capsule.color} strokeWidth={1.2} />
      <circle cx={-width / 2 + 6} cy={-1.5} r={2} fill={capsule.color} />
      <text x={4} y={1.4} textAnchor="middle" fontSize={7} fontWeight={700} fill="#202124">
        {capsule.text}
      </text>
    </g>
  );
}

// 點選的辦公區：地板外圍畫一圈亮框
function RoomHighlight({ plan, room }: { plan: Plan; room: Room }) {
  const corners = [
    project(plan, room.ox, room.oy),
    project(plan, room.ox + ROOM, room.oy),
    project(plan, room.ox + ROOM, room.oy + ROOM),
    project(plan, room.ox, room.oy + ROOM),
  ];
  return (
    <polygon
      points={corners.map(([a, b]) => `${a},${b}`).join(" ")}
      fill="#fbbc05"
      fillOpacity={0.15}
      stroke="#fbbc05"
      strokeWidth={4}
      className="pointer-events-none"
    />
  );
}

// 依辦公區種類，決定資訊面板要顯示什麼
function RoomPanelFor({
  plan, room, rooms, missions, sims, departments, onClose,
}: {
  plan: Plan;
  room: Room;
  rooms: Record<string, RoomInfo> | null; // null：首頁展示，用範例資料
  missions: MissionItem[];
  sims: Record<string, Sim>;
  departments: Department[];
  onClose: () => void;
}) {
  const empty: RoomInfo = { todo: [], done: [], progress: 0 };
  const here = plan.seats.filter((s) => sims[s.agent] && (sims[s.agent].goal?.room ?? sims[s.agent].room) === room.id).map((s) => agentLabel(s.agent, departments));

  switch (room.kind) {
    case "department": {
      const deptId = room.id.replace(/^dept-/, "");
      const dept = departments.find((d) => d.id === deptId);
      return (
        <RoomPanel
          title={room.name}
          subtitle={dept?.mission}
          info={rooms ? (rooms[deptId] ?? empty) : DEMO_ROOM}
          onClose={onClose}
        />
      );
    }
    case "boss":
      return <RoomPanel title="老闆辦公室" subtitle="你交辦的所有事項" missions={missions} onClose={onClose} />;
    case "gm":
      return <RoomPanel title="總經理室" subtitle="點總經理可以直接交辦工作、詢問進度" missions={missions.filter((m) => m.status !== "completed")} onClose={onClose} />;
    case "meeting":
      return <RoomPanel title="會議室" subtitle="大家正在集合開會。白板上是目前交辦事項的進度" missions={missions} onClose={onClose} />;
    case "assistant":
      return <RoomPanel title="秘書室" subtitle="點秘書可以聊生活、健康與行程" people={here} onClose={onClose} />;
    default:
      return <RoomPanel title={room.name} subtitle="成員沒有工作時，會來這裡放鬆" people={here} onClose={onClose} />;
  }
}
