import type { Metadata } from "next";
import { GameShell } from "../game-shell";
import { Tetris } from "./tetris";

export const metadata: Metadata = { title: "俄羅斯方塊｜CollabOffice 遊戲室" };

export default function TetrisPage() {
  return (
    <GameShell
      title="俄羅斯方塊"
      emoji="🧱"
      help={
        <>
          鍵盤：← → 移動、↑ 旋轉、↓ 加速、空白鍵直接落下、P 暫停。手機：用下方按鈕操作。
          <br />
          每消 10 行升一級，方塊會越掉越快。
        </>
      }
    >
      <Tetris />
    </GameShell>
  );
}
