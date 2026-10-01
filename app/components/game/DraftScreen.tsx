"use client";

import React, { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { RankBadge } from "@/app/components/RankBadge";
import { SurrenderButton } from "@/app/components/game/SurrenderButton";
import { TurnTimer } from "@/app/components/game/TurnTimer";
import { useCharacterRoster } from "@/app/hooks/useCharacterRoster";
import { absolutizeMediaUrl, cn } from "@/lib/utils";
import type {
  CharacterDef,
  DraftSnapshot,
  PlayerInfo,
  Side,
  TurnClock,
} from "@/app/components/game/types";

interface DraftScreenProps {
  leftPlayer: PlayerInfo | null;
  rightPlayer: PlayerInfo | null;
  draft: DraftSnapshot;
  mySide: Side;
  turnClock?: TurnClock | null;
  onBan: (charId: string) => void;
  onPick: (charId: string) => void;
  onSurrender: () => void;
}

const ROLE_LABEL_RU: Record<string, string> = {
  TANK: "Танк",
  DPS: "ДПС",
  SUPPORT: "Поддержка",
  ASSASSIN: "Ассасин",
  BRUISER: "Бугай",
};

type CardState =
  | "available"
  | "banned"
  | "picked_by_me"
  | "picked_by_opp";

function getCardState(charId: string, draft: DraftSnapshot, mySide: Side): CardState {
  const oppSide: Side = mySide === "LEFT" ? "RIGHT" : "LEFT";
  if (draft.bans[mySide].includes(charId) || draft.bans[oppSide].includes(charId)) return "banned";
  if (draft.picks[mySide].includes(charId)) return "picked_by_me";
  if (draft.picks[oppSide].includes(charId)) return "picked_by_opp";
  return "available";
}

function charInitial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase();
}

