"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

// 手機上的遊戲按鈕：按下就觸發；repeat 的話按住會一直重複（例如方塊往左移），放開時呼叫 onRelease
export function HoldButton({
  onPress,
  onRelease,
  repeat = false,
  label,
  className,
  style,
  children,
}: {
  onPress: () => void;
  onRelease?: () => void;
  repeat?: boolean;
  label?: string;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clear = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const stop = () => {
    clear();
    onRelease?.();
  };
  return (
    <button
      type="button"
      aria-label={label}
      className={className}
      style={style}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
        if (repeat) {
          clear();
          timer.current = setInterval(onPress, 110);
        }
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {children}
    </button>
  );
}
