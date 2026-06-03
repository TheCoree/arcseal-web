"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Heart, Shield, Sparkles, Users, Zap } from "lucide-react";

import ProtectedRoute from "@/app/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { useCharacterRoster } from "@/app/hooks/useCharacterRoster";
import { absolutizeMediaUrl } from "@/lib/utils";
import type { CharacterDef } from "@/app/components/game/types";
import {
  CharacterDetail,
  ROLE_LABEL_RU,
  charInitial,
} from "@/app/components/game/CharacterDetail";

// ── Roster grid card ─────────────────────────────────────────────────────
function RosterCard({ char, onClick }: { char: CharacterDef; onClick: () => void }) {
  const portrait = absolutizeMediaUrl(char.portrait_url ?? null);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative text-left border border-border bg-card/60 overflow-hidden hover:border-amber-600/60 transition-colors"
    >
      <div className="relative aspect-[3/4] bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 overflow-hidden">
        {portrait ? (
          <img
            src={portrait}
            alt={char.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl font-black text-white/10 select-none">
              {charInitial(char.name)}
            </span>
          </div>
        )}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1">
          <span className="px-2 py-0.5 rounded-full bg-black/60 border border-white/10 text-[10px] text-zinc-200">
            {ROLE_LABEL_RU[char.role] ?? char.role}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-black/60 border border-white/10 text-[10px] text-zinc-200">
            {char.initial_position_type === "FRONTLINE" ? "Фронт" : "Тыл"}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <h3 className="text-base font-bold text-white leading-tight">{char.name}</h3>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-300">
            <span className="inline-flex items-center gap-0.5"><Heart className="h-3 w-3 text-green-500" />{char.base_stats.hp}</span>
            <span className="inline-flex items-center gap-0.5"><Zap className="h-3 w-3 text-sky-400" />{char.base_stats.max_energy}</span>
            <span className="inline-flex items-center gap-0.5"><Shield className="h-3 w-3 text-zinc-400" />{char.base_stats.defense}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function CharactersPage() {
  const router = useRouter();
  const { roster, error, isLoading } = useCharacterRoster();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = roster?.find((c) => c.id === selectedId) ?? null;

  return (
    <ProtectedRoute>
      <div className="flex-1 w-full max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8 bg-background">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Users className="h-6 w-6 text-foreground" />
              <h1 className="text-2xl font-bold tracking-tight">Персонажи</h1>
            </div>
            <p className="text-muted-foreground text-xs">
              Нажмите на героя, чтобы увидеть полное описание способностей.
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => router.push("/")}
            className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад в лобби
          </Button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-muted-foreground text-sm">Загрузка персонажей…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Sparkles className="h-10 w-10 text-muted" />
            <p className="text-muted-foreground text-sm">{error}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {(roster ?? []).map((char) => (
              <RosterCard key={char.id} char={char} onClick={() => setSelectedId(char.id)} />
            ))}
          </div>
        )}
      </div>

      {selected && <CharacterDetail char={selected} onClose={() => setSelectedId(null)} />}
    </ProtectedRoute>
  );
}
