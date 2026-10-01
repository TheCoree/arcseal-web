"use client";

import React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  describeStatus,
  groupStatuses,
  isDebuff,
  turnsLeft,
  type StatusGroup,
  type StatusTone,
} from "@/app/components/game/statusInfo";
import type { StatusEffect } from "@/app/components/game/types";

const CHIP_TONE: Record<StatusTone, string> = {
  good: "border-emerald-500/60 bg-emerald-950/70 text-emerald-200",
  bad: "border-rose-500/60 bg-rose-950/70 text-rose-200",
  special: "border-violet-500/60 bg-violet-950/70 text-violet-200",
};

const DOT_TONE: Record<StatusTone, string> = {
  good: "bg-emerald-600 text-white",
  bad: "bg-rose-600 text-white",
  special: "bg-violet-600 text-white",
};

export const TEXT_TONE: Record<StatusTone, string> = {
  good: "text-emerald-300",
  bad: "text-rose-300",
  special: "text-violet-300",
};

// Full explanation of one (possibly grouped) effect, for tooltips.
export function StatusExplainer({ group, suppressed }: { group: StatusGroup; suppressed?: boolean }) {
  const info = describeStatus(group.head);
  const extra = group.members.filter((m) => m !== group.head);
  const timer = turnsLeft(group.head) ?? extra.map(turnsLeft).find(Boolean) ?? null;
  return (
    <div className="max-w-[260px] space-y-1">
      <p className={cn("font-bold", TEXT_TONE[info.tone])}>{info.title}</p>
      {info.text && <p className="text-zinc-300 leading-snug">{info.text}</p>}
      {extra.length > 0 && (
        <ul className="space-y-0.5 text-zinc-300">
          {extra.map((m, i) => {
            const sub = describeStatus(m);
            const left = turnsLeft(m);
            return (
              <li key={i} className="flex items-center gap-1">
                <sub.Icon className={cn("h-3 w-3 shrink-0", TEXT_TONE[sub.tone])} />
                {sub.title}
                {left && <span className="text-zinc-500"> · {left}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {timer && <p className="text-zinc-400">⏳ {timer} этого героя</p>}
      {suppressed && <p className="text-emerald-400">Сейчас не действует — иммунитет к дебаффам</p>}
    </div>
  );
}

function suppressedBy(statuses: StatusEffect[], group: StatusGroup): boolean {
  return statuses.some((s) => s.name === "DEBUFF_IMMUNE") && isDebuff(group.head);
}

// Labelled chips (icon · name · turns left) for hero cards and the detail
// panel. Wraps instead of scrolling, so nothing hides off-screen.
export function StatusChips({ statuses, className }: { statuses: StatusEffect[]; className?: string }) {
  if (!statuses.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {groupStatuses(statuses).map((group) => {
        const info = describeStatus(group.head);
        const turns = group.head.duration >= 0 ? group.head.duration : null;
        const suppressed = suppressedBy(statuses, group);
        return (
          <Tooltip key={group.key}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-bold leading-none cursor-help",
                  CHIP_TONE[info.tone],
                  suppressed && "opacity-40 line-through",
                )}
              >
                <info.Icon className="h-3 w-3 shrink-0" />
                {info.short}
                {turns != null && (
                  <span className="ml-0.5 bg-black/45 px-1 py-px text-[9px] tabular-nums text-zinc-200" title="Осталось ходов">
                    {turns}
                  </span>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-zinc-900 text-zinc-100 border border-zinc-700 text-[11px] p-2.5">
              <StatusExplainer group={group} suppressed={suppressed} />
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

// Debuffs first: on an enemy that's what you plan around.
const TONE_ORDER: Record<StatusTone, number> = { bad: 0, special: 1, good: 2 };

// Ring radius of the HP ring, as a fraction of the token's box (see HpRing).
const RING_R = 0.475;
const PIP_STEP_DEG = 27;

// Effect pips riding the bottom arc of a battlefield token's HP ring. They
// stay inside the token's own box, so they can't be mistaken for a
// neighbour's or hidden under one. Details live in the token's tooltip.
export function RingStatusPips({ statuses, max = 4 }: { statuses: StatusEffect[]; max?: number }) {
  if (!statuses.length) return null;
  const groups = groupStatuses(statuses).sort(
    (a, b) => TONE_ORDER[describeStatus(a.head).tone] - TONE_ORDER[describeStatus(b.head).tone],
  );
  const overflow = groups.length > max;
  const shown = overflow ? groups.slice(0, max - 1) : groups;
  const slots = shown.length + (overflow ? 1 : 0);
  const pos = (i: number) => {
    const deg = 90 + (i - (slots - 1) / 2) * PIP_STEP_DEG;
    const rad = (deg * Math.PI) / 180;
    return { left: `${50 + RING_R * 100 * Math.cos(rad)}%`, top: `${50 + RING_R * 100 * Math.sin(rad)}%` };
  };
  return (
    <>
      {shown.map((group, i) => {
        const info = describeStatus(group.head);
        const suppressed = suppressedBy(statuses, group);
        return (
          <span
            key={group.key}
            className={cn(
              "absolute z-20 flex h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-2 ring-zinc-950 shadow-md pointer-events-none",
              DOT_TONE[info.tone],
              suppressed && "opacity-40 grayscale",
            )}
            style={pos(i)}
          >
            <info.Icon className="h-[62%] w-[62%]" />
          </span>
        );
      })}
      {overflow && (
        <span
          className="absolute z-20 flex h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-700 text-[9px] font-black text-white ring-2 ring-zinc-950 pointer-events-none"
          style={pos(shown.length)}
        >
          +{groups.length - shown.length}
        </span>
      )}
    </>
  );
}
