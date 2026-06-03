"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heart, Maximize2, Minus, Plus, Shield, Sparkles, Zap } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RankBadge } from "@/app/components/RankBadge";
import { CharacterDetail } from "@/app/components/game/CharacterDetail";
import { useCharacterRoster } from "@/app/hooks/useCharacterRoster";
import type { TelegraphEvent } from "@/app/hooks/useMatchSocket";
import { absolutizeAvatarUrl, absolutizeMediaUrl, cn } from "@/lib/utils";
import type {
  AbilityDef,
  BattleSnapshot,
  CharacterDef,
  PassiveDef,
  PlayerInfo,
  Side,
  StatusEffect,
  UnitState,
} from "@/app/components/game/types";

const ROLE_LABEL_RU: Record<string, string> = {
  TANK: "Танк",
  DPS: "ДПС",
  SUPPORT: "Поддержка",
  ASSASSIN: "Ассасин",
  BRUISER: "Бугай",
};

interface BattleActions {
  activate: (unitId: string) => void;
  move: (targetZone: number) => void;
  attack: (targetUnitId: string) => void;
  useAbility: (target: { abilityId?: string; unitId?: string; unitId2?: string; zone?: number }) => void;
  endTurn: () => void;
}

interface BattleScreenProps {
  leftPlayer: PlayerInfo | null;
  rightPlayer: PlayerInfo | null;
  battle: BattleSnapshot;
  mySide: Side;
  opponentDisconnected?: boolean;
  // Transient passive-proc pulses keyed by unit_id (from the socket).
  procPulses?: Record<string, { name: string; key: number }>;
  // unit_id the opponent is inspecting (telegraph), and the action feed.
  opponentInspect?: string | null;
  telegraphs?: TelegraphEvent[];
  onInspect?: (unitId: string | null) => void;
  actions: BattleActions;
}

type Targeting =
  | null
  | { kind: "MOVE" }
  | { kind: "ATTACK" }
  | { kind: "ABILITY_UNIT"; abilityId: string; filter?: "ALLIES" | "ENEMIES" | "ALL"; range?: number }
  | { kind: "ABILITY_ZONE"; abilityId: string; range: number }
  // Two-step (Elon's Tesla): pick a unit, then a zone to move it to.
  // `pendingUnitId` is set once the unit is chosen, flipping the popup to
  // zone-selection around that unit.
  | {
      kind: "ABILITY_UNIT_THEN_ZONE";
      abilityId: string;
      filter?: "ALLIES" | "ENEMIES" | "ALL";
      // castRange: how far the chosen ally may be (aura-boosted). moveRange:
      // fixed throw distance from that ally (auras do NOT extend it).
      castRange: number;
      moveRange: number;
      pendingUnitId?: string;
    }
  // Two units (Elon's Neuralink swap): pick first, then second. `firstUnitId`
  // is set once the first is chosen.
  | {
      kind: "ABILITY_TWO_UNITS";
      abilityId: string;
      filter?: "ALLIES" | "ENEMIES" | "ALL";
      range: number;
      firstUnitId?: string;
    };

// Shared empty Set sentinel — avoids re-allocating during renders.
const EMPTY_NUMBER_SET: ReadonlySet<number> = new Set<number>();
const EMPTY_STRING_SET: ReadonlySet<string> = new Set<string>();

// Deterministic per-unit offset/rotation so units in the same zone read as
// "placed" rather than ruler-stacked. Same unit_id always produces the same
// scatter (so tokens don't jitter on re-render).
function tokenScatter(uid: string): { x: number; y: number; rotate: number } {
  let h = 0;
  for (let i = 0; i < uid.length; i++) {
    h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  }
  return {
    x: ((h % 9) - 4) * 2,        // ±8 px
    y: (((h >> 4) % 7) - 3) * 1.5, // ±4.5 px
    rotate: (((h >> 8) % 7) - 3) * 0.9, // ±2.7°
  };
}

// Walk a chain to decide what kind of target the ability needs from the
// player before the server call. Returns "none" for self-buffs / AoE that
// auto-resolves, "unit" for MAIN_TARGET / CUSTOM_SELECT, "zone" for
// CUSTOM_SELECT MOVE. Recursive into CONDITIONAL branches.
type TargetingKind =
  | { kind: "none" }
  | { kind: "unit"; range?: number; filter?: string }
  | { kind: "zone"; range: number }
  | { kind: "unit_then_zone"; castRange: number; moveRange: number; filter?: string }
  | { kind: "two_units"; range: number; filter?: string };

function scanChainForTargeting(
  chain: import("@/app/components/game/types").ChainStep[] | undefined,
  ability: AbilityDef,
): TargetingKind {
  for (const step of chain ?? []) {
    // Two units swapped (Neuralink) — pick a pair of allies.
    if (step.type === "SWAP_POSITIONS") {
      return { kind: "two_units", range: ability.range ?? 2, filter: "ALLIES" };
    }
    // Whole group relocates to a chosen zone (Mars) — any zone is valid.
    if (step.type === "RELOCATE_GROUP") {
      return { kind: "zone", range: 99 };
    }
    const sel = step.target_selector;
    if (sel?.type === "CUSTOM_SELECT") {
      if (step.type === "MOVE") {
        if (step.subject === "TARGET") {
          return {
            kind: "unit_then_zone",
            castRange: sel.range ?? ability.range ?? 1,
            moveRange: step.move_range ?? sel.range ?? 1,
            filter: sel.filter,
          };
        }
        return { kind: "zone", range: sel.range ?? ability.range ?? 1 };
      }
      return { kind: "unit", range: sel.range ?? ability.range ?? undefined, filter: sel.filter };
    }
    if (sel?.type === "MAIN_TARGET" || sel?.type === "SAME_ZONE") {
      return { kind: "unit", range: ability.range ?? undefined, filter: sel.filter };
    }
    for (const cond of step.conditions ?? []) {
      if (cond.check === "target_has_status") return { kind: "unit", range: ability.range ?? undefined };
    }
    if (step.if_true) {
      const sub = scanChainForTargeting(step.if_true, ability);
      if (sub.kind !== "none") return sub;
    }
    if (step.if_false) {
      const sub = scanChainForTargeting(step.if_false, ability);
      if (sub.kind !== "none") return sub;
    }
  }
  return { kind: "none" };
}

function getAbilityTargetingKind(ability: AbilityDef): TargetingKind {
  return scanChainForTargeting(ability.execution_chain, ability);
}

// ── Damage feedback hooks ─────────────────────────────────────────────
// Detect HP drops between renders and surface a one-shot flash event. The
// `key` lets consumers force-remount visual elements so CSS animations
// restart on every hit.
function useHpDamageFlash(currentHp: number): { value: number; key: number } | null {
  const [flash, setFlash] = useState<{ value: number; key: number } | null>(null);
  const prevRef = useRef(currentHp);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = currentHp;
    if (currentHp < prev) {
      const k = performance.now();
      setFlash({ value: prev - currentHp, key: k });
      const timer = setTimeout(() => {
        setFlash((curr) => (curr?.key === k ? null : curr));
      }, 1100);
      return () => clearTimeout(timer);
    }
  }, [currentHp]);
  return flash;
}

// Surface a passive proc as a one-shot flash. Mirrors useHpDamageFlash: when
// the incoming pulse's `key` changes, hold the label for ~1.6s then clear.
function useProcFlash(
  pulse: { name: string; key: number } | undefined,
): { name: string; key: number } | null {
  const [flash, setFlash] = useState<{ name: string; key: number } | null>(null);
  const prevKey = useRef<number | null>(null);
  useEffect(() => {
    if (!pulse || pulse.key === prevKey.current) return;
    prevKey.current = pulse.key;
    setFlash({ name: pulse.name, key: pulse.key });
    const timer = setTimeout(() => {
      setFlash((curr) => (curr?.key === pulse.key ? null : curr));
    }, 1600);
    return () => clearTimeout(timer);
  }, [pulse]);
  return flash;
}

// Apply a one-shot shake animation via the Web Animations API. Triggered by
// the changing `flashKey` — CSS-class toggles can't restart animations
// reliably, but a fresh `.animate(...)` call always plays from frame 0.
function useDamageShake(
  ref: React.RefObject<HTMLElement | null>,
  flashKey: number | undefined,
) {
  useEffect(() => {
    if (!flashKey || !ref.current) return;
    if (typeof ref.current.animate !== "function") return;
    const anim = ref.current.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-5px)" },
        { transform: "translateX(5px)" },
        { transform: "translateX(-3px)" },
        { transform: "translateX(3px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 380, easing: "ease-out" },
    );
    return () => {
      try { anim.cancel(); } catch {}
    };
  }, [flashKey, ref]);
}

function zoneLabel(zoneIndex: number): string {
  if (zoneIndex === 0 || zoneIndex === 4) return "Бэклайн";
  if (zoneIndex === 1 || zoneIndex === 3) return "Фронтлайн";
  return "Центр";
}

function charInitial(name?: string): string {
  return (name?.trim() ?? "?").slice(0, 1).toUpperCase();
}

// Friendly RU labels for internal status tags. Falls back to the raw name so
// a freshly-added status still renders something readable.
const STATUS_LABEL_RU: Record<string, string> = {
  ISOLATION: "Изоляция",
  STUN: "Оглушение",
  POISON: "Яд",
  REGEN: "Реген",
  MARK_BOMB: "Метка",
  BUFF_DEFENSE: "Защита+",
  BUFF_REGENERATION: "Реген+",
  BUFF_DAMAGE: "Урон+",
  BUFF_ATTACK_DAMAGE: "Урон атаки+",
  RESOLVE: "Стойкость",
  HELL_WEEK: "Hell Week",
  DEBUFF_IMMUNE: "Иммунитет к дебаффам",
  ISO_IMMUNE: "Имм. к изоляции",
};

function statusLabel(name: string): string {
  return STATUS_LABEL_RU[name] ?? name;
}

// Short 2–3 char code shown inside the status badge ring.
const STATUS_SHORT_RU: Record<string, string> = {
  ISOLATION: "Изо",
  STUN: "Огл",
  POISON: "Яд",
  REGEN: "Рег",
  MARK_BOMB: "Мет",
  BUFF_DEFENSE: "Защ",
  BUFF_REGENERATION: "Рг+",
  BUFF_DAMAGE: "Ур+",
  BUFF_ATTACK_DAMAGE: "Ат+",
  RESOLVE: "Стк",
  HELL_WEEK: "Ад",
  DEBUFF_IMMUNE: "Имм",
  ISO_IMMUNE: "Изо✓",
};
function statusShort(name: string): string {
  return STATUS_SHORT_RU[name] ?? name.slice(0, 3);
}

// Buffs read as "good" (green); debuffs (POISON/STUN/ISOLATION/MARK_BOMB) red.
const GOOD_STATUSES = new Set(["RESOLVE", "HELL_WEEK", "DEBUFF_IMMUNE", "ISO_IMMUNE"]);
function statusIsGood(name: string): boolean {
  return name.startsWith("BUFF_") || name === "REGEN" || GOOD_STATUSES.has(name);
}

// Counter-style statuses show their stack value, not a duration ring.
const STACK_STATUSES = new Set(["RESOLVE"]);

// A single status rendered as a coloured ring (green=buff, red=debuff) whose
// arc shows the remaining duration. The short code sits in the centre; the
// full name + turns left live in the tooltip. Gaps keep many effects readable.
// A negative BUFF_DEFENSE is a defense-shred debuff, not a buff.
function statusEffectIsGood(s: StatusEffect): boolean {
  if (s.name === "BUFF_DEFENSE") return (s.value ?? 0) >= 0;
  return statusIsGood(s.name);
}
function isDebuffStatus(s: StatusEffect): boolean {
  return !statusEffectIsGood(s);
}
// Sign-aware label for the shred case.
function statusLabelOf(s: StatusEffect): string {
  if (s.name === "BUFF_DEFENSE" && (s.value ?? 0) < 0) return "Защита−";
  return statusLabel(s.name);
}