function CharacterCard({
  char,
  state,
  isMyTurn,
  onClick,
}: {
  char: CharacterDef;
  state: CardState;
  isMyTurn: boolean;
  onClick: () => void;
}) {
  const isClickable = state === "available" && isMyTurn;

  // Picked / banned cards all read as "taken" — dimmed and desaturated.
  // The only colour cue is a tiny status badge at the corner.
  const taken = state !== "available";

  return (
    <button
      type="button"
      disabled={!isClickable}
      onClick={isClickable ? onClick : undefined}
      className={cn(
        "group relative flex flex-col border bg-card/60 backdrop-blur-sm overflow-hidden transition-all duration-200 text-left",
        isClickable && "border-border hover:border-amber-600/40 hover:shadow-xl hover:-translate-y-0.5 cursor-pointer",
        !isClickable && !taken && "border-border/70",
        taken && "border-zinc-800 opacity-45 grayscale",
      )}
    >
      {/* RPG-tinged corner brackets — barely-there gilt accent that disappears
          for taken cards (grayscale wash hides them naturally). */}
      {!taken && (
        <>
          <span className="pointer-events-none absolute top-1.5 left-1.5 w-3.5 h-3.5 border-l border-t border-amber-600/45" />
          <span className="pointer-events-none absolute top-1.5 right-1.5 w-3.5 h-3.5 border-r border-t border-amber-600/45" />
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 w-3.5 h-3.5 border-l border-b border-amber-600/45" />
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 w-3.5 h-3.5 border-r border-b border-amber-600/45" />
        </>
      )}

      {/* Landscape portrait slot. Renders <img> when the character has art,
          otherwise falls back to a textured placeholder + initial. */}
      <div className="relative aspect-[16/10] w-full bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 overflow-hidden">
        {char.portrait_url ? (
          <img
            src={absolutizeMediaUrl(char.portrait_url) ?? ""}
            alt={char.name}
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
              <span className="text-7xl font-black text-white/10 select-none">
                {charInitial(char.name)}
              </span>
            </div>
          </>
        )}

        {/* Role + position chips */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
          <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-xs text-zinc-200">
            {ROLE_LABEL_RU[char.role] ?? char.role}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-xs text-zinc-200">
            {char.initial_position_type === "FRONTLINE" ? "Фронт" : "Тыл"}
          </span>
        </div>

        {/* Dark gradient + name overlay along the bottom of the portrait */}
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/85 via-black/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="text-lg sm:text-xl font-bold text-white leading-tight">
            {char.name}
          </h3>
        </div>

        {/* Taken-state corner badges */}
        {state === "picked_by_me" && (
          <span className="absolute top-2.5 left-1/2 -translate-x-1/2 text-xs text-white bg-black/65 border border-white/15 rounded-full px-2.5 py-0.5">
            Ваш выбор
          </span>
        )}
        {state === "picked_by_opp" && (
          <span className="absolute top-2.5 left-1/2 -translate-x-1/2 text-xs text-zinc-300 bg-black/65 border border-white/15 rounded-full px-2.5 py-0.5">
            У соперника
          </span>
        )}
        {state === "banned" && (
          <>
            <div className="absolute inset-0 bg-black/55" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="px-3 py-1 border border-white/30 text-white text-sm font-bold">
                Забанен
              </span>
            </div>
          </>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-1 px-4 pt-3 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground">HP</p>
          <p className="text-lg font-bold tabular-nums">{char.base_stats.hp}</p>
        </div>
        <div className="border-x border-border/40">
          <p className="text-[10px] text-muted-foreground">EN</p>
          <p className="text-lg font-bold tabular-nums">{char.base_stats.max_energy}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">DEF</p>
          <p className="text-lg font-bold tabular-nums">{char.base_stats.defense}</p>
        </div>
      </div>

      {/* Compact summary: basic attack + a glance of the kit (names only).
          Full per-ability detail lives on the /characters codex page. */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold truncate">{char.attack.name}</span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {char.attack.range === 1 ? "Ближний бой" : `Дистанция ${char.attack.range}`}
          </span>
        </div>
        {char.attack.description && (
          <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
            {char.attack.description}
          </p>
        )}

        {/* Kit chips — names + type, no descriptions to keep the card short. */}
        {(char.abilities.length > 0 || char.passives.length > 0) && (
          <div className="flex flex-wrap gap-1 pt-1">
            {char.abilities.map((ability) => (
              <span
                key={ability.id}
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded border",
                  ability.is_ult
                    ? "border-fuchsia-500/50 text-fuchsia-300"
                    : ability.is_quick
                    ? "border-sky-500/50 text-sky-300"
                    : "border-amber-600/50 text-amber-200",
                )}
                title={ability.is_ult ? "Ульта" : ability.is_quick ? "Быстрая" : "Способность"}
              >
                {ability.is_ult ? "★ " : ""}
                {ability.name}
              </span>
            ))}
            {char.passives.map((passive) => (
              <span
                key={passive.id}
                className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-600/60 text-zinc-300"
                title="Пассивка"
              >
                {passive.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function PickSlots({
  picks,
  expected,
  roster,
  align,
}: {
  picks: string[];
  expected: number;
  roster: Map<string, CharacterDef>;
  align: "left" | "right";
}) {
  const slots = Array.from({ length: expected }, (_, i) => picks[i] ?? null);
  return (
    <div className={cn("flex gap-2", align === "right" && "flex-row-reverse")}>
      {slots.map((id, i) => {
        const char = id ? roster.get(id) : null;
        const portrait = char ? absolutizeMediaUrl(char.portrait_url ?? null) : null;
        return (
          <div
            key={i}
            className={cn(
              "relative h-14 w-14 rounded-xl border flex flex-col items-center justify-center transition-all overflow-hidden",
              char
                ? "border-foreground/40 bg-zinc-800/80 animate-in zoom-in-75 fade-in-0 duration-300"
                : "border-border/40 bg-muted/10 border-dashed",
            )}
            title={char?.name ?? "—"}
          >
            {char && portrait ? (
              <>
                <img src={portrait} alt={char.name} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
                <span className="absolute inset-x-0 bottom-0 bg-black/65 text-[9px] text-center truncate px-0.5 text-zinc-100">
                  {char.name.split(" ")[0]}
                </span>
              </>
            ) : char ? (
              <>
                <span className="text-lg font-black text-foreground">
                  {charInitial(char.name)}
                </span>
                <span className="text-[9px] mt-0.5 max-w-[3.5rem] truncate text-muted-foreground">
                  {char.name.split(" ")[0]}
                </span>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">{i + 1}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlayerHeader({
  player,
  side,
  mySide,
  isTurn,
}: {
  player: PlayerInfo | null;
  side: Side;
  mySide: Side;
  isTurn: boolean;
}) {
  const isMe = side === mySide;
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        side === "RIGHT" && "flex-row-reverse text-right",
      )}
    >
      <div className="relative">
        {isTurn && (
          <div className="absolute -inset-1 rounded-full bg-foreground/15 animate-pulse" />
        )}
        <Avatar
          className={cn(
            "h-12 w-12 border-2 relative",
            isTurn ? "border-foreground" : "border-border",
          )}
        >
          <AvatarImage src={player?.avatar_url ?? ""} />
          <AvatarFallback className="bg-muted">
            {(player?.display_name ?? "?").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className={cn("flex flex-col gap-1", side === "RIGHT" && "items-end")}>
        <div
          className={cn("flex items-center gap-2", side === "RIGHT" && "flex-row-reverse")}
        >
          {isMe && (
            <span className="text-[11px] text-foreground bg-foreground/10 px-2 py-0.5 rounded-full border border-foreground/20">
              Вы
            </span>
          )}
          <span className="text-sm font-bold">{player?.display_name ?? "—"}</span>
        </div>
        {player && <RankBadge elo={player.elo} size="sm" />}
      </div>
    </div>
  );
}

export default function DraftScreen({
  leftPlayer,
  rightPlayer,
  draft,
  mySide,
  turnClock,
  onBan,
  onPick,
  onSurrender,
}: DraftScreenProps) {
  const { roster, byId, isLoading, error } = useCharacterRoster();
  const [query, setQuery] = useState("");

  const isMyTurn = draft.current_side === mySide;
  const oppSide: Side = mySide === "LEFT" ? "RIGHT" : "LEFT";

  const totalSteps =
    draft.sub_stage === "BAN"
      ? draft.bans_per_side * 2
      : draft.picks_per_side * 2;
  const completedSteps =
    draft.sub_stage === "BAN"
      ? draft.bans.LEFT.length + draft.bans.RIGHT.length
      : draft.picks.LEFT.length + draft.picks.RIGHT.length;
  const currentStep = Math.min(completedSteps + 1, totalSteps);

  const visibleRoster = useMemo(() => {
    if (!roster) return null;
    const q = query.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((c) => c.name.toLowerCase().includes(q));
  }, [roster, query]);

  const handleCardClick = (charId: string) => {
    if (!isMyTurn) return;
    if (draft.sub_stage === "BAN") onBan(charId);
    else onPick(charId);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/97 backdrop-blur-md animate-in fade-in-0 duration-500">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-border bg-card/40">
        <PlayerHeader
          player={leftPlayer}
          side="LEFT"
          mySide={mySide}
          isTurn={draft.current_side === "LEFT"}
        />

        <div className="flex flex-col items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {draft.sub_stage === "BAN" ? "Фаза бана" : "Фаза пика"}
          </span>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i + 1 < currentStep
                    ? "w-3 bg-foreground"
                    : i + 1 === currentStep
                    ? "w-6 bg-foreground"
                    : "w-3 bg-border",
                )}
              />
            ))}
          </div>
          <span
            className={cn(
              "text-sm font-bold",
              isMyTurn ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {isMyTurn ? "Ваш ход" : "Ход соперника"}
          </span>
          <TurnTimer
            clock={turnClock ?? null}
            mine={isMyTurn}
            timeoutHint={draft.sub_stage === "BAN" ? "Забаним случайного!" : "Выберем случайного!"}
          />
        </div>

        <PlayerHeader
          player={rightPlayer}
          side="RIGHT"
          mySide={mySide}
          isTurn={draft.current_side === "RIGHT"}
        />
      </div>

      {/* Search + roster grid share one centred max-w-7xl wrapper so their
          widths line up cleanly. */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto w-full max-w-7xl">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск персонажа по имени…"
            className="h-11 mb-5 bg-card/40 border-border"
          />

          {error && (
            <div className="text-center text-destructive text-sm">{error}</div>
          )}
          {isLoading && (
            <div className="text-center text-muted-foreground text-sm">
              Загрузка ростера…
            </div>
          )}
          {visibleRoster && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {visibleRoster.map((char) => {
                const state = getCardState(char.id, draft, mySide);
                return (
                  <CharacterCard
                    key={char.id}
                    char={char}
                    state={state}
                    isMyTurn={isMyTurn}
                    onClick={() => handleCardClick(char.id)}
                  />
                );
              })}
              {visibleRoster.length === 0 && roster && (
                <div className="col-span-full text-center text-sm text-muted-foreground py-12">
                  Никто не подходит под «{query}».
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: pick slots per side */}
      <div className="flex items-center justify-between px-8 py-5 border-t border-border bg-card/40">
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Ваша команда</span>
          <PickSlots
            picks={draft.picks[mySide]}
            expected={draft.picks_per_side}
            roster={byId}
            align="left"
          />
        </div>
        <div className="flex flex-col items-center gap-3">
        <SurrenderButton onConfirm={onSurrender} />
        {draft.bans_enabled && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground">Баны</span>
            <div className="flex gap-2">
              {[mySide, oppSide].flatMap((side) =>
                Array.from({ length: draft.bans_per_side }, (_, i) => {
                  const id = draft.bans[side][i];
                  return (
                    <div
                      key={`${side}-${i}`}
                      className="h-8 w-8 rounded-md border border-border/60 flex items-center justify-center text-xs text-muted-foreground"
                      title={id ? byId.get(id)?.name : "—"}
                    >
                      {id ? "×" : "·"}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        )}
        </div>
        <div className="flex flex-col gap-2 items-end">
          <span className="text-xs text-muted-foreground">Команда соперника</span>
          <PickSlots
            picks={draft.picks[oppSide]}
            expected={draft.picks_per_side}
            roster={byId}
            align="right"
          />
        </div>
      </div>
    </div>
  );
}
