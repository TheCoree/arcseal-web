"use client";

import React, { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TurnClock } from "@/app/components/game/types";

// Seconds left at which the clock turns red and starts pulsing.
const URGENT_SECONDS = 15;

function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : String(s);
}

// Countdown for whoever is to move. `mine` colours it as "your clock" (amber)
// vs the opponent's (muted); either turns red in the last seconds. When it
// hits zero the server plays the turn for the idle side — `timeoutHint` says
// what that means here.
export function TurnTimer({
  clock,
  mine,
  timeoutHint = "Ход будет пропущен!",
  className,
}: {
  clock: TurnClock | null;
  mine: boolean;
  timeoutHint?: string;
  className?: string;
}) {
  // 0 until the first client tick, so server and client render the same markup.
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!clock) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 200);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [clock]);

  if (!clock) return null;

  const leftMs = now ? Math.max(0, clock.deadline - now) : clock.seconds * 1000;
  const frac = clock.seconds > 0 ? Math.min(1, leftMs / (clock.seconds * 1000)) : 0;
  const urgent = leftMs <= URGENT_SECONDS * 1000;
  const color = urgent ? "#f87171" : mine ? "#fbbf24" : "#71717a";

  const VB = 40;
  const stroke = 3.5;
  const r = (VB - stroke) / 2;
  const C = 2 * Math.PI * r;

  return (
    <div
      className={cn("flex items-center gap-2", urgent && mine && "animate-pulse", className)}
      title={mine ? "Ваше время на ход" : "Время соперника на ход"}
    >
      <div className="relative h-10 w-10 shrink-0">
        <svg viewBox={`0 0 ${VB} ${VB}`} className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx={VB / 2} cy={VB / 2} r={r} fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          <circle
            cx={VB / 2} cy={VB / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={C} strokeDashoffset={C * (1 - frac)} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.2s linear, stroke 0.3s ease" }}
          />
        </svg>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center font-black tabular-nums",
            leftMs >= 60_000 ? "text-[11px]" : "text-sm",
          )}
          style={{ color }}
        >
          {mmss(leftMs)}
        </span>
      </div>
      <div className="hidden sm:flex flex-col leading-tight">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Hourglass className="h-3 w-3" />
          {mine ? "Ваше время" : "Ход соперника"}
        </span>
        {urgent && (
          <span className="text-[10px] font-bold" style={{ color }}>
            {mine ? timeoutHint : "Сейчас истечёт"}
          </span>
        )}
      </div>
    </div>
  );
}
