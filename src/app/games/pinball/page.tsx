import type { Metadata } from "next";
import { GameShell } from "../game-shell";
import { Pinball } from "./pinball";

export const metadata: Metadata = { title: "彈珠台｜CollabOffice 遊戲室" };

export default function PinballPage() {
  return (
    <GameShell
      title="彈珠台"
      emoji="🎯"
      help={
        <>
          按住空白鍵（或「發射」按鈕）拉彈簧，放開把彈珠打出去。← / Z 是左擋板、→ / M 是右擋板；手機點畫面左半邊、右半邊。
          <br />
          撞到糖果彈跳柱 +100，點亮上方三顆星星再 +2000。一局有 3 顆彈珠。
        </>
      }
    >
      <Pinball />
    </GameShell>
  );
}