function StatusBadge({ status, dimmed }: { status: StatusEffect; dimmed?: boolean }) {
  const good = statusEffectIsGood(status);
  const color = good ? "#34d399" : "#fb7185"; // emerald-400 / rose-400
  const remaining = status.duration;
  const permanent = remaining < 0;
  const total = status.max_duration ?? (remaining > 0 ? remaining : 1);
  // Stack counters fill their ring by value/max and show the count big.
  const isStack = STACK_STATUSES.has(status.name);
  const frac = isStack
    ? (status.max_duration ? Math.max(0, Math.min(1, (status.value ?? 0) / status.max_duration)) : 1)
    : permanent
    ? 1
    : total > 0
    ? Math.max(0, Math.min(1, remaining / total))
    : 0;
  const VB = 36;
  const stroke = 3;
  const r = (VB - stroke) / 2;
  const C = 2 * Math.PI * r;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "relative h-9 w-9 shrink-0 transition-opacity",
            dimmed && "opacity-30 grayscale",
          )}
        >
          <svg viewBox={`0 0 ${VB} ${VB}`} className="absolute inset-0 w-full h-full -rotate-90">
            <circle cx={VB / 2} cy={VB / 2} r={r} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} />
            <circle
              cx={VB / 2} cy={VB / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
              strokeDasharray={C} strokeDashoffset={C * (1 - frac)} strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.4s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className={cn("font-black leading-none", isStack ? "text-xs" : "text-[9px]")}
              style={{ color }}
            >
              {isStack ? (status.value ?? 0) : statusShort(status.name)}
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-zinc-900 text-zinc-100 border border-zinc-700 text-[11px]">
        <span className={good ? "text-emerald-300" : "text-rose-300"}>{statusLabelOf(status)}</span>
        {isStack ? (
          <span className="text-zinc-400">
            {" · "}{status.value ?? 0}{status.max_duration ? `/${status.max_duration}` : ""} стак.
          </span>
        ) : (
          <>
            {!permanent && <span className="text-zinc-400"> · {remaining}т</span>}
            {permanent && <span className="text-zinc-400"> · ∞</span>}
            {!!status.value && <span className="text-zinc-400"> · сила {status.value}</span>}
          </>
        )}
        {dimmed && <span className="text-emerald-400"> · подавлено</span>}
      </TooltipContent>
    </Tooltip>
  );
}

