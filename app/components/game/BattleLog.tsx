"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ScrollText } from "lucide-react";

import { cn } from "@/lib/utils";
import { intoZone } from "@/app/components/game/battleText";
import { TEXT_TONE } from "@/app/components/game/StatusChips";
import { describeStatus, turnsLeft } from "@/app/components/game/statusInfo";
import type {
  BattleEvent,
  BattleSnapshot,
  CharacterDef,
  LoggedEvent,
  Side,
} from "@/app/components/game/types";

// Collapsed, the log shows only the freshest lines.
const COLLAPSED_LINES = 4;

type Ctx = {
  battle: BattleSnapshot;
  byId: Map<string, CharacterDef>;
  mySide: Side;
};

function Name({ uid, ctx }: { uid: string | null | undefined; ctx: Ctx }) {
  if (!uid) return <span className="text-zinc-400">—</span>;
  const unit = ctx.battle.units[uid];
  const name = (unit && ctx.byId.get(unit.char_id)?.name) ?? uid;
  const mine = unit?.owner_side === ctx.mySide;
  return <span className={cn("font-bold", mine ? "text-emerald-300" : "text-rose-300")}>{name}</span>;
}

const MOVE_VERB: Record<string, string> = {
  walk: "идёт",
  dash: "делает рывок",
  relocate: "высаживается",
  swap: "меняется местами и оказывается",
};

// One log line: an icon plus a short sentence. Returns null for events that
// would only add noise.
function renderLine(ev: BattleEvent, ctx: Ctx): { icon: string; body: React.ReactNode; tone?: string } | null {
  switch (ev.t) {
    case "round":
      return { icon: "⟳", body: <span className="text-amber-300/90 font-bold">Раунд {ev.round}</span>, tone: "round" };
    case "attack":
      return { icon: "⚔", body: <><Name uid={ev.unit} ctx={ctx} /> атакует <Name uid={ev.target} ctx={ctx} /></> };
    case "ability": {
      const unit = ctx.battle.units[ev.unit];
      const ability = unit && ctx.byId.get(unit.char_id)?.abilities.find((a) => a.id === ev.ability_id);
      return {
        icon: "✧",
        body: (
          <>
            <Name uid={ev.unit} ctx={ctx} />: <span className="text-sky-300">«{ability?.name ?? ev.ability_id}»</span>
            {ev.target && <> → <Name uid={ev.target} ctx={ctx} /></>}
          </>
        ),
      };
    }
    case "damage": {
      const kind = ev.dtype === "MAGICAL" ? "маг." : ev.dtype === "POISON" ? "яд" : "физ.";
      return {
        icon: "✸",
        body: (
          <>
            <Name uid={ev.dst} ctx={ctx} /> <span className="text-red-400 font-black tabular-nums">−{ev.amount}</span>{" "}
            <span className="text-zinc-500">({kind}{ev.src && ev.dtype !== "POISON" ? <>, от <Name uid={ev.src} ctx={ctx} /></> : null})</span>
          </>
        ),
      };
    }
    case "heal":
      return {
        icon: "✚",
        body: <><Name uid={ev.dst} ctx={ctx} /> <span className="text-green-400 font-black tabular-nums">+{ev.amount}</span></>,
      };
    case "status": {
      // A multi-effect ability logs once, under its group's name.
      if (ev.group && ev.name !== ev.group) return null;
      const info = describeStatus({ name: ev.name, value: ev.value ?? undefined });
      const left = ev.duration != null ? turnsLeft({ duration: ev.duration }) : null;
      return {
        icon: "◈",
        body: (
          <>
            <Name uid={ev.dst} ctx={ctx} />: <span className={TEXT_TONE[info.tone]}>{info.title}</span>
            {left && <span className="text-zinc-500"> ({left})</span>}
          </>
        ),
      };
    }
    case "move":
      if (ev.cause === "pull") {
        return { icon: "⇜", body: <><Name uid={ev.by} ctx={ctx} /> притягивает <Name uid={ev.unit} ctx={ctx} /></> };
      }
      if (ev.cause === "carry") {
        return {
          icon: "➜",
          body: <><Name uid={ev.by} ctx={ctx} /> перевозит <Name uid={ev.unit} ctx={ctx} /> {intoZone(ev.to, ctx.mySide)}</>,
        };
      }
      return {
        icon: "➜",
        body: <><Name uid={ev.unit} ctx={ctx} /> {MOVE_VERB[ev.cause] ?? "перемещается"} {intoZone(ev.to, ctx.mySide)}</>,
      };
    case "death":
      return {
        icon: "☠",
        tone: "death",
        body: (
          <>
            <Name uid={ev.unit} ctx={ctx} /> погибает
            {ev.killer && <> — добил <Name uid={ev.killer} ctx={ctx} /></>}
            {ev.respawn_round != null && <span className="text-zinc-500"> · вернётся в раунде {ev.respawn_round}</span>}
          </>
        ),
      };
    case "respawn":
      return { icon: "✦", body: <><Name uid={ev.unit} ctx={ctx} /> возрождается</> };
    case "passive":
      return { icon: "✦", body: <><Name uid={ev.unit} ctx={ctx} />: <span className="text-violet-300">{ev.name}</span></> };
    case "skip":
      return {
        icon: "⏸",
        body: (
          <>
            <Name uid={ev.unit} ctx={ctx} />{" "}
            {ev.reason === "stun" ? "оглушён и пропускает ход" : "— время вышло, ход пропущен"}
          </>
        ),
      };
    default:
      return null;
  }
}

export function BattleLog({
  log,
  battle,
  byId,
  mySide,
  className,
}: {
  log: LoggedEvent[];
  battle: BattleSnapshot;
  byId: Map<string, CharacterDef>;
  mySide: Side;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const ctx: Ctx = { battle, byId, mySide };

  const lines = log
    .map((entry) => ({ key: entry.key, line: renderLine(entry.event, ctx) }))
    .filter((x): x is { key: number; line: NonNullable<ReturnType<typeof renderLine>> } => x.line !== null);
  const shown = expanded ? lines : lines.slice(-COLLAPSED_LINES);

  // Keep the newest line in view as the fight goes on.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length, expanded]);

  return (
    <div
      className={cn(
        "w-[340px] max-w-[80vw] border border-zinc-800 bg-zinc-950/88 backdrop-blur-sm shadow-2xl flex flex-col",
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-2.5 py-1.5 border-b border-zinc-800 text-[11px] font-bold text-zinc-300 hover:bg-zinc-900"
      >
        <ScrollText className="h-3.5 w-3.5 text-amber-500/80" />
        Журнал боя
        <span className="text-zinc-600 font-normal">{lines.length}</span>
        <span className="ml-auto text-zinc-500">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </span>
      </button>
      <div
        ref={listRef}
        className={cn(
          "overflow-y-auto px-2.5 py-1.5 space-y-0.5 text-[11px] leading-snug text-zinc-300",
          "[scrollbar-width:thin]",
          expanded ? "max-h-[45vh]" : "max-h-[6.5rem]",
        )}
      >
        {shown.length === 0 && <p className="text-zinc-600 italic py-1">Здесь появятся события боя</p>}
        {shown.map(({ key, line }) => (
          <div
            key={key}
            className={cn(
              "flex gap-1.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-300",
              line.tone === "round" && "pt-1 mt-1 border-t border-zinc-800/80",
              line.tone === "death" && "text-zinc-200",
            )}
          >
            <span className="w-3.5 shrink-0 text-center text-zinc-500">{line.icon}</span>
            <span className="min-w-0">{line.body}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
