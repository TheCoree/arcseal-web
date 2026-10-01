"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Crown, House, RotateCcw, Skull, Sparkles, Swords, Shield } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RankBadge, getProgressDetails } from "@/app/components/RankBadge";
import { useCharacterRoster } from "@/app/hooks/useCharacterRoster";
import { absolutizeAvatarUrl, absolutizeMediaUrl, cn } from "@/lib/utils";
import type {
  CharacterDef,
  EndReason,
  FinishInfo,
  MatchSummary,
  PlayerInfo,
  ResultData,
  Side,
} from "@/app/components/game/types";

interface ResultScreenProps {
  me: PlayerInfo | null;
  opponent: PlayerInfo | null;
  mySide: Side | null;
  myResult: ResultData | null;
  opponentResult: ResultData | null;
  finish: FinishInfo | null;
  onReturnHome: () => void;
  onPlayAgain: () => void;
}

type Outcome = "win" | "lose" | "draw";

const OUTCOME_STYLE: Record<Outcome, { title: string; text: string; glow: string; rgb: string }> = {
  win: { title: "ПОБЕДА", text: "text-amber-300", glow: "rgba(251,191,36,0.28)", rgb: "251,191,36" },
  lose: { title: "ПОРАЖЕНИЕ", text: "text-red-400", glow: "rgba(239,68,68,0.22)", rgb: "239,68,68" },
  draw: { title: "НИЧЬЯ", text: "text-zinc-200", glow: "rgba(161,161,170,0.2)", rgb: "161,161,170" },
};

function reasonText(reason: EndReason | undefined, outcome: Outcome): string {
  const won = outcome === "win";
  switch (reason) {
    case "surrender":
      return won ? "Соперник сдался" : "Вы сдались";
    case "disconnect":
      return won ? "Соперник покинул матч и не вернулся" : "Вы отключились и не вернулись вовремя";
    case "afk":
      return won ? "Техническая победа: соперник бездействовал" : "Техническое поражение за бездействие";
    default:
      return outcome === "draw"
        ? "Силы оказались равны"
        : won
        ? "Вы первыми набрали нужное число убийств"
        : "Соперник первым набрал нужное число убийств";
  }
}

function roundsLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? "раунд" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "раунда" : "раундов";
  return `${n} ${word}`;
}

// Animate a number from `from` to `to` after a short delay (ELO counter).
function useCountUp(from: number, to: number, durationMs = 1300, delayMs = 700): number {
  const [value, setValue] = useState(from);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - start) / durationMs));
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, durationMs, delayMs]);
  return value;
}

// Most valuable unit: kills weigh most, then damage dealt and healing done.
function mvpOf(summary: MatchSummary | undefined): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const u of summary?.units ?? []) {
    const score = u.stats.kills * 40 + u.stats.damage_dealt + u.stats.healing;
    if (score > bestScore) {
      bestScore = score;
      best = u.unit_id;
    }
  }
  return best;
}

