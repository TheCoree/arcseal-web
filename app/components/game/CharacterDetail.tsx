"use client";

import React, { useEffect, useRef } from "react";

import { absolutizeMediaUrl, cn } from "@/lib/utils";
import type { AbilityDef, CharacterDef } from "@/app/components/game/types";

export const ROLE_LABEL_RU: Record<string, string> = {
  TANK: "Танк",
  DPS: "ДПС",
  SUPPORT: "Поддержка",
  ASSASSIN: "Ассасин",
  BRUISER: "Бугай",
};

export function charInitial(name: string): string {
  return (name?.trim() ?? "?").slice(0, 1).toUpperCase();
}

function abilityTag(a: AbilityDef): { label: string; cls: string } {
  if (a.is_ult) return { label: "Ульта", cls: "border-fuchsia-500/50 text-fuchsia-300" };
  if (a.is_quick) return { label: "Быстрая", cls: "border-sky-500/50 text-sky-300" };
  return { label: "Способность", cls: "border-amber-600/50 text-amber-200" };
}

type ChainStep = NonNullable<AbilityDef["execution_chain"]>[number];

// First damage type found in a chain (recursing into CONDITIONAL branches),
// or null if the ability deals no direct damage.
function findDamageType(chain: ChainStep[] | undefined): "PHYSICAL" | "MAGICAL" | null {
  for (const step of chain ?? []) {
    if (step.type === "DAMAGE") return step.damage_type ?? "PHYSICAL";
    const t = findDamageType(step.if_true) ?? findDamageType(step.if_false);
    if (t) return t;
  }
  return null;
}

function StatPill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-2 py-1 text-center border border-border bg-zinc-900/50">
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      <p className="text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}

// Battle-style kit card: banner photo on top, title bar, stat strip, description.
// When `highlighted`, it gets a glowing ring and scrolls itself into view.
function KitCard({
  iconUrl,
  name,
  tag,
  tagCls,
  borderCls,
  stats,
  description,
  damageType,
  highlighted,
}: {
  iconUrl?: string | null;
  name: string;
  tag: string;
  tagCls: string;
  borderCls: string;
  stats: { label: string; value: React.ReactNode }[];
  description?: string | null;
  damageType?: "PHYSICAL" | "MAGICAL" | null;
  highlighted?: boolean;
}) {
  const icon = absolutizeMediaUrl(iconUrl ?? null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  return (
    <article
      ref={ref}
      className={cn(
        "border bg-zinc-900/60 overflow-hidden flex flex-col transition-shadow",
        borderCls,
        highlighted &&
          "ring-2 ring-amber-400/80 shadow-[0_0_24px_rgba(251,191,36,0.35)] border-amber-400/60",
      )}
    >
      {/* Photo banner */}
      <div className="relative aspect-[16/10] w-full bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 overflow-hidden border-b border-zinc-800">
        {icon ? (
          <img src={icon} alt={name} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl font-black text-white/10 select-none">{charInitial(name)}</span>
          </div>
        )}
      </div>

      {/* Title */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-zinc-800 bg-zinc-900/80">
        <span className="text-sm font-bold text-zinc-100 truncate">{name}</span>
        <div className="flex items-center gap-1 shrink-0">
          {damageType && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded border",
                damageType === "MAGICAL"
                  ? "border-violet-500/50 text-violet-300"
                  : "border-orange-500/50 text-orange-300",
              )}
            >
              {damageType === "MAGICAL" ? "Маг. урон" : "Физ. урон"}
            </span>
          )}
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", tagCls)}>{tag}</span>
        </div>
      </div>

      {/* Stat strip */}
      {stats.length > 0 && (
        <div
          className="grid text-[11px] border-b border-zinc-800"
          style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
        >
          {stats.map((st, i) => (
            <div key={i} className={cn("px-2 py-1 text-center", i > 0 && "border-l border-zinc-800")}>
              <p className="text-amber-600/80 leading-tight">{st.label}</p>
              <p className="font-bold tabular-nums text-zinc-100">{st.value}</p>
            </div>
          ))}
        </div>
      )}

      {description && (
        <p className="px-3 py-2 text-xs text-zinc-300 leading-snug">{description}</p>
      )}
    </article>
  );
}

// Full-screen character codex modal: portrait + stats header, then the kit laid
// out as battle-style cards. Pass `highlightId` to glow + scroll a specific
// entry into view ("attack", an ability id, or a passive id).
export function CharacterDetail({
  char,
  onClose,
  highlightId,
}: {
  char: CharacterDef;
  onClose: () => void;
  highlightId?: string;
}) {
  const portrait = absolutizeMediaUrl(char.portrait_url ?? null);
  const s = char.base_stats;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-zinc-950 border border-amber-900/40 shadow-2xl [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex gap-4 p-4 border-b border-border bg-zinc-900/60">
          <div className="relative w-24 h-32 shrink-0 bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 overflow-hidden">
            {portrait ? (
              <img src={portrait} alt={char.name} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-4xl font-black text-white/10">{charInitial(char.name)}</span>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold leading-tight">{char.name}</h2>
            <p className="text-xs text-amber-600/80 mt-0.5">
              {ROLE_LABEL_RU[char.role] ?? char.role}
              {" · "}
              {char.initial_position_type === "FRONTLINE" ? "Фронтлайн" : "Бэклайн"}
            </p>
            <div className="grid grid-cols-3 gap-1 mt-3">
              <StatPill label="HP" value={s.hp} />
              <StatPill label="EN" value={s.max_energy} />
              <StatPill label="DEF" value={s.defense} />
              <StatPill label="EN/раунд" value={`+${s.energy_regen}`} />
              <StatPill label="Реген" value={`+${s.regeneration}`} />
              <StatPill label="Скорость" value={s.movement_range} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute top-2 right-2 h-8 w-8 flex items-center justify-center text-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-400"
          >
            ×
          </button>
        </div>

        {/* Body — kit laid out as battle-style cards. */}
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <KitCard
            iconUrl={char.attack.icon_url}
            name={char.attack.name}
            tag="Атака"
            tagCls="border-zinc-600/60 text-zinc-300"
            borderCls="border-zinc-700/70"
            damageType={char.attack.damage_type ?? "PHYSICAL"}
            highlighted={highlightId === "attack"}
            stats={[
              { label: "Урон", value: String(char.attack.damage_schema.value) },
              { label: "Радиус", value: char.attack.range },
            ]}
            description={char.attack.description}
          />

          {char.abilities.map((a) => {
            const tag = abilityTag(a);
            return (
              <KitCard
                key={a.id}
                iconUrl={a.icon_url}
                name={a.name}
                tag={tag.label}
                tagCls={tag.cls}
                borderCls={a.is_ult ? "border-fuchsia-600/40" : "border-amber-600/30"}
                damageType={findDamageType(a.execution_chain)}
                highlighted={highlightId === a.id}
                stats={[
                  { label: "Энергия", value: a.energy_cost },
                  { label: "КД", value: a.cooldown === 0 ? "—" : `${a.cooldown}р.` },
                  ...(a.range != null ? [{ label: "Радиус", value: a.range }] : []),
                ]}
                description={a.description}
              />
            );
          })}

          {char.passives.map((p) => (
            <KitCard
              key={p.id}
              iconUrl={p.icon_url}
              name={p.name}
              tag="Пассивка"
              tagCls="border-zinc-600/60 text-zinc-300"
              borderCls="border-zinc-700/60"
              highlighted={highlightId === p.id}
              stats={[]}
              description={p.description}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