// Composite badge: collapses a multi-effect ability (e.g. Hell Week) into one
// violet badge. Tooltip lists every sub-effect.
function GroupBadge({ group, members }: { group: string; members: StatusEffect[] }) {
  const color = "#a78bfa"; // violet-400 — "special" composite effect
  const marker = members.find((m) => m.name === group) ?? members[0];
  const remaining = marker.duration;
  const permanent = remaining < 0;
  const total = marker.max_duration ?? (remaining > 0 ? remaining : 1);
  const frac = permanent ? 1 : total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const VB = 36, stroke = 3, r = (VB - stroke) / 2, C = 2 * Math.PI * r;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative h-9 w-9 shrink-0">
          <svg viewBox={`0 0 ${VB} ${VB}`} className="absolute inset-0 w-full h-full -rotate-90">
            <circle cx={VB / 2} cy={VB / 2} r={r} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} />
            <circle
              cx={VB / 2} cy={VB / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
              strokeDasharray={C} strokeDashoffset={C * (1 - frac)} strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.4s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[9px] font-black leading-none" style={{ color }}>
              {statusShort(group)}
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-zinc-900 text-zinc-100 border border-zinc-700 text-[11px] max-w-[200px]">
        <p className="text-violet-300 font-bold">
          {statusLabel(group)}
          {!permanent && <span className="text-zinc-400 font-normal"> · {remaining}т</span>}
        </p>
        <ul className="mt-0.5 space-y-0.5 text-zinc-300">
          {members
            .filter((m) => m.name !== group)
            .map((m, i) => (
              <li key={i}>
                {statusLabelOf(m)}
                {!!m.value && m.name !== "DEBUFF_IMMUNE" && <span className="text-zinc-400"> {m.value > 0 ? "+" : ""}{m.value}</span>}
              </li>
            ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

// Render a unit's statuses: collapse grouped ones into composite badges, and
// dim debuffs while the unit is debuff-immune (they're suppressed, not gone).
function StatusRow({ statuses, className }: { statuses: StatusEffect[]; className?: string }) {
  if (!statuses.length) return null;
  const immune = statuses.some((s) => s.name === "DEBUFF_IMMUNE");
  const groups = new Map<string, StatusEffect[]>();
  const singles: StatusEffect[] = [];
  for (const s of statuses) {
    if (s.group) {
      const arr = groups.get(s.group);
      if (arr) arr.push(s);
      else groups.set(s.group, [s]);
    } else {
      singles.push(s);
    }
  }
  return (
    // Single row with horizontal scroll (no wrap to a 2nd line); scrollbar
    // hidden — scroll via wheel/drag.
    <div
      className={cn(
        "flex flex-nowrap gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {Array.from(groups.entries()).map(([g, members]) => (
        <GroupBadge key={`g-${g}`} group={g} members={members} />
      ))}
      {singles.map((s, i) => (
        <StatusBadge key={`s-${s.name}-${i}`} status={s} dimmed={immune && isDebuffStatus(s)} />
      ))}
    </div>
  );
}

// HP ring: full circle at max HP, shrinks clockwise as HP drops. Colour is
// fixed per side (green=mine, red=enemy) — at low HP we desaturate slightly
// so it dims-out instead of changing hue (no green-→red shift mid-fight).
const HP_COLOR_FRIENDLY = "#22c55e";  // green-500
const HP_COLOR_ENEMY = "#ef4444";     // red-500

function HpRing({
  current,
  max,
  color,
  stroke = 5,
}: {
  current: number;
  max: number;
  color: string;
  stroke?: number;
}) {
  // Fills the parent — caller controls outer size. The viewBox is fixed so the
  // dasharray math stays stable across breakpoints.
  const VB = 100;
  const r = (VB - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const offset = circumference * (1 - pct);
  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      className="absolute inset-0 w-full h-full -rotate-90"
      aria-hidden
    >
      <circle
        cx={VB / 2}
        cy={VB / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={stroke}
      />
      <circle
        cx={VB / 2}
        cy={VB / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        opacity={0.55 + 0.45 * pct}
        style={{ transition: "stroke-dashoffset 0.45s ease, opacity 0.45s ease" }}
      />
    </svg>
  );
}

// Circular cooldown indicator drawn over an ability portrait. The amber arc
// shrinks as the ability recharges (full ring = just used, empty = ready),
// with the remaining round count in the centre.
function CooldownRing({ remaining, total }: { remaining: number; total: number }) {
  const VB = 100;
  const stroke = 8;
  const r = (VB - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="relative h-14 w-14">
        <svg viewBox={`0 0 ${VB} ${VB}`} className="absolute inset-0 w-full h-full -rotate-90">
          <circle cx={VB / 2} cy={VB / 2} r={r} fill="rgba(0,0,0,0.45)"
            stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
          <circle cx={VB / 2} cy={VB / 2} r={r} fill="none"
            stroke="#38bdf8" strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - frac)}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.4s ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-black text-sky-200 tabular-nums leading-none">
            {remaining}
          </span>
        </div>
      </div>
    </div>
  );
}

// Mini horizontal progress bar for the strip cards. Colour fixed by the
// caller (green for HP, sky for energy).
function Bar({ value, max, accent }: { value: number; max: number; accent: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-zinc-700/60 overflow-hidden">
      <div
        className={cn("h-full transition-all duration-500", accent)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

type TokenActivation = "current" | "available" | "spent";

// ── Field token ────────────────────────────────────────────────────────
function UnitToken({
  unit,
  char,
  activation,
  isMine,
  isSelected,
  isValidTarget,
  isClickable,
  isBeingDragged,
  procPulse,
  inspectedByOpp,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  unit: UnitState;
  char: CharacterDef | undefined;
  activation: TokenActivation;
  isMine: boolean;
  // Outer "you're inspecting this one" indicator. Always faint; separate
  // from `activation` so a non-active unit can still glow gently when the
  // player has its cards open. The active unit gets the strong amber pulse
  // through `activation === "current"`.
  isSelected?: boolean;
  isValidTarget?: boolean;
  isClickable?: boolean;
  isBeingDragged?: boolean;
  procPulse?: { name: string; key: number };
  inspectedByOpp?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const dead = unit.current_hp <= 0;
  const proc = useProcFlash(procPulse);
  const hasStun = unit.statuses.some((s) => s.name === "STUN");
  const hasPoison = unit.statuses.some((s) => s.name === "POISON");
  const stats = char?.base_stats;
  const subtitle = char
    ? `${ROLE_LABEL_RU[char.role] ?? char.role} · ${
        char.initial_position_type === "FRONTLINE" ? "Фронтлайн" : "Бэклайн"
      }`
    : "";

  const portrait = absolutizeMediaUrl(char?.portrait_url ?? null);
  const flash = useHpDamageFlash(unit.current_hp);
  const shakeRef = useRef<HTMLDivElement>(null);
  useDamageShake(shakeRef, flash?.key);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* `select-none` + onPointerDown stopPropagation so the map pan
            handler doesn't start a drag when the player grabs a token. */}
        <div
          ref={shakeRef}
          className={cn(
            "relative select-none touch-none",
            isClickable ? "cursor-pointer" : "cursor-help",
            // Hide the original token while its ghost is following the cursor.
            isBeingDragged && "opacity-25",
          )}
          onPointerDown={onPointerDown ?? ((e) => e.stopPropagation())}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={
            onClick
              ? (e) => {
                  e.stopPropagation();
                  onClick();
                }
              : undefined
          }
        >
          {/* Currently-activated unit: strong pulsing ring + glow. Amber for
              your unit, rose for the opponent's — so an enemy turn doesn't read
              as "your action". */}
          {activation === "current" && !dead && (
            <>
              <div
                className={cn(
                  "absolute -inset-2 rounded-full border-[3px] animate-pulse pointer-events-none",
                  isMine ? "border-amber-400" : "border-rose-500",
                )}
              />
              <div
                className="absolute -inset-3 rounded-full pointer-events-none animate-pulse"
                style={{
                  boxShadow: isMine
                    ? "0 0 24px 6px rgba(251, 191, 36, 0.55)"
                    : "0 0 24px 6px rgba(244, 63, 94, 0.55)",
                }}
              />
            </>
          )}
          {/* Available-to-activate this round: faint amber outline. */}
          {activation === "available" && !dead && (
            <div className="absolute -inset-1 rounded-full border border-amber-500/45 pointer-events-none" />
          )}
          {/* Selected-for-inspection (not yet activated): subtle slow pulse
              in cool white so it reads as "you're viewing this one". Doesn't
              draw the eye as much as the activated-amber ring. */}
          {isSelected && activation !== "current" && !dead && (
            <div
              className="absolute -inset-1.5 rounded-full border border-white/45 pointer-events-none"
              style={{
                animation: "pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                boxShadow: "0 0 14px rgba(255, 255, 255, 0.25)",
              }}
            />
          )}
          {/* Valid-target outline during attack-targeting mode. */}
          {isValidTarget && !dead && (
            <div className="absolute -inset-3 rounded-full border-2 border-amber-300 animate-pulse pointer-events-none" />
          )}
          <div className="relative h-14 w-14 sm:h-16 sm:w-16 lg:h-20 lg:w-20 xl:h-24 xl:w-24">
            <HpRing
              current={unit.current_hp}
              max={unit.max_hp}
              color={isMine ? HP_COLOR_FRIENDLY : HP_COLOR_ENEMY}
              stroke={5}
            />
            <div
              className={cn(
                "absolute inset-[5px] rounded-full overflow-hidden border border-zinc-700 bg-zinc-800 flex items-center justify-center",
                dead && "opacity-30 grayscale",
                // Stunned → drained, grey & dim ("inactive").
                !dead && hasStun && "grayscale brightness-[0.6]",
              )}
            >
              {portrait ? (
                <img
                  src={portrait}
                  alt={char?.name ?? unit.char_id}
                  className="absolute inset-0 w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <span className="font-black text-zinc-100 text-base sm:text-lg lg:text-2xl xl:text-3xl select-none">
                  {charInitial(char?.name)}
                </span>
              )}
              {/* Poison → sickly green wash over the portrait. */}
              {!dead && hasPoison && (
                <div className="absolute inset-0 bg-emerald-500/35 mix-blend-hard-light pointer-events-none" />
              )}
            </div>
            {/* Stun → dizzy marker above the token. */}
            {!dead && hasStun && (
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-sm leading-none pointer-events-none select-none drop-shadow">
                💫
              </div>
            )}
            {/* Opponent is currently inspecting this unit. */}
            {inspectedByOpp && (
              <div className="absolute -bottom-1 -left-1 text-xs leading-none pointer-events-none select-none drop-shadow" title="Соперник смотрит">
                👁
              </div>
            )}
            {unit.statuses.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-violet-500 text-[9px] font-bold text-white flex items-center justify-center">
                {unit.statuses.length}
              </span>
            )}

            {/* Red flash overlay on the avatar disk. */}
            {flash && (
              <div
                key={`flash-${flash.key}`}
                className="absolute inset-[5px] rounded-full bg-red-500 pointer-events-none mix-blend-screen"
                style={{ animation: "dmg-hit-flash 0.55s ease-out forwards" }}
              />
            )}
            {/* Red ring shockwave bursting outward — keyed for restart. */}
            {flash && (
              <div
                key={`shock-${flash.key}`}
                className="absolute inset-0 rounded-full border-red-500 pointer-events-none"
                style={{ animation: "dmg-shockwave 0.7s cubic-bezier(0.2, 0.6, 0.2, 1) forwards" }}
              />
            )}
            {/* Outer border red-glow so the whole token reads "hit". */}
            {flash && (
              <div
                key={`glow-${flash.key}`}
                className="absolute -inset-1 rounded-full pointer-events-none"
                style={{ animation: "dmg-border-glow 0.55s ease-out forwards" }}
              />
            )}
          </div>

          {/* Floating damage number — bigger, slight rotation, longer fade. */}
          {flash && (
            <div
              key={`dmg-${flash.key}`}
              className="absolute left-1/2 -top-2 text-3xl sm:text-4xl font-black text-red-300 pointer-events-none select-none whitespace-nowrap z-30 italic"
              style={{
                animation: "dmg-float 1.15s cubic-bezier(0.2, 0.6, 0.2, 1) forwards",
                textShadow:
                  "0 3px 10px rgba(0,0,0,0.9), 0 0 6px rgba(220,38,38,0.85), 0 0 18px rgba(220,38,38,0.4)",
                WebkitTextStroke: "1px rgba(0,0,0,0.4)",
              }}
            >
              -{flash.value}
            </div>
          )}

          {/* Passive proc flash: golden ring pulse + floating passive name. */}
          {proc && (
            <>
              <div
                key={`proc-ring-${proc.key}`}
                className="absolute -inset-2 rounded-full border-2 border-violet-300 pointer-events-none"
                style={{
                  animation: "dmg-shockwave 0.9s cubic-bezier(0.2, 0.6, 0.2, 1) forwards",
                  boxShadow: "0 0 26px 6px rgba(167,139,250,0.8)",
                }}
              />
              <div
                key={`proc-label-${proc.key}`}
                className="absolute left-1/2 -top-5 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-full bg-violet-500 text-white text-[11px] font-black pointer-events-none select-none z-40"
                style={{
                  animation: "dmg-float 1.5s cubic-bezier(0.2, 0.6, 0.2, 1) forwards",
                  textShadow: "0 1px 2px rgba(0,0,0,0.35)",
                }}
              >
                ✦ {proc.name}
              </div>
            </>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="bg-zinc-900 text-zinc-100 border border-zinc-700 px-3 py-2.5 max-w-[260px] flex flex-col gap-1.5"
      >
        {/* Name + subtitle */}
        <div className="border-b border-zinc-700 pb-1.5">
          <p className="text-sm font-bold leading-tight">{char?.name ?? unit.char_id}</p>
          {subtitle && (
            <p className="text-[11px] text-amber-600/80 mt-0.5">{subtitle}</p>
          )}
        </div>

        {/* Stats grid */}
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center gap-1.5">
            <Heart className="h-3 w-3 text-green-500 shrink-0" />
            <span className="font-mono tabular-nums">{unit.current_hp}/{unit.max_hp}</span>
            <span className="text-zinc-400">HP</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-sky-400 shrink-0" />
            <span className="font-mono tabular-nums">{unit.current_energy}/{unit.max_energy}</span>
            <span className="text-zinc-400">EN</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-zinc-400 shrink-0" />
            <span
              className={cn(
                "font-mono tabular-nums",
                stats && unit.current_defense > stats.defense && "text-emerald-300 font-bold",
              )}
            >
              {unit.current_defense}
            </span>
            <span className="text-zinc-400">DEF</span>
          </div>
          {unit.current_regeneration > 0 && (
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-emerald-400 shrink-0" />
              <span className="font-mono tabular-nums text-emerald-300">+{unit.current_regeneration}</span>
              <span className="text-zinc-400">REGEN</span>
            </div>
          )}
        </div>

        {unit.statuses.length > 0 && (
          <div className="border-t border-zinc-700 pt-1.5">
            <p className="text-[10px] text-amber-600/80 mb-1">Эффекты</p>
            <div className="flex flex-wrap gap-1">
              {unit.statuses.map((s, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700"
                >
                  {statusLabel(s.name)}
                  {s.duration > 0 ? ` ${s.duration}т` : " ∞"}
                </span>
              ))}
            </div>
          </div>
        )}

        {dead && (
          <p className="text-[11px] text-destructive mt-0.5">
            Погиб
            {unit.respawn_round != null && (
              <span className="text-muted-foreground">
                {" "}· возрождение в раунде {unit.respawn_round}
              </span>
            )}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Strip card: portrait on the left, full stats block on the right ────
function UnitCard({
  unit,
  char,
  activation,
  isValidTarget,
  isClickable,
  onClick,
}: {
  unit: UnitState;
  char: CharacterDef | undefined;
  activation?: TokenActivation;
  isValidTarget?: boolean;
  isClickable?: boolean;
  onClick?: () => void;
}) {
  const dead = unit.current_hp <= 0;
  const stats = char?.base_stats;
  const subtitle = char
    ? `${ROLE_LABEL_RU[char.role] ?? char.role} · ${
        char.initial_position_type === "FRONTLINE" ? "Фронтлайн" : "Бэклайн"
      }`
    : "";

  const portrait = absolutizeMediaUrl(char?.portrait_url ?? null);
  const flash = useHpDamageFlash(unit.current_hp);
  const shakeRef = useRef<HTMLDivElement>(null);
  useDamageShake(shakeRef, flash?.key);

  return (
    <div
      ref={shakeRef}
      onClick={isClickable && onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
      className={cn(
        "relative flex border bg-card/60 backdrop-blur-sm overflow-hidden transition-all shrink-0",
        dead && "opacity-40 grayscale",
        isClickable && "cursor-pointer",
        // Border / glow ring for activation state and attack targeting.
        isValidTarget
          ? "border-amber-300 shadow-[0_0_22px_rgba(252,211,77,0.45)] animate-pulse"
          : activation === "current"
          ? "border-amber-400 shadow-[0_0_18px_rgba(252,211,77,0.35)]"
          : activation === "available"
          ? "border-amber-600/50"
          : "border-zinc-700",
        "w-[300px] sm:w-[320px] lg:w-[340px]",
      )}
    >
      {/* RPG corner brackets — gilt-on-charcoal hint, no full ornament */}
      {!dead && (
        <>
          <span className="pointer-events-none absolute top-1.5 left-1.5 w-3 h-3 border-l border-t border-amber-600/45" />
          <span className="pointer-events-none absolute top-1.5 right-1.5 w-3 h-3 border-r border-t border-amber-600/45" />
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 w-3 h-3 border-l border-b border-amber-600/45" />
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 w-3 h-3 border-r border-b border-amber-600/45" />
        </>
      )}

      {/* Book-format portrait. Stretches to match the info column height so
          the card stays a clean rectangle. */}
      <div className="relative w-24 sm:w-28 shrink-0 bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 overflow-hidden">
        {portrait ? (
          <img
            src={portrait}
            alt={char?.name ?? unit.char_id}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <>
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, transparent 0 14px, rgba(255,255,255,0.04) 14px 16px)",
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl font-black text-white/12 select-none">
                {charInitial(char?.name)}
              </span>
            </div>
          </>
        )}
        {/* Soft bottom shade so a future cover image keeps the inner edge readable */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />

        {/* Hit flash + floating damage number on the strip card portrait. */}
        {flash && (
          <div
            key={`card-flash-${flash.key}`}
            className="absolute inset-0 bg-red-500 pointer-events-none mix-blend-screen"
            style={{ animation: "dmg-hit-flash 0.55s ease-out forwards" }}
          />
        )}
        {flash && (
          <div
            key={`card-dmg-${flash.key}`}
            className="absolute left-1/2 top-2 text-4xl font-black text-red-300 italic pointer-events-none select-none z-30"
            style={{
              animation: "dmg-float 1.15s cubic-bezier(0.2, 0.6, 0.2, 1) forwards",
              textShadow:
                "0 3px 10px rgba(0,0,0,0.9), 0 0 6px rgba(220,38,38,0.85), 0 0 18px rgba(220,38,38,0.4)",
              WebkitTextStroke: "1px rgba(0,0,0,0.4)",
            }}
          >
            -{flash.value}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate leading-tight">
            {char?.name ?? unit.char_id}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
        </div>

        {/* Hair-line amber rule — purely RPG flavour */}
        <div className="h-px bg-amber-600/25" />

        {/* HP row */}
        <div className="flex items-center gap-2">
          <Heart className="h-3.5 w-3.5 text-green-500 shrink-0" />
          <span className="text-xs font-bold tabular-nums w-14">
            {unit.current_hp}/{unit.max_hp}
          </span>
          <Bar value={unit.current_hp} max={unit.max_hp} accent="bg-green-500" />
        </div>

        {/* Energy row */}
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          <span className="text-xs font-bold tabular-nums w-14">
            {unit.current_energy}/{unit.max_energy}
          </span>
          <Bar value={unit.current_energy} max={unit.max_energy} accent="bg-sky-400" />
        </div>

        {/* Secondary stats — inline, compact */}
        <div className="flex items-center gap-3 text-[11px] text-zinc-300">
          <span className="inline-flex items-center gap-1">
            <Shield className="h-3 w-3 text-zinc-400" />
            <span
              className={cn(
                "font-bold tabular-nums",
                stats && unit.current_defense > stats.defense && "text-emerald-300",
              )}
            >
              {unit.current_defense}
            </span>
            <span className="text-muted-foreground">DEF</span>
          </span>
          {unit.current_regeneration > 0 && (
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-emerald-400" />
              <span className="font-bold tabular-nums text-emerald-300">+{unit.current_regeneration}</span>
              <span className="text-muted-foreground">REGEN</span>
            </span>
          )}
        </div>

        {unit.statuses.length > 0 && (
          <StatusRow statuses={unit.statuses} className="mt-auto pt-1" />
        )}
      </div>
    </div>
  );
}

function PlayerStrip({
  player,
  units,
  byId,
  disconnected,
  label,
  getCardProps,
}: {
  player: PlayerInfo | null;
  units: UnitState[];
  byId: Map<string, CharacterDef>;
  disconnected?: boolean;
  label: string;
  // Per-unit click/highlight props. Computed in BattleScreen so the same
  // targeting/activation state drives both field tokens and strip cards.
  getCardProps?: (unit: UnitState) => {
    activation?: TokenActivation;
    isValidTarget?: boolean;
    isClickable?: boolean;
    onClick?: () => void;
  };
}) {
  return (
    <div className="relative z-40 flex items-center gap-5 px-6 py-4 border-y border-border bg-card/95 backdrop-blur-sm">
      <div className="flex items-center gap-3 shrink-0 min-w-[180px]">
        <Avatar
          className={cn(
            "h-16 w-16 border-2",
            disconnected ? "border-destructive grayscale" : "border-border",
          )}
        >
          <AvatarImage src={absolutizeAvatarUrl(player?.avatar_url) ?? ""} />
          <AvatarFallback className="bg-muted text-lg">
            {(player?.display_name ?? "?").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-lg font-bold leading-tight">
            {player?.display_name ?? "—"}
          </span>
          {player && <RankBadge elo={player.elo} size="sm" />}
        </div>
      </div>

      <div className="flex-1 flex gap-3 overflow-x-auto">
        {units.map((u) => {
          const extra = getCardProps?.(u) ?? {};
          return (
            <UnitCard
              key={u.unit_id}
              unit={u}
              char={byId.get(u.char_id)}
              {...extra}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Targeting bar ─────────────────────────────────────────────────────
// Slim floating popup. Renders the triple-target buttons (third path: pick
// a target by clicking a labelled button) only while the player is in
// targeting mode. Other turn controls live on the floating cards now.
function TargetingBar({
  targeting,
  validUnitTargets,
  validZoneTargets,
  battleUnits,
  byId,
  mySide,
  onPickTargetUnit,
  onPickTargetZone,
  onCancel,
}: {
  targeting: NonNullable<Targeting>;
  validUnitTargets: ReadonlySet<string>;
  validZoneTargets: ReadonlySet<number>;
  battleUnits: Record<string, UnitState>;
  byId: Map<string, CharacterDef>;
  mySide: Side;
  onPickTargetUnit: (unitId: string) => void;
  onPickTargetZone: (zoneIndex: number) => void;
  onCancel: () => void;
}) {
  // Tesla's second step (pendingUnitId set) behaves like zone mode; its first
  // step like unit mode.
  const teslaZonePhase =
    targeting.kind === "ABILITY_UNIT_THEN_ZONE" && !!targeting.pendingUnitId;
  const teslaUnitPhase =
    targeting.kind === "ABILITY_UNIT_THEN_ZONE" && !targeting.pendingUnitId;
  const swapFirst = targeting.kind === "ABILITY_TWO_UNITS" && !targeting.firstUnitId;
  const swapSecond = targeting.kind === "ABILITY_TWO_UNITS" && !!targeting.firstUnitId;
  const isUnitMode =
    targeting.kind === "ATTACK" || targeting.kind === "ABILITY_UNIT"
    || teslaUnitPhase || swapFirst || swapSecond;
  const isZoneMode =
    targeting.kind === "MOVE" || targeting.kind === "ABILITY_ZONE" || teslaZonePhase;

  const prompt =
    targeting.kind === "MOVE"
      ? "Выберите зону для перемещения"
      : teslaUnitPhase
      ? "Выберите союзника для перемещения"
      : teslaZonePhase
      ? "Выберите зону, куда переместить союзника"
      : swapFirst
      ? "Выберите первого союзника для обмена"
      : swapSecond
      ? "Выберите второго союзника для обмена"
      : targeting.kind === "ABILITY_ZONE"
      ? "Выберите зону для способности"
      : targeting.kind === "ATTACK"
      ? "Выберите цель для атаки"
      : "Выберите цель для способности";

  const buttons: React.ReactNode[] = [];
  if (isUnitMode) {
    for (const uid of validUnitTargets) {
      const u = battleUnits[uid];
      const char = u ? byId.get(u.char_id) : undefined;
      if (!u) continue;
      buttons.push(
        <button
          key={uid}
          type="button"
          onClick={() => onPickTargetUnit(uid)}
          className="px-3 py-1.5 min-w-[120px] text-xs font-bold border border-amber-500/70 bg-amber-600/15 hover:bg-amber-600/30 text-amber-100"
        >
          {char?.name ?? uid}
          <span className="block text-[10px] font-mono text-amber-300/70 mt-0.5">
            HP {u.current_hp}/{u.max_hp}
          </span>
        </button>,
      );
    }
  }
  if (isZoneMode) {
    const sorted = Array.from(validZoneTargets).sort((a, b) => a - b);
    for (const z of sorted) {
      const label = zoneLabel(z);
      const sideHint =
        z === 2
          ? "центр"
          : (mySide === "LEFT" && z < 2) || (mySide === "RIGHT" && z > 2)
          ? "ваша сторона"
          : "сторона соперника";
      buttons.push(
        <button
          key={`z-${z}`}
          type="button"
          onClick={() => onPickTargetZone(z)}
          className="px-3 py-1.5 min-w-[120px] text-xs font-bold border border-amber-500/70 bg-amber-600/15 hover:bg-amber-600/30 text-amber-100"
        >
          {label}
          <span className="block text-[10px] font-mono text-amber-300/70 mt-0.5">
            {sideHint}
          </span>
        </button>,
      );
    }
  }

  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[55] pointer-events-none" style={{ bottom: 112 }}>
      <div className="flex items-center gap-2 px-4 py-2 border border-amber-600/40 bg-zinc-900/95 backdrop-blur-md shadow-2xl pointer-events-auto">
        <p className="text-xs font-bold text-amber-300 mr-1">{prompt}</p>
        {buttons.length > 0 ? (
          buttons
        ) : (
          <p className="text-xs text-muted-foreground italic">нет доступных целей</p>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs border border-zinc-700 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}


// Surface the gist of a selector for the card stat row: a fixed range value,
// or a friendlier label for selectors that imply targeting shape (SAME_ZONE,
// ALL_*). Returns null when the chain wouldn't ask the player for a target.
// First damage type a chain deals (recursing into CONDITIONAL branches), or
// null if it deals no direct damage.
function chainDamageType(
  chain: import("@/app/components/game/types").ChainStep[] | undefined,
): "PHYSICAL" | "MAGICAL" | null {
  for (const step of chain ?? []) {
    if (step.type === "DAMAGE") return step.damage_type ?? "PHYSICAL";
    const t = chainDamageType(step.if_true) ?? chainDamageType(step.if_false);
    if (t) return t;
  }
  return null;
}

function abilityRangeLabel(
  chain: import("@/app/components/game/types").ChainStep[] | undefined,
): string | null {
  for (const step of chain ?? []) {
    const sel = step.target_selector;
    if (sel?.range !== undefined) return `Радиус ${sel.range}`;
    if (sel?.type === "SAME_ZONE") return "По зоне цели";
    if (sel?.type === "SELF") return "На себя";
    if (sel?.type === "ALL_ALLIES") return "Все союзники";
    if (sel?.type === "ALL_ENEMIES") return "Все враги";
    if (step.if_true) {
      const r = abilityRangeLabel(step.if_true);
      if (r) return r;
    }
    if (step.if_false) {
      const r = abilityRangeLabel(step.if_false);
      if (r) return r;
    }
  }
  return null;
}


// ── Card row ───────────────────────────────────────────────────────────
// Row of cards tucked BEHIND the player strip (z-index lower than the
// strip). Only the small header bar of each card sticks out above the
// strip — name + cooldown peek visible. Hover any card → it translates up
// fully and becomes interactive. "Раскрыть всё" toggle pops them all out
// at once. The container is `pointer-events-none` so the field stays
// clickable beneath; cards opt back in for themselves.
//
// Cards in order: hero info (landscape, full stats + Move button), attack
// (with Attack button), ability (Use button), passive (info-only). For
// enemy selection, render along the top edge instead.
type FanItem =
  | {
      kind: "hero";
      char: CharacterDef;
      unit: UnitState;
      // Set of context-aware buttons. When the unit isn't currently active
      // and the player isn't allowed to activate it (enemy / already moved),
      // *all* of these stay undefined and the card renders info-only.
      onActivate?: () => void;
      onMove?: () => void;
      onEndTurn?: () => void;
      onSkipStun?: () => void;
    }
  | {
      kind: "attack";
      char: CharacterDef;
      onAttack?: () => void;  // undefined when inspecting → no button rendered
    }
  | {
      kind: "ability";
      char: CharacterDef;
      unit: UnitState;
      ability: AbilityDef;
      // Same rule: only show "Использовать" when actually usable. When the
      // ability is on CD / not enough energy / token spent we just don't
      // render a button — the inspector sees the description and stats.
      onUse?: () => void;
    }
  | {
      kind: "passive";
      char: CharacterDef;
      passive: PassiveDef;
    };

// ── Side detail panel ───────────────────────────────────────────────────
// Slides in from the right when a unit is inspected. Shows the full hero /
// attack / ability / passive detail stacked vertically (no hover-to-expand),
// with context-aware action buttons. Leaves the battlefield visible.
function UnitDetailPanel({
  unit,
  char,
  side,
  isActiveOwner,
  isStunned,
  canActivate,
  onActivate,
  onUseAbility,
  onChooseAttack,
  onChooseMove,
  onEndTurn,
  onClose,
}: {
  unit: UnitState;
  char: CharacterDef;
  // Which edge the panel docks to. Mirrors the unit's on-screen side so the
  // opposite half of the board (likely your targets) stays clickable.
  side: "left" | "right";
  isActiveOwner: boolean;
  isStunned: boolean;
  canActivate: boolean;
  onActivate: () => void;
  onUseAbility: (ability: AbilityDef) => void;
  onChooseAttack: () => void;
  onChooseMove: () => void;
  onEndTurn: () => void;
  onClose: () => void;
}) {
  // Can attack only if neither attacked nor used a (non-quick) ability yet.
  const canAttack =
    isActiveOwner && !isStunned && !unit.has_attacked && !unit.has_used_ability;
  const canMove = isActiveOwner && !isStunned && unit.move_count < 1;

  // Per-ability usability: enough energy, off cooldown, token free for slow.
  const canUse = (ability: AbilityDef): boolean => {
    if (!isActiveOwner || isStunned) return false;
    if (unit.current_energy < ability.energy_cost) return false;
    if ((unit.cooldowns[ability.id] ?? 0) > 0) return false;
    // Non-quick abilities are locked out only by having attacked (not by other
    // abilities) — so you can chain as many as energy/cooldowns allow.
    if (!ability.is_quick && unit.has_attacked) return false;
    return true;
  };

  const abilityTag = (a: AbilityDef): string =>
    a.is_ult ? "Ульта" : a.is_quick ? "Быстрая" : "Способность";

  return (
    <div
      className={cn(
        "absolute top-0 bottom-0 z-40 w-[380px] max-w-[88vw] bg-zinc-950/96 backdrop-blur-sm shadow-2xl flex flex-col animate-in fade-in-0 duration-200",
        side === "right"
          ? "right-0 border-l border-amber-900/40 slide-in-from-right-4"
          : "left-0 border-r border-amber-900/40 slide-in-from-left-4",
      )}
    >
      <header className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/85 shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate leading-tight">{char.name}</p>
          <p className="text-[11px] text-amber-600/80">
            {ROLE_LABEL_RU[char.role] ?? char.role}
            {" · "}
            {char.initial_position_type === "FRONTLINE" ? "Фронтлайн" : "Бэклайн"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="h-8 w-8 shrink-0 flex items-center justify-center text-lg leading-none border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-400"
        >
          ×
        </button>
      </header>

      {/* Scrollable detail stack. Hidden scrollbar (it renders huge/ugly on
          some platforms) — still scrolls via wheel/touch/drag. Every action
          lives ON its card: Двинуться/Завершить/Активировать on the hero card,
          Атаковать on the attack card, Использовать on the ability card. */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="border border-zinc-700/70 bg-zinc-900/70 overflow-hidden">
          <HeroCardBody
            item={{
              kind: "hero",
              char,
              unit,
              onActivate: canActivate ? onActivate : undefined,
              onMove: canMove ? onChooseMove : undefined,
              onEndTurn: isActiveOwner && !isStunned ? onEndTurn : undefined,
              onSkipStun: isActiveOwner && isStunned ? onEndTurn : undefined,
            }}
          />
        </div>

        <article className="border border-amber-600/40 bg-zinc-900/70 overflow-hidden flex flex-col">
          <CardTitle name={char.attack.name} tag="Атака" />
          <AttackCardBody item={{ kind: "attack", char, onAttack: canAttack ? onChooseAttack : undefined }} />
        </article>

        {char.abilities.map((ability) => (
          <article
            key={ability.id}
            className={cn(
              "border bg-zinc-900/70 overflow-hidden flex flex-col",
              ability.is_ult ? "border-fuchsia-600/50" : "border-amber-600/40",
            )}
          >
            <CardTitle name={ability.name} tag={abilityTag(ability)} />
            <AbilityCardBody
              item={{
                kind: "ability",
                char,
                unit,
                ability,
                onUse: canUse(ability) ? () => onUseAbility(ability) : undefined,
              }}
            />
          </article>
        ))}

        {char.passives.map((passive) => (
          <article
            key={passive.id}
            className="border border-zinc-700/70 bg-zinc-900/70 overflow-hidden flex flex-col"
          >
            <CardTitle name={passive.name} tag="Пассивка" />
            <PassiveCardBody item={{ kind: "passive", char, passive }} />
          </article>
        ))}
      </div>
    </div>
  );
}

// Small title bar above a detail card so the attack / ability / passive NAME
// is always visible (it used to live only on the old peek plate).
function CardTitle({ name, tag }: { name: string; tag: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-zinc-800 bg-zinc-900/80">
      <span className="text-xs font-bold text-zinc-100 truncate">{name}</span>
      <span className="text-[9px] font-mono uppercase tracking-widest text-amber-600/80 shrink-0">{tag}</span>
    </div>
  );
}

// ── Card bodies ────────────────────────────────────────────────────────
function HeroCardBody({ item }: { item: Extract<FanItem, { kind: "hero" }> }) {
  const { char, unit, onActivate, onMove, onEndTurn, onSkipStun } = item;
  const portrait = absolutizeMediaUrl(char.portrait_url ?? null);
  const stats = char.base_stats;
  const hpPct = Math.max(0, Math.min(100, (unit.current_hp / unit.max_hp) * 100));
  const enPct = Math.max(0, Math.min(100, (unit.current_energy / unit.max_energy) * 100));

  return (
    <div className="flex">
      {/* Portrait — FIXED 120×176 regardless of how much info / how many
          buttons sit beside it, so its size never shifts between units. */}
      <div className="relative w-[120px] h-44 shrink-0 self-start bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 overflow-hidden">
        {portrait ? (
          <img src={portrait} alt={char.name} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl font-black text-white/10 select-none">
              {charInitial(char.name)}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/70 to-transparent" />
      </div>

      <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          <span>{ROLE_LABEL_RU[char.role] ?? char.role}</span>
          <span>·</span>
          <span>{char.initial_position_type === "FRONTLINE" ? "Фронт" : "Тыл"}</span>
        </div>

        {/* HP + EN inline bars */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Heart className="h-3.5 w-3.5 text-green-500 shrink-0" />
            <span className="text-xs font-bold tabular-nums w-16">{unit.current_hp}/{unit.max_hp}</span>
            <div className="flex-1 h-1.5 bg-zinc-700/60 rounded-full overflow-hidden">
              <div className="h-full bg-green-500" style={{ width: `${hpPct}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span className="text-xs font-bold tabular-nums w-16">{unit.current_energy}/{unit.max_energy}</span>
            <div className="flex-1 h-1.5 bg-zinc-700/60 rounded-full overflow-hidden">
              <div className="h-full bg-sky-400" style={{ width: `${enPct}%` }} />
            </div>
          </div>
        </div>

        {/* Secondary stats — base value, with the buff/debuff delta shown
            separately (e.g. "5 +4") so temporary bonuses read as distinct. */}
        <div className="grid grid-cols-2 gap-1 text-[11px]">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-zinc-400" />
            <span className="font-bold tabular-nums">{stats.defense}</span>
            {unit.current_defense !== stats.defense && (
              <span
                className={cn(
                  "font-bold tabular-nums",
                  unit.current_defense > stats.defense ? "text-emerald-300" : "text-rose-300",
                )}
              >
                {unit.current_defense > stats.defense ? "+" : ""}
                {unit.current_defense - stats.defense}
              </span>
            )}
            <span className="text-zinc-500">DEF</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-zinc-400" />
            <span className="font-bold tabular-nums">+{stats.regeneration}</span>
            {unit.current_regeneration !== stats.regeneration && (
              <span className="font-bold tabular-nums text-emerald-300">
                +{unit.current_regeneration - stats.regeneration}
              </span>
            )}
            <span className="text-zinc-500">REG</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500">Скорость</span>
            <span className="font-bold tabular-nums">{stats.movement_range}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500">EN/раунд</span>
            <span className="font-bold tabular-nums">+{stats.energy_regen}</span>
          </div>
        </div>

        {/* Active statuses — coloured duration rings, spaced so they never
            blur into one strip. Green = buff, red = debuff. */}
        {unit.statuses.length > 0 && (
          <StatusRow statuses={unit.statuses} />
        )}

        {/* Turn actions, on the card. Activate (before activation) ▸ Move ▸
            End; stunned → Skip only. Absent (inspecting / not your turn). */}
        {(onActivate || onMove || onEndTurn || onSkipStun) && (
          <div className="mt-auto flex flex-col gap-1.5 pt-1">
            {onActivate && (
              <button
                type="button"
                onClick={onActivate}
                className="w-full h-8 text-xs font-bold border border-amber-500/80 bg-amber-600/25 hover:bg-amber-600/40 text-amber-100"
              >
                Активировать
              </button>
            )}
            {onSkipStun && (
              <button
                type="button"
                onClick={onSkipStun}
                className="w-full h-8 text-xs font-bold border border-rose-500/70 bg-rose-600/20 hover:bg-rose-600/30 text-rose-100"
              >
                Оглушён — пропустить
              </button>
            )}
            {!onSkipStun && (onMove || onEndTurn) && (
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={!onMove}
                  onClick={onMove}
                  className={cn(
                    "h-8 text-xs font-bold border",
                    onMove
                      ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-600 cursor-not-allowed",
                  )}
                >
                  Двинуться
                </button>
                <button
                  type="button"
                  onClick={onEndTurn}
                  className="h-8 text-xs font-bold border border-amber-600/60 bg-amber-600/15 hover:bg-amber-600/25 text-amber-100"
                >
                  Завершить
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AttackCardBody({ item }: { item: Extract<FanItem, { kind: "attack" }> }) {
  const attack = item.char.attack;
  const icon = absolutizeMediaUrl(attack.icon_url ?? null);
  const dmg = String(attack.damage_schema.value);
  const rangeLabel = attack.range === 1 ? "1 (ближний)" : String(attack.range);
  const magical = attack.damage_type === "MAGICAL";

  return (
    <>
      <div className="relative aspect-[16/10] w-full bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 overflow-hidden border-b border-zinc-800">
        {icon ? (
          <img
            src={icon}
            alt={attack.name}
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, transparent 0 14px, rgba(255,255,255,0.05) 14px 16px)",
            }}
          />
        )}
      </div>

      {/* Урон (с типом) / Радиус. */}
      <div className="grid grid-cols-2 text-[11px] border-b border-zinc-800">
        <div className="px-2 py-1 text-center">
          <p className="text-amber-600/80 leading-tight">Урон</p>
          <p className="font-bold tabular-nums text-zinc-100">
            {dmg}{" "}
            <span className={cn("text-[9px] font-semibold", magical ? "text-violet-300" : "text-orange-300")}>
              {magical ? "маг" : "физ"}
            </span>
          </p>
        </div>
        <div className="px-2 py-1 text-center border-l border-zinc-800">
          <p className="text-amber-600/80 leading-tight">Радиус</p>
          <p className="font-bold text-zinc-100">{rangeLabel}</p>
        </div>
      </div>

      {attack.description && (
        <p className="px-3 py-2 text-[11px] text-zinc-300 leading-snug">{attack.description}</p>
      )}

      {/* Attack from the card itself. */}
      {item.onAttack && (
        <div className="mt-auto px-3 py-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={item.onAttack}
            className="w-full h-9 text-xs font-bold border border-amber-500/80 bg-amber-600/20 hover:bg-amber-600/35 text-amber-100"
          >
            Атаковать
          </button>
        </div>
      )}
    </>
  );
}

function AbilityCardBody({ item }: { item: Extract<FanItem, { kind: "ability" }> }) {
  const ability = item.ability;
  const unit = item.unit;
  const icon = absolutizeMediaUrl(ability.icon_url ?? null);
  const range = abilityRangeLabel(ability.execution_chain);
  const cd = unit.cooldowns[ability.id] ?? 0;
  const onCd = cd > 0;
  const dmgType = chainDamageType(ability.execution_chain);
  // Effective radius folds in the unit's ABILITY_RANGE aura (e.g. Starlink),
  // so the card matches what the engine will actually hit.
  const rangeBonus = unit.modifiers?.ABILITY_RANGE ?? 0;
  const rangeNumMatch = range ? range.match(/(\d+)/) : null;
  const radiusText = rangeNumMatch
    ? String(parseInt(rangeNumMatch[1], 10) + rangeBonus)
    : range
    ? range.replace(/^Радиус\s*/i, "")
    : "—";

  return (
    <>
      <div className="relative aspect-[16/10] w-full bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 overflow-hidden border-b border-zinc-800">
        {icon ? (
          <img
            src={icon}
            alt={ability.name}
            draggable={false}
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-all duration-300",
              // Full brightness when ready; only dim + desaturate while it's
              // actually recharging (so the cooldown ring reads clearly).
              onCd && "grayscale brightness-[0.5]",
            )}
          />
        ) : (
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, transparent 0 14px, rgba(255,255,255,0.05) 14px 16px)",
            }}
          />
        )}
        {/* Dark wash only behind the cooldown ring for legibility. */}
        {onCd && <div className="absolute inset-0 bg-black/35 pointer-events-none" />}
        {onCd && <CooldownRing remaining={cd} total={ability.cooldown} />}
        {/* Damage type chip (physical / magical), when the ability deals damage. */}
        {dmgType && (
          <span
            className={cn(
              "absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded border bg-black/60",
              dmgType === "MAGICAL" ? "border-violet-400/60 text-violet-200" : "border-orange-400/60 text-orange-200",
            )}
          >
            {dmgType === "MAGICAL" ? "Маг." : "Физ."}
          </span>
        )}
      </div>

      {/* Uniform 3-cell stat strip — Энергия / Радиус / Перезарядка always
          present (— when N/A) so every ability card reads the same way. */}
      <div className="grid grid-cols-3 text-[11px] border-b border-zinc-800">
        <div className="px-2 py-1 text-center">
          <p className="text-amber-600/80 leading-tight">Энергия</p>
          <p className="font-bold tabular-nums text-zinc-100">{ability.energy_cost} EN</p>
        </div>
        <div className="px-2 py-1 text-center border-l border-zinc-800">
          <p className="text-amber-600/80 leading-tight">Радиус</p>
          <p className="font-bold text-zinc-100 leading-tight">
            {radiusText}
            {rangeNumMatch && rangeBonus > 0 && (
              <span className="text-sky-300 text-[9px]"> +{rangeBonus}</span>
            )}
          </p>
        </div>
        <div className="px-2 py-1 text-center border-l border-zinc-800">
          <p className="text-amber-600/80 leading-tight">КД</p>
          <p className="font-bold tabular-nums text-zinc-100">
            {ability.cooldown === 0 ? "—" : onCd ? `${cd}/${ability.cooldown}` : `${ability.cooldown}р.`}
          </p>
        </div>
      </div>

      {ability.description && (
        <p className="px-3 py-2 text-[11px] text-zinc-300 leading-snug">{ability.description}</p>
      )}

      {/* Use the ability straight from its card. */}
      {item.onUse && (
        <div className="mt-auto px-3 py-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={item.onUse}
            className="w-full h-9 text-xs font-bold border border-amber-500/80 bg-amber-600/20 hover:bg-amber-600/35 text-amber-100"
          >
            Использовать
          </button>
        </div>
      )}
    </>
  );
}

function PassiveCardBody({ item }: { item: Extract<FanItem, { kind: "passive" }> }) {
  const passive = item.passive;
  const icon = absolutizeMediaUrl(passive.icon_url ?? null);

  return (
    <>
      <div className="relative aspect-[16/10] w-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black overflow-hidden border-b border-zinc-800">
        {icon ? (
          <img src={icon} alt={passive.name} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        ) : (
          <div
            className="absolute inset-0 opacity-15"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, transparent 0 14px, rgba(255,255,255,0.04) 14px 16px)",
            }}
          />
        )}
      </div>

      {passive.description && (
        <p className="px-3 py-2 text-[11px] text-zinc-400 leading-snug">{passive.description}</p>
      )}

      <div className="mt-auto px-3 py-2 border-t border-zinc-800 text-center text-[11px] text-zinc-500 italic">
        Срабатывает автоматически
      </div>
    </>
  );
}



// ── Map-style viewport: drag to pan, wheel to zoom (cursor-anchored). ──
// Tokens stop pointer propagation so grabbing one doesn't start a pan.
function BattleMapView({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const stateRef = useRef({ scale, pan });
  stateRef.current = { scale, pan };
  const dragRef = useRef({ pointerX: 0, pointerY: 0, panX: 0, panY: 0 });

  // Centre the field once the container has measured itself.
  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;
    setPan({
      x: (container.clientWidth - inner.offsetWidth) / 2,
      y: (container.clientHeight - inner.offsetHeight) / 2,
    });
  }, []);

  // Native wheel listener — React's synthetic wheel is passive in some setups
  // so preventDefault gets ignored. We attach manually with passive: false.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const { scale: s, pan: p } = stateRef.current;
      const worldX = (cx - p.x) / s;
      const worldY = (cy - p.y) / s;
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const newScale = Math.max(0.4, Math.min(2.5, s * factor));
      setPan({
        x: cx - worldX * newScale,
        y: cy - worldY * newScale,
      });
      setScale(newScale);
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  // Deferred-capture pan: we don't take ownership of the pointer until it
  // actually moves > PAN_THRESHOLD pixels. That way a short click on a child
  // (zone, button) fires normally instead of being stolen by the map.
  const PAN_THRESHOLD = 5;
  const pendingPanRef = useRef<{ pointerId: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    pendingPanRef.current = { pointerId: e.pointerId };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // If we haven't started a pan yet, see if this pointer crossed the
    // threshold. Capture only then so a tap still propagates to children.
    if (!dragging && pendingPanRef.current?.pointerId === e.pointerId) {
      const dx = e.clientX - dragRef.current.pointerX;
      const dy = e.clientY - dragRef.current.pointerY;
      if (Math.hypot(dx, dy) > PAN_THRESHOLD) {
        try {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } catch {
          // ignore — capture may be unavailable
        }
        setDragging(true);
      }
    }
    if (!dragging) return;
    setPan({
      x: dragRef.current.panX + (e.clientX - dragRef.current.pointerX),
      y: dragRef.current.panY + (e.clientY - dragRef.current.pointerY),
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) setDragging(false);
    pendingPanRef.current = null;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      // pointer wasn't captured — fine
    }
  };

  const zoomBy = (factor: number) => {
    const container = containerRef.current;
    if (!container) return;
    const cx = container.clientWidth / 2;
    const cy = container.clientHeight / 2;
    const worldX = (cx - pan.x) / scale;
    const worldY = (cy - pan.y) / scale;
    const newScale = Math.max(0.4, Math.min(2.5, scale * factor));
    setPan({ x: cx - worldX * newScale, y: cy - worldY * newScale });
    setScale(newScale);
  };

  const reset = () => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;
    setScale(1);
    setPan({
      x: (container.clientWidth - inner.offsetWidth) / 2,
      y: (container.clientHeight - inner.offsetHeight) / 2,
    });
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="relative w-full h-full borde bg-black overflow-hidden touch-none select-none"
      style={{ cursor: dragging ? "grabbing" : "grab" }}
    >
      <div
        ref={innerRef}
        className="absolute will-change-transform"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        {children}
      </div>

      {/* Zoom / reset controls. Stop pointerdown so the buttons themselves
          don't start a pan when clicked. */}
      <div
        className="absolute right-3 bottom-3 flex flex-col gap-1.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Приблизить"
          onClick={() => zoomBy(1.2)}
          className="w-9 h-9 flex items-center justify-center border border-zinc-700 bg-zinc-900/85 hover:bg-zinc-800 text-zinc-100"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Отдалить"
          onClick={() => zoomBy(1 / 1.2)}
          className="w-9 h-9 flex items-center justify-center border border-zinc-700 bg-zinc-900/85 hover:bg-zinc-800 text-zinc-100"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Центрировать"
          onClick={reset}
          className="w-9 h-9 flex items-center justify-center border border-zinc-700 bg-zinc-900/85 hover:bg-zinc-800 text-zinc-100"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Tiny zoom-level indicator, top-right corner */}
      <div className="absolute right-3 top-3 px-2 py-0.5 border border-zinc-700 bg-zinc-900/85 text-[10px] font-mono text-zinc-300 pointer-events-none">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}


// ── Telegraph layer ─────────────────────────────────────────────────────
// Pops a codex-style card whenever EITHER player acts, so both sides can see
// which ability was applied. Cards fade/scale in smoothly and dwell for a few
// seconds. Hovering the stack pauses dismissal of EVERY card; once the cursor
// leaves, any card whose dwell already elapsed slides out immediately. A single
// "×" closes them all. Clicking a card opens the character codex on that entry.
const TELEGRAPH_DWELL_MS = 4000;
const TELEGRAPH_EXIT_MS = 260;

type LiveCard = { ev: TelegraphEvent; expired: boolean; leaving: boolean };

// Resolve a telegraph event to its character, display card, and the codex
// entry id to highlight when the card is clicked ("attack" | ability/passive id).
function resolveTelegraph(
  ev: TelegraphEvent,
  battle: BattleSnapshot,
  byId: Map<string, CharacterDef>,
): {
  char: CharacterDef;
  title: { name: string; tag: string };
  body: React.ReactNode;
  highlightId: string;
} | null {
  const unit = battle.units[ev.unitId];
  const char = unit ? byId.get(unit.char_id) : undefined;
  if (!unit || !char) return null;

  if (ev.kind === "attack") {
    return {
      char,
      title: { name: char.attack.name, tag: "Атака" },
      body: <AttackCardBody item={{ kind: "attack", char }} />,
      highlightId: "attack",
    };
  }
  if (ev.kind === "ability") {
    const ability = char.abilities.find((a) => a.id === ev.refId) ?? char.abilities[0];
    if (!ability) return null;
    return {
      char,
      title: {
        name: ability.name,
        tag: ability.is_ult ? "Ульта" : ability.is_quick ? "Быстрая" : "Способность",
      },
      body: <AbilityCardBody item={{ kind: "ability", char, unit, ability }} />,
      highlightId: ability.id,
    };
  }
  const passive =
    char.passives.find((p) => p.id === ev.refId) ??
    char.passives.find((p) => p.name === ev.name) ??
    char.passives[0];
  if (!passive) return null;
  return {
    char,
    title: { name: passive.name, tag: "Пассивка" },
    body: <PassiveCardBody item={{ kind: "passive", char, passive }} />,
    highlightId: passive.id,
  };
}

function TelegraphCard({
  card,
  battle,
  byId,
  onRemove,
  onOpen,
  mine,
}: {
  card: LiveCard;
  battle: BattleSnapshot;
  byId: Map<string, CharacterDef>;
  onRemove: (key: number) => void;
  onOpen: (char: CharacterDef, highlightId: string) => void;
  // True when the acting unit belongs to the local player.
  mine: boolean;
}) {
  const [shown, setShown] = useState(false);

  // Trigger the enter transition on the frame after mount.
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);

  // Once the parent flags us as leaving, let the exit transition play, then
  // ask to be unmounted.
  useEffect(() => {
    if (!card.leaving) return;
    const t = setTimeout(() => onRemove(card.ev.key), TELEGRAPH_EXIT_MS);
    return () => clearTimeout(t);
  }, [card.leaving, card.ev.key, onRemove]);

  const resolved = resolveTelegraph(card.ev, battle, byId);
  if (!resolved) return null;
  const { char, title, body, highlightId } = resolved;

  const visible = shown && !card.leaving;

  return (
    <button
      type="button"
      onClick={() => onOpen(char, highlightId)}
      title="Открыть описание"
      className={cn(
        "w-[190px] text-left border bg-zinc-950/95 overflow-hidden flex flex-col cursor-pointer",
        "shadow-[0_12px_40px_rgba(0,0,0,0.8)] transition-all duration-300 ease-out will-change-transform hover:brightness-110",
        mine ? "border-emerald-600/50" : "border-rose-700/50",
        visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-3 scale-95",
      )}
    >
      <div
        className={cn(
          "px-2 py-1 border-b text-[10px] font-bold flex items-center justify-between",
          mine
            ? "bg-emerald-950/80 border-emerald-900 text-emerald-300"
            : "bg-rose-950/70 border-rose-900 text-rose-300",
        )}
      >
        <span>{mine ? "✦ Вы" : "⚔ Соперник"}</span>
        <span className="text-zinc-500 truncate">{char.name}</span>
      </div>
      <CardTitle name={title.name} tag={title.tag} />
      {body}
    </button>
  );
}

function TelegraphLayer({
  telegraphs,
  battle,
  byId,
  mySide,
}: {
  telegraphs?: TelegraphEvent[];
  battle: BattleSnapshot;
  byId: Map<string, CharacterDef>;
  mySide: Side;
}) {
  const [cards, setCards] = useState<LiveCard[]>([]);
  const [hovered, setHovered] = useState(false);
  const [detail, setDetail] = useState<{ char: CharacterDef; highlightId: string } | null>(null);
  const seenKey = useRef(0);
  const expiryTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ingest freshly-arrived telegraph events (both sides; on-field units only).
  useEffect(() => {
    if (!telegraphs || telegraphs.length === 0) return;
    const last = telegraphs[telegraphs.length - 1].key;
    if (last <= seenKey.current) return;
    const fresh = telegraphs.filter((t) => t.key > seenKey.current && battle.units[t.unitId]);
    seenKey.current = last;
    if (fresh.length) {
      setCards((prev) =>
        [...prev, ...fresh.map((ev) => ({ ev, expired: false, leaving: false }))].slice(-5),
      );
    }
  }, [telegraphs, battle.units]);

  // Per-card dwell timer. Runs independently of hover so the countdown keeps
  // going while you read; expiry only flags the card — removal is gated below.
  useEffect(() => {
    for (const c of cards) {
      if (c.expired || expiryTimers.current.has(c.ev.key)) continue;
      const key = c.ev.key;
      const id = setTimeout(() => {
        expiryTimers.current.delete(key);
        setCards((prev) => prev.map((x) => (x.ev.key === key ? { ...x, expired: true } : x)));
      }, TELEGRAPH_DWELL_MS);
      expiryTimers.current.set(key, id);
    }
  }, [cards]);

  // Clear any pending timers on unmount.
  useEffect(() => {
    const timers = expiryTimers.current;
    return () => timers.forEach((id) => clearTimeout(id));
  }, []);

  // Group-level hover: hovering ANY card (or the close button) pauses dismissal
  // of every card. A short debounce keeps the pause alive while the cursor
  // crosses the gaps between cards.
  const handleEnter = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(true);
  }, []);
  const handleLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(false), 120);
  }, []);

  // Dismissal gate: while the cursor is over the stack nothing leaves; once it
  // moves away, every card whose dwell already elapsed begins its exit.
  useEffect(() => {
    if (hovered) return;
    setCards((prev) => {
      if (!prev.some((c) => c.expired && !c.leaving)) return prev;
      return prev.map((c) => (c.expired && !c.leaving ? { ...c, leaving: true } : c));
    });
  }, [hovered, cards]);

  const removeCard = useCallback((key: number) => {
    const id = expiryTimers.current.get(key);
    if (id) {
      clearTimeout(id);
      expiryTimers.current.delete(key);
    }
    setCards((prev) => prev.filter((c) => c.ev.key !== key));
  }, []);

  const closeAll = useCallback(() => {
    setCards((prev) => prev.map((c) => ({ ...c, leaving: true })));
  }, []);

  if (!cards.length && !detail) return null;

  return (
    <>
      {cards.length > 0 && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 pointer-events-none">
          <div className="flex gap-2 items-start">
            {cards.map((c) => (
              <div
                key={c.ev.key}
                className="pointer-events-auto"
                onMouseEnter={handleEnter}
                onMouseLeave={handleLeave}
              >
                <TelegraphCard
                  card={c}
                  battle={battle}
                  byId={byId}
                  onRemove={removeCard}
                  onOpen={(char, highlightId) => setDetail({ char, highlightId })}
                  mine={battle.units[c.ev.unitId]?.owner_side === mySide}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={closeAll}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
            aria-label="Закрыть все"
            className="pointer-events-auto self-end flex items-center gap-1 px-2 py-0.5 text-[11px] text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 bg-zinc-900/90 shadow-lg"
          >
            <span className="text-sm leading-none">×</span>
            Закрыть
          </button>
        </div>
      )}

      {detail && (
        <CharacterDetail
          char={detail.char}
          highlightId={detail.highlightId}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

export default function BattleScreen({
  leftPlayer,
  rightPlayer,
  battle,
  mySide,
  opponentDisconnected,
  procPulses,
  opponentInspect,
  telegraphs,
  onInspect,
  actions,
}: BattleScreenProps) {
  const { byId, isLoading, error } = useCharacterRoster();
  const oppSide: Side = mySide === "LEFT" ? "RIGHT" : "LEFT";
  const isMyTurn = battle.current_actor_side === mySide;

  const [targeting, setTargeting] = useState<Targeting>(null);
  // "Inspect" selection — independent from `battle.active_unit_id`. Clicking
  // any unit (mine or enemy) sets this; activation happens via a separate
  // button so a player can peek at enemy / non-activated own units freely.
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  // Telegraph our inspection to the opponent so they see what we're reading.
  const onInspectRef = useRef(onInspect);
  onInspectRef.current = onInspect;
  useEffect(() => {
    onInspectRef.current?.(selectedUnitId);
  }, [selectedUnitId]);

  // Drag-to-move state. Tracks the in-flight pointer for the currently
  // activated unit. `isDragging` flips on once the pointer crosses the 6px
  // threshold so short clicks don't accidentally count as drags.
  const [dragState, setDragState] = useState<{
    unitId: string;
    pointerId: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isDragging: boolean;
  } | null>(null);
  const DRAG_THRESHOLD = 6;

  // Clear targeting / drag if the active unit changes (turn ends).
  useEffect(() => {
    setTargeting(null);
    setDragState(null);
  }, [battle.active_unit_id, battle.current_actor_side]);

  // Whenever the server activates a unit (mine or theirs), pull selection to
  // it so the fan area shows the right cards by default. The player can still
  // click elsewhere to inspect another unit; their selection wins until the
  // next activation event.
  useEffect(() => {
    if (battle.active_unit_id) setSelectedUnitId(battle.active_unit_id);
  }, [battle.active_unit_id]);

  const activeUnit = battle.active_unit_id ? battle.units[battle.active_unit_id] : null;
  const isMyActiveUnit = activeUnit?.owner_side === mySide;
  const activeChar = activeUnit ? byId.get(activeUnit.char_id) : undefined;
  const isStunned = !!activeUnit?.statuses.some((s) => s.name === "STUN");

  // The inspected unit shown in the fan area — defaults to the activated unit
  // but the player can override by clicking any other token.
  const selectedUnit = selectedUnitId ? battle.units[selectedUnitId] : null;
  const selectedChar = selectedUnit ? byId.get(selectedUnit.char_id) : undefined;

  // Movement / attack reach for the currently-active unit (used for highlights).
  const movementRange = activeChar?.base_stats.movement_range ?? 1;
  const attackRange = activeChar?.attack.range ?? 1;
  // Aura bonus to ability reach (Starlink). Added to ability selector ranges so
  // the UI offers the same targets the server will accept.
  const abilityRangeBonus = activeUnit?.modifiers?.ABILITY_RANGE ?? 0;

  // Zones the active unit could currently move into (independent of how the
  // move is invoked — click-after-button or drag).
  const movableZones = useMemo(() => {
    const set = new Set<number>();
    if (!isMyActiveUnit || !activeUnit) return set;
    if (activeUnit.move_count >= 1 || isStunned) return set;
    for (let z = 0; z < 5; z++) {
      if (z !== activeUnit.zone && Math.abs(z - activeUnit.zone) <= movementRange) {
        set.add(z);
      }
    }
    return set;
  }, [isMyActiveUnit, activeUnit, isStunned, movementRange]);

  // Enemy unit ids in attack range during ATTACK targeting.
  const validAttackTargets = useMemo(() => {
    const set = new Set<string>();
    if (!isMyActiveUnit || !activeUnit || targeting?.kind !== "ATTACK") return set;
    for (const u of Object.values(battle.units)) {
      if (u.owner_side === mySide) continue;
      if (u.current_hp <= 0) continue;
      if (Math.abs(u.zone - activeUnit.zone) <= attackRange) {
        set.add(u.unit_id);
      }
    }
    return set;
  }, [isMyActiveUnit, activeUnit, targeting, attackRange, battle.units, mySide]);

  // Valid ability targets when in ABILITY_UNIT targeting. Defaults to enemies
  // because most ability chains hit them; abilities that need allies have
  // `filter: "ALLIES"` on their selector.
  const validAbilityUnitTargets = useMemo(() => {
    // Serves the unit-pick step of ABILITY_UNIT / ABILITY_UNIT_THEN_ZONE /
    // ABILITY_TWO_UNITS.
    const isUnitStep =
      targeting?.kind === "ABILITY_UNIT" ||
      (targeting?.kind === "ABILITY_UNIT_THEN_ZONE" && !targeting.pendingUnitId) ||
      targeting?.kind === "ABILITY_TWO_UNITS";
    if (!isUnitStep || !isMyActiveUnit || !activeUnit) {
      return EMPTY_STRING_SET;
    }
    const set = new Set<string>();
    const filter = targeting.filter ?? "ENEMIES";
    // Tesla uses its cast range for the ally pick; others use `range`.
    const range =
      targeting.kind === "ABILITY_UNIT_THEN_ZONE" ? targeting.castRange : targeting.range;
    // Second pick of a swap can't be the first-picked unit.
    const exclude =
      targeting.kind === "ABILITY_TWO_UNITS" ? targeting.firstUnitId : undefined;
    for (const u of Object.values(battle.units)) {
      if (u.current_hp <= 0) continue;
      if (exclude && u.unit_id === exclude) continue;
      const sideOk =
        filter === "ALL" ||
        (filter === "ALLIES" && u.owner_side === mySide) ||
        (filter === "ENEMIES" && u.owner_side !== mySide);
      if (!sideOk) continue;
      if (range !== undefined && Math.abs(u.zone - activeUnit.zone) > range) continue;
      set.add(u.unit_id);
    }
    return set;
  }, [targeting, isMyActiveUnit, activeUnit, battle.units, mySide]);

  // Zones the chosen ally can be flung to (second step of Tesla), measured
  // from the PENDING unit's zone, not the caster's.
  const validTeslaZones = useMemo(() => {
    if (
      targeting?.kind !== "ABILITY_UNIT_THEN_ZONE" ||
      !targeting.pendingUnitId ||
      !isMyActiveUnit
    ) {
      return EMPTY_NUMBER_SET;
    }
    const mover = battle.units[targeting.pendingUnitId];
    if (!mover) return EMPTY_NUMBER_SET;
    const set = new Set<number>();
    // Throw distance is fixed (moveRange) — Starlink doesn't extend it.
    for (let z = 0; z < 5; z++) {
      if (z !== mover.zone && Math.abs(z - mover.zone) <= targeting.moveRange) set.add(z);
    }
    return set;
  }, [targeting, isMyActiveUnit, battle.units]);

  // Zones reachable for ABILITY_ZONE targeting (Smoke Dash etc).
  const validAbilityZones = useMemo(() => {
    if (targeting?.kind !== "ABILITY_ZONE" || !isMyActiveUnit || !activeUnit) {
      return EMPTY_NUMBER_SET;
    }
    const set = new Set<number>();
    // Large range (Mars landing) → any zone, including the caster's own.
    const anyZone = targeting.range >= 5;
    for (let z = 0; z < 5; z++) {
      if (Math.abs(z - activeUnit.zone) > targeting.range) continue;
      if (z === activeUnit.zone && !anyZone) continue;
      set.add(z);
    }
    return set;
  }, [targeting, isMyActiveUnit, activeUnit]);

  // Combined highlight sets — one source of truth shared by zones, tokens,
  // and the triple-target button panel.
  const visibleZoneTargets: ReadonlySet<number> =
    targeting?.kind === "MOVE"
      ? movableZones
      : targeting?.kind === "ABILITY_ZONE"
      ? validAbilityZones
      : targeting?.kind === "ABILITY_UNIT_THEN_ZONE" && targeting.pendingUnitId
      ? validTeslaZones
      : dragState?.isDragging
      ? movableZones
      : EMPTY_NUMBER_SET;

  const visibleUnitTargets: ReadonlySet<string> =
    targeting?.kind === "ATTACK"
      ? validAttackTargets
      : targeting?.kind === "ABILITY_UNIT" ||
        targeting?.kind === "ABILITY_TWO_UNITS" ||
        (targeting?.kind === "ABILITY_UNIT_THEN_ZONE" && !targeting.pendingUnitId)
      ? validAbilityUnitTargets
      : EMPTY_STRING_SET;

  // Handler for clicks on any unit token (field or strip).
  const handleTokenClick = (unit: UnitState) => {
    if (targeting?.kind === "ATTACK" && validAttackTargets.has(unit.unit_id)) {
      actions.attack(unit.unit_id);
      setTargeting(null);
      return;
    }
    if (
      targeting?.kind === "ABILITY_UNIT"
      && validAbilityUnitTargets.has(unit.unit_id)
    ) {
      actions.useAbility({ abilityId: targeting.abilityId, unitId: unit.unit_id });
      setTargeting(null);
      return;
    }
    // Tesla step 1: lock the chosen ally, advance to zone selection.
    if (
      targeting?.kind === "ABILITY_UNIT_THEN_ZONE"
      && !targeting.pendingUnitId
      && validAbilityUnitTargets.has(unit.unit_id)
    ) {
      setTargeting({ ...targeting, pendingUnitId: unit.unit_id });
      return;
    }
    // Neuralink: pick first ally, then second — then swap.
    if (
      targeting?.kind === "ABILITY_TWO_UNITS"
      && validAbilityUnitTargets.has(unit.unit_id)
    ) {
      if (!targeting.firstUnitId) {
        setTargeting({ ...targeting, firstUnitId: unit.unit_id });
      } else {
        actions.useAbility({
          abilityId: targeting.abilityId,
          unitId: targeting.firstUnitId,
          unitId2: unit.unit_id,
        });
        setTargeting(null);
      }
      return;
    }
    // Second click on the already-selected, activatable unit → activate it
    // (first click opened the panel; clicking again commits).
    if (
      !targeting
      && selectedUnitId === unit.unit_id
      && unit.owner_side === mySide
      && isMyTurn
      && !battle.active_unit_id
      && !unit.has_moved
      && unit.current_hp > 0
    ) {
      actions.activate(unit.unit_id);
      return;
    }
    // Otherwise select the unit for inspection (opens the detail panel).
    setSelectedUnitId(unit.unit_id);
  };

  const handleZoneClick = (zoneIndex: number) => {
    if (targeting?.kind === "MOVE" && movableZones.has(zoneIndex)) {
      actions.move(zoneIndex);
      setTargeting(null);
    } else if (
      targeting?.kind === "ABILITY_ZONE"
      && validAbilityZones.has(zoneIndex)
    ) {
      actions.useAbility({ abilityId: targeting.abilityId, zone: zoneIndex });
      setTargeting(null);
    } else if (
      targeting?.kind === "ABILITY_UNIT_THEN_ZONE"
      && targeting.pendingUnitId
      && validTeslaZones.has(zoneIndex)
    ) {
      // Tesla step 2: ally + destination both chosen → fire.
      actions.useAbility({
        abilityId: targeting.abilityId,
        unitId: targeting.pendingUnitId,
        zone: zoneIndex,
      });
      setTargeting(null);
    }
  };

  // ── Drag-to-move handlers ────────────────────────────────────────────
  const canDragUnit = (unit: UnitState): boolean => {
    if (!isMyTurn || !isMyActiveUnit || !activeUnit) return false;
    if (activeUnit.unit_id !== unit.unit_id) return false;
    if (activeUnit.move_count >= 1 || isStunned) return false;
    return true;
  };

  const handleTokenPointerDown = (unit: UnitState, e: React.PointerEvent<HTMLDivElement>) => {
    // We still need stopPropagation so the map's pan handler ignores this.
    e.stopPropagation();
    if (!canDragUnit(unit)) return;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // older browsers / weird setups — fall through, drag still kind of works
    }
    setDragState({
      unitId: unit.unit_id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      isDragging: false,
    });
  };

  const handleTokenPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const isDragging =
      dragState.isDragging || Math.hypot(dx, dy) > DRAG_THRESHOLD;
    setDragState({
      ...dragState,
      currentX: e.clientX,
      currentY: e.clientY,
      isDragging,
    });
  };

  const handleTokenPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    try {
      (e.currentTarget as Element).releasePointerCapture(dragState.pointerId);
    } catch {
      // ignore
    }
    // Genuine drag — try to resolve the drop target via the actual element
    // under the pointer. Skip if it wasn't a real drag (counts as a click,
    // handled separately by onClick on the trigger element).
    if (dragState.isDragging) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const zoneEl = el?.closest?.("[data-zone-index]") as HTMLElement | null;
      if (zoneEl) {
        const idx = Number.parseInt(zoneEl.dataset.zoneIndex ?? "", 10);
        if (!Number.isNaN(idx) && movableZones.has(idx)) {
          actions.move(idx);
        }
      }
    }
    setDragState(null);
  };

  // Decide whether a given token is clickable at this moment.
  const tokenIsClickable = (unit: UnitState): boolean => {
    if (targeting?.kind === "ATTACK") return validAttackTargets.has(unit.unit_id);
    if (targeting?.kind === "ABILITY_UNIT")
      return validAbilityUnitTargets.has(unit.unit_id);
    if (targeting?.kind === "ABILITY_TWO_UNITS")
      return validAbilityUnitTargets.has(unit.unit_id);
    if (targeting?.kind === "ABILITY_UNIT_THEN_ZONE" && !targeting.pendingUnitId)
      return validAbilityUnitTargets.has(unit.unit_id);
    if (targeting) return false; // MOVE / ABILITY_ZONE / Tesla-zone — not clickable
    // Free inspection: any live unit is selectable for the fan view.
    return unit.current_hp > 0;
  };

  // Shared per-unit props so strip cards behave identically to field tokens.
  const unitCardProps = (unit: UnitState) => {
    const activation: TokenActivation =
      battle.active_unit_id === unit.unit_id
        ? "current"
        : activeUnitIds.has(unit.unit_id)
        ? "available"
        : "spent";
    return {
      activation,
      isValidTarget: visibleUnitTargets.has(unit.unit_id),
      isClickable: tokenIsClickable(unit),
      onClick: () => handleTokenClick(unit),
    };
  };

  // Mirror absolute server indices so the player's own zones always sit on
  // their left. Centre (index 2) stays in the middle.
  const renderedZones = useMemo(() => {
    const idx = mySide === "LEFT" ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0];
    return idx.map((zi) => ({ zoneIndex: zi, unitIds: battle.zones[zi] ?? [] }));
  }, [battle.zones, mySide]);

  const myUnits = useMemo(
    () =>
      Object.values(battle.units)
        .filter((u) => u.owner_side === mySide)
        .sort((a, b) => a.unit_id.localeCompare(b.unit_id)),
    [battle.units, mySide],
  );
  const oppUnits = useMemo(
    () =>
      Object.values(battle.units)
        .filter((u) => u.owner_side === oppSide)
        .sort((a, b) => a.unit_id.localeCompare(b.unit_id)),
    [battle.units, oppSide],
  );

  const activeUnitIds = useMemo(() => {
    const set = new Set<string>();
    for (const u of Object.values(battle.units)) {
      if (u.owner_side === battle.current_actor_side && !u.has_moved && u.current_hp > 0) {
        set.add(u.unit_id);
      }
    }
    return set;
  }, [battle.units, battle.current_actor_side]);

  return (
    <TooltipProvider delayDuration={150}>
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in-0 duration-500">
      {/* Round + score + turn — kept ABOVE the opponent strip so the match
          state stays visible even when the opponent's cards expand. */}
      <div className="flex items-center justify-center gap-6 px-6 py-2 border-b border-border bg-background/60">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Раунд</span>
          <span className="text-2xl font-black font-mono tabular-nums">
            {battle.current_round}
          </span>
        </div>

        {/* Kill scoreboard: your kills vs opponent's, target on the side. */}
        <div className="flex items-center gap-2">
          <span
            className="text-2xl font-black font-mono tabular-nums text-green-400"
            title="Ваши очки"
          >
            {battle.scores[mySide]}
          </span>
          <span className="text-lg font-bold text-muted-foreground">:</span>
          <span
            className="text-2xl font-black font-mono tabular-nums text-red-400"
            title="Очки соперника"
          >
            {battle.scores[oppSide]}
          </span>
          <span className="text-[11px] text-muted-foreground ml-1">
            до {battle.score_to_win}
          </span>
        </div>

        <div
          className={cn(
            "text-sm font-bold px-4 py-1 rounded-full border",
            isMyTurn
              ? "border-foreground text-foreground bg-foreground/10"
              : "border-border text-muted-foreground bg-muted/30",
          )}
        >
          {isMyTurn ? "Ваш ход" : "Ход соперника"}
        </div>
      </div>

      {/* Opponent strip */}
      <PlayerStrip
        player={oppSide === "LEFT" ? leftPlayer : rightPlayer}
        units={oppUnits}
        byId={byId}
        disconnected={opponentDisconnected}
        label="Соперник"
        getCardProps={unitCardProps}
      />

      {/* Map-view battlefield. The lane panel floats in a black viewport that
          the player can pan (drag the background) and zoom (mouse-wheel or
          +/- controls). Tokens stop pointer propagation so grabbing them
          doesn't start a pan. Square corners — RPG aesthetic in-game. */}
      <div className="flex-1 min-h-0 relative">
        {/* Inspection detail panel — slides in from the right when a unit is
            selected. Stays open during targeting (it doesn't cover the board),
            so you keep full info while picking a target. */}
        {selectedUnit && selectedChar && (
          <UnitDetailPanel
            unit={selectedUnit}
            char={selectedChar}
            side={selectedUnit.owner_side === mySide ? "left" : "right"}
            isActiveOwner={!!isMyActiveUnit && battle.active_unit_id === selectedUnit.unit_id}
            isStunned={
              isMyActiveUnit
              && battle.active_unit_id === selectedUnit.unit_id
              && isStunned
            }
            canActivate={
              selectedUnit.owner_side === mySide
              && isMyTurn
              && !battle.active_unit_id
              && !selectedUnit.has_moved
              && selectedUnit.current_hp > 0
            }
            onActivate={() => actions.activate(selectedUnit.unit_id)}
            onEndTurn={() => {
              setSelectedUnitId(null);
              actions.endTurn();
            }}
            onClose={() => setSelectedUnitId(null)}
            onChooseAttack={() => setTargeting({ kind: "ATTACK" })}
            onChooseMove={() => setTargeting({ kind: "MOVE" })}
            onUseAbility={(ability) => {
              const kind = getAbilityTargetingKind(ability);
              const abilityId = ability.id;
              const flt = (k?: string) => k as "ALLIES" | "ENEMIES" | "ALL" | undefined;
              if (kind.kind === "none") {
                actions.useAbility({ abilityId });
              } else if (kind.kind === "unit") {
                setTargeting({
                  kind: "ABILITY_UNIT",
                  abilityId,
                  filter: flt(kind.filter),
                  range: kind.range === undefined ? undefined : kind.range + abilityRangeBonus,
                });
              } else if (kind.kind === "unit_then_zone") {
                setTargeting({
                  kind: "ABILITY_UNIT_THEN_ZONE",
                  abilityId,
                  filter: flt(kind.filter) ?? "ALLIES",
                  castRange: kind.castRange + abilityRangeBonus,
                  moveRange: kind.moveRange,
                });
              } else if (kind.kind === "two_units") {
                setTargeting({
                  kind: "ABILITY_TWO_UNITS",
                  abilityId,
                  filter: flt(kind.filter) ?? "ALLIES",
                  range: kind.range + abilityRangeBonus,
                });
              } else {
                setTargeting({ kind: "ABILITY_ZONE", abilityId, range: kind.range + abilityRangeBonus });
              }
            }}
          />
        )}
        <BattleMapView>
          <div
            className="relative grid grid-cols-5 divide-x divide-zinc-800/70 border border-zinc-800 bg-zinc-900/55"
            style={{ width: 1100, height: 600 }}
          >
            {/* depth vignette + dot grid placeholder. Drop a landscape image
                here later via background-image (or an absolute <img>). */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(255,255,255,0.025) 0%, transparent 55%), radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.55) 100%)",
              }}
            />
            <div
              className="absolute inset-0 opacity-[0.07] pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            />

            {renderedZones.map(({ zoneIndex, unitIds }, displayIdx) => {
              const isCentre = displayIdx === 2;
              const isMyHalf = displayIdx < 2;
              const isValidMoveZone = visibleZoneTargets.has(zoneIndex);
              return (
                <div
                  key={zoneIndex}
                  data-zone-index={zoneIndex}
                  onClick={() => handleZoneClick(zoneIndex)}
                  className={cn(
                    "relative flex flex-col items-stretch h-full overflow-hidden",
                    isValidMoveZone &&
                      "ring-2 ring-amber-400 ring-inset cursor-pointer bg-amber-500/5",
                  )}
                >
                  <div className="px-2 pt-3 pb-2 text-center">
                    <p className="text-xs sm:text-sm font-bold text-zinc-200">
                      {zoneLabel(zoneIndex)}
                    </p>
                    {!isCentre && (
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {isMyHalf ? "Ваша сторона" : "Сторона соперника"}
                      </p>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-center gap-3 px-2 py-4">
                    {unitIds.length === 0 ? (
                      <span className="text-xs text-zinc-700">пусто</span>
                    ) : (
                      unitIds.map((uid) => {
                        const unit = battle.units[uid];
                        if (!unit) return null;
                        const activation: TokenActivation =
                          battle.active_unit_id === uid
                            ? "current"
                            : activeUnitIds.has(uid)
                            ? "available"
                            : "spent";
                        const beingDragged =
                          dragState?.unitId === uid && dragState.isDragging;
                        const scatter = tokenScatter(uid);
                        return (
                          <div
                            key={uid}
                            style={{
                              transform: `translate(${scatter.x}px, ${scatter.y}px) rotate(${scatter.rotate}deg)`,
                            }}
                          >
                            <UnitToken
                              unit={unit}
                              char={byId.get(unit.char_id)}
                              activation={activation}
                              isMine={unit.owner_side === mySide}
                              isSelected={selectedUnitId === uid}
                              isValidTarget={visibleUnitTargets.has(uid)}
                              isClickable={tokenIsClickable(unit)}
                              isBeingDragged={beingDragged}
                              procPulse={procPulses?.[uid]}
                              inspectedByOpp={opponentInspect === uid}
                              onClick={() => handleTokenClick(unit)}
                              onPointerDown={(e) => handleTokenPointerDown(unit, e)}
                              onPointerMove={handleTokenPointerMove}
                              onPointerUp={handleTokenPointerUp}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </BattleMapView>
      </div>

      {/* My strip */}
      <PlayerStrip
        player={mySide === "LEFT" ? leftPlayer : rightPlayer}
        units={myUnits}
        byId={byId}
        label="Вы"
        getCardProps={unitCardProps}
      />

      {/* Floating target-picker bar — only present while the player is in
          the middle of an Attack / Move / Ability targeting flow. All other
          turn controls live on the hero card now. */}
      {targeting && isMyActiveUnit && (
        <TargetingBar
          targeting={targeting}
          validUnitTargets={visibleUnitTargets}
          validZoneTargets={visibleZoneTargets}
          battleUnits={battle.units}
          byId={byId}
          mySide={mySide}
          onPickTargetUnit={(uid) => {
            if (targeting.kind === "ATTACK") {
              actions.attack(uid);
              setTargeting(null);
            } else if (targeting.kind === "ABILITY_UNIT") {
              actions.useAbility({ abilityId: targeting.abilityId, unitId: uid });
              setTargeting(null);
            } else if (
              targeting.kind === "ABILITY_UNIT_THEN_ZONE" && !targeting.pendingUnitId
            ) {
              // Step 1 of Tesla — keep the bar open for the zone pick.
              setTargeting({ ...targeting, pendingUnitId: uid });
            } else if (targeting.kind === "ABILITY_TWO_UNITS") {
              if (!targeting.firstUnitId) {
                setTargeting({ ...targeting, firstUnitId: uid });
              } else {
                actions.useAbility({
                  abilityId: targeting.abilityId,
                  unitId: targeting.firstUnitId,
                  unitId2: uid,
                });
                setTargeting(null);
              }
            }
          }}
          onPickTargetZone={(z) => {
            if (targeting.kind === "MOVE") {
              actions.move(z);
              setTargeting(null);
            } else if (targeting.kind === "ABILITY_ZONE") {
              actions.useAbility({ abilityId: targeting.abilityId, zone: z });
              setTargeting(null);
            } else if (
              targeting.kind === "ABILITY_UNIT_THEN_ZONE" && targeting.pendingUnitId
            ) {
              actions.useAbility({
                abilityId: targeting.abilityId,
                unitId: targeting.pendingUnitId,
                zone: z,
              });
              setTargeting(null);
            }
          }}
          onCancel={() => setTargeting(null)}
        />
      )}

      {/* Opponent action telegraph — pops their attack/ability/passive cards. */}
      <TelegraphLayer telegraphs={telegraphs} battle={battle} byId={byId} mySide={mySide} />

      {(error || isLoading) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
          {error ?? "Загрузка ростера…"}
        </div>
      )}

      {/* (Inspection cards moved INSIDE the field wrapper above so they
          anchor to the strip's actual top edge, regardless of strip height.) */}

      {/* Drag ghost — circular avatar following the pointer while the player
          is dragging their active unit. Positioned with `fixed` so it sits
          above the map regardless of zoom/pan. */}
      {dragState?.isDragging &&
        (() => {
          const draggedUnit = battle.units[dragState.unitId];
          const draggedChar = draggedUnit ? byId.get(draggedUnit.char_id) : undefined;
          const portrait = absolutizeMediaUrl(draggedChar?.portrait_url ?? null);
          const initial = (draggedChar?.name ?? "?").trim().slice(0, 1).toUpperCase();
          return (
            <div
              className="fixed pointer-events-none z-[60] -translate-x-1/2 -translate-y-1/2"
              style={{ left: dragState.currentX, top: dragState.currentY }}
            >
              <div className="h-20 w-20 rounded-full border-2 border-amber-400 bg-zinc-900/85 backdrop-blur-sm shadow-2xl overflow-hidden flex items-center justify-center">
                {portrait ? (
                  <img
                    src={portrait}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <span className="text-2xl font-black text-zinc-100">{initial}</span>
                )}
              </div>
            </div>
          );
        })()}
    </div>
    </TooltipProvider>
  );
}