// Deterministic sparks rising behind the title on a win.
function Sparks({ rgb }: { rgb: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 26 }, (_, i) => {
        const left = (i * 37) % 100;
        const size = 2 + ((i * 7) % 4);
        const delay = ((i * 13) % 40) / 10;
        const duration = 5 + ((i * 11) % 40) / 10;
        return (
          <span
            key={i}
            className="absolute bottom-0 rounded-full"
            style={{
              left: `${left}%`,
              width: size,
              height: size,
              background: `rgba(${rgb},0.9)`,
              boxShadow: `0 0 8px rgba(${rgb},0.9)`,
              animation: `result-spark ${duration}s linear ${delay}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

function PlayerBadge({ player, label, highlight }: { player: PlayerInfo | null; label: string; highlight: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <div className={cn("rounded-full p-1", highlight ? "ring-2 ring-amber-400/80" : "ring-1 ring-border")}>
        <Avatar className="h-16 w-16 sm:h-20 sm:w-20 border-2 border-background">
          <AvatarImage src={absolutizeAvatarUrl(player?.avatar_url) || ""} />
          <AvatarFallback className="text-xl font-bold bg-muted">
            {player?.display_name?.slice(0, 2).toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
      </div>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-sm font-bold truncate max-w-[10rem]">{player?.display_name ?? "—"}</span>
      {player && <RankBadge elo={player.elo} size="sm" />}
    </div>
  );
}

function HeroRow({
  unit,
  char,
  maxDamage,
  isMvp,
}: {
  unit: MatchSummary["units"][number];
  char: CharacterDef | undefined;
  maxDamage: number;
  isMvp: boolean;
}) {
  const portrait = absolutizeMediaUrl(char?.portrait_url ?? null);
  const s = unit.stats;
  return (
    <div className={cn("flex items-center gap-3 px-3 py-2 border", isMvp ? "border-amber-500/60 bg-amber-500/5" : "border-zinc-800 bg-zinc-900/50")}>
      <div className="relative h-10 w-10 shrink-0 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 flex items-center justify-center">
        {portrait ? (
          <img src={portrait} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        ) : (
          <span className="font-black text-zinc-300">{char?.name?.slice(0, 1) ?? "?"}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold truncate">{char?.name ?? unit.char_id}</span>
          {isMvp && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-amber-300">
              <Crown className="h-3 w-3" /> MVP
            </span>
          )}
        </div>
        <div className="mt-1 h-1.5 w-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-[width] duration-1000 ease-out"
            style={{ width: `${maxDamage > 0 ? (s.damage_dealt / maxDamage) * 100 : 0}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 text-right text-xs tabular-nums shrink-0">
        <span title="Убийства / смерти" className="font-bold">
          {s.kills}<span className="text-zinc-500">/{s.deaths}</span>
        </span>
        <span title="Нанесено урона" className="text-orange-300 inline-flex items-center justify-end gap-0.5">
          <Swords className="h-3 w-3" />{s.damage_dealt}
        </span>
        <span title="Получено урона" className="text-zinc-400 inline-flex items-center justify-end gap-0.5">
          <Shield className="h-3 w-3" />{s.damage_taken}
        </span>
        <span title="Лечение" className="text-green-400 inline-flex items-center justify-end gap-0.5">
          <Sparkles className="h-3 w-3" />{s.healing}
        </span>
      </div>
    </div>
  );
}

export default function ResultScreen({
  me,
  opponent,
  mySide,
  myResult,
  opponentResult,
  finish,
  onReturnHome,
  onPlayAgain,
}: ResultScreenProps) {
  const { byId } = useCharacterRoster();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const oldElo = myResult ? myResult.new_elo - myResult.elo_change : 0;
  const shownElo = useCountUp(oldElo, myResult?.new_elo ?? 0);
  const mvp = useMemo(() => mvpOf(finish?.summary), [finish]);

  if (!myResult || !opponentResult) return null;

  const outcome: Outcome = myResult.is_draw ? "draw" : myResult.is_winner ? "win" : "lose";
  const look = OUTCOME_STYLE[outcome];

  const units = finish?.summary.units ?? [];
  const mine = units.filter((u) => u.owner_side === mySide);
  const theirs = units.filter((u) => u.owner_side !== mySide);
  const maxDamage = Math.max(1, ...units.map((u) => u.stats.damage_dealt));

  const delta = myResult.elo_change;
  const pInfo = getProgressDetails(shownElo);
  const percent = Math.max(0, Math.min(100, ((shownElo - pInfo.prevElo) / pInfo.range) * 100));

  const fadeUp = (delay: number): React.CSSProperties => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(16px)",
    transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
  });

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-zinc-950 animate-in fade-in-0 duration-500">
      {/* Outcome-tinted backdrop */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: `radial-gradient(ellipse at 50% 18%, ${look.glow} 0%, transparent 60%)` }}
      />
      {outcome === "win" && <Sparks rgb={look.rgb} />}

      <div className="relative mx-auto flex min-h-full w-full max-w-4xl flex-col gap-8 px-6 py-10">
        {/* Title */}
        <header className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
            Матч окончен{finish?.summary.rounds ? ` · ${roundsLabel(finish.summary.rounds)}` : ""}
          </p>
          <h1
            className={cn("mt-2 text-5xl sm:text-7xl font-black", look.text)}
            style={{
              animation: "result-title-in 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) both",
              textShadow: `0 0 40px rgba(${look.rgb},0.45)`,
            }}
          >
            {look.title}
          </h1>
          <p className="mt-3 text-sm text-zinc-300" style={fadeUp(0.5)}>
            {reasonText(finish?.reason, outcome)}
          </p>
        </header>

        {/* Players + kill score */}
        <section className="flex items-center justify-center gap-6 sm:gap-12" style={fadeUp(0.2)}>
          <PlayerBadge player={me} label="Вы" highlight={outcome === "win"} />
          <div className="flex flex-col items-center">
            <div className="flex items-baseline gap-3 font-mono font-black tabular-nums">
              <span className="text-5xl sm:text-6xl text-emerald-300">{myResult.score}</span>
              <span className="text-3xl text-zinc-600">:</span>
              <span className="text-5xl sm:text-6xl text-rose-300">{opponentResult.score}</span>
            </div>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              <Skull className="h-3 w-3" /> убийства
            </span>
          </div>
          <PlayerBadge player={opponent} label="Соперник" highlight={outcome === "lose"} />
        </section>

        {/* ELO */}
        <section className="border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6" style={fadeUp(0.35)}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Рейтинг</h3>
            <div className="flex items-baseline gap-3">
              <span
                className={cn(
                  "px-2 py-0.5 text-sm font-black font-mono border",
                  delta > 0
                    ? "text-green-300 border-green-600/50 bg-green-950/40"
                    : delta < 0
                    ? "text-red-300 border-red-600/50 bg-red-950/40"
                    : "text-zinc-300 border-zinc-700",
                )}
              >
                {delta > 0 ? "+" : ""}
                {delta}
              </span>
              <span className="text-4xl font-black font-mono tabular-nums">{shownElo}</span>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <RankBadge elo={shownElo} size="sm" />
            <div className="relative h-3 flex-1 overflow-hidden border border-zinc-700 bg-zinc-800">
              <div
                className="h-full"
                style={{
                  width: `${percent}%`,
                  background: pInfo.isMax
                    ? pInfo.currentRankInfo.fromColor
                    : `linear-gradient(90deg, ${pInfo.currentRankInfo.fromColor} 0%, ${pInfo.nextRankInfo.toColor} 100%)`,
                }}
              />
            </div>
            {!pInfo.isMax && <RankBadge elo={pInfo.nextElo} size="sm" />}
          </div>
          {!pInfo.isMax && (
            <p className="mt-2 text-right text-[11px] text-muted-foreground">
              До ранга «{pInfo.nextRankInfo.title}»: {Math.max(0, pInfo.nextElo - shownElo)} ELO
            </p>
          )}
        </section>

        {/* Per-hero stats */}
        {units.length > 0 && (
          <section className="grid gap-4 md:grid-cols-2" style={fadeUp(0.5)}>
            {[
              { title: "Ваша команда", list: mine, tone: "text-emerald-300" },
              { title: "Команда соперника", list: theirs, tone: "text-rose-300" },
            ].map(({ title, list, tone }) => (
              <div key={title} className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className={cn("text-xs font-bold uppercase tracking-widest", tone)}>{title}</h3>
                  <span className="text-[10px] text-muted-foreground">У/С · урон · получено · лечение</span>
                </div>
                {list.map((u) => (
                  <HeroRow
                    key={u.unit_id}
                    unit={u}
                    char={byId.get(u.char_id)}
                    maxDamage={maxDamage}
                    isMvp={u.unit_id === mvp}
                  />
                ))}
              </div>
            ))}
          </section>
        )}

        {/* Actions */}
        <footer className="mt-auto flex flex-col-reverse items-center justify-center gap-3 sm:flex-row" style={fadeUp(0.65)}>
          <Button variant="outline" size="lg" onClick={onReturnHome} className="h-12 w-56 text-base font-bold">
            <House className="h-4 w-4" />
            В лобби
          </Button>
          <Button size="lg" onClick={onPlayAgain} className="h-12 w-56 text-base font-bold">
            <RotateCcw className="h-4 w-4" />
            Играть снова
          </Button>
        </footer>
      </div>
    </div>
  );
}
