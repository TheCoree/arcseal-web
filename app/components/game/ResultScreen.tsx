"use client";

import React, { useEffect, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RankBadge, getProgressDetails } from "@/app/components/RankBadge";
import { absolutizeAvatarUrl } from "@/lib/utils";
import type { PlayerInfo, ResultData } from "@/app/components/game/types";

interface ResultScreenProps {
  me: PlayerInfo | null;
  opponent: PlayerInfo | null;
  myResult: ResultData | null;
  opponentResult: ResultData | null;
  onReturnHome: () => void;
}

function PlayerScoreCard({
  player,
  score,
  highlight,
}: {
  player: PlayerInfo | null;
  score: number;
  highlight: "win" | "lose" | "draw" | "neutral";
}) {
  const ring =
    highlight === "win"
      ? "ring-2 ring-green-500/70"
      : highlight === "lose"
      ? "ring-2 ring-destructive/60"
      : highlight === "draw"
      ? "ring-2 ring-yellow-500/60"
      : "ring-1 ring-border";

  return (
    <div className="flex-1 flex flex-col items-center gap-3">
      <div className={`relative rounded-full ${ring} p-1 transition-all duration-500`}>
        <Avatar className="h-20 w-20 border-2 border-background">
          <AvatarImage src={absolutizeAvatarUrl(player?.avatar_url) || ""} />
          <AvatarFallback className="text-2xl font-bold bg-muted">
            {player?.display_name?.slice(0, 2).toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-bold text-foreground leading-none">{player?.display_name ?? "???"}</p>
        {player && <RankBadge elo={player.elo} size="sm" />}
      </div>
      <div className="bg-muted/40 border border-border rounded-2xl px-6 py-2 text-center">
        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest block">Счёт</span>
        <span className="text-3xl font-black font-mono tabular-nums text-foreground">{score}</span>
      </div>
    </div>
  );
}

export default function ResultScreen({ me, opponent, myResult, opponentResult, onReturnHome }: ResultScreenProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  if (!myResult || !opponentResult) return null;

  const isDraw = myResult.is_draw ?? myResult.score === opponentResult.score;
  const isWin = !isDraw && myResult.is_winner;

  const title = isDraw ? "НИЧЬЯ" : isWin ? "ПОБЕДА" : "ПОРАЖЕНИЕ";
  const titleColor = isDraw ? "text-yellow-500" : isWin ? "text-green-500" : "text-destructive";

  const eloSign = myResult.elo_change >= 0 ? "+" : "";
  const eloColor =
    myResult.elo_change > 0
      ? "text-green-500"
      : myResult.elo_change < 0
      ? "text-destructive"
      : "text-muted-foreground";

  const pInfo = getProgressDetails(myResult.new_elo);
  const oldElo = myResult.new_elo - myResult.elo_change;
  const oldPercent = Math.max(0, Math.min(100, ((oldElo - pInfo.prevElo) / pInfo.range) * 100));
  const newPercent = Math.max(0, Math.min(100, ((myResult.new_elo - pInfo.prevElo) / pInfo.range) * 100));
  const baseWidth = Math.min(oldPercent, newPercent);
  const deltaWidth = Math.abs(newPercent - oldPercent);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-md animate-in fade-in-0 duration-500">
      <div
        className="w-full px-8 py-5 border-b border-border bg-card/60 text-center"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(-12px)",
          transition: "opacity 0.5s ease, transform 0.5s ease",
        }}
      >
        <p className="text-[10px] font-bold text-muted-foreground tracking-[0.25em] uppercase">Матч окончен</p>
        <h1 className={`text-4xl sm:text-5xl font-black tracking-widest uppercase mt-1 ${titleColor}`}>{title}</h1>
      </div>

      <div className="flex-1 flex items-center justify-center w-full max-w-3xl mx-auto px-8 py-10">
        <div
          className="w-full flex flex-col gap-10"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.6s ease 0.1s, transform 0.6s ease 0.1s",
          }}
        >
          <div className="flex items-stretch gap-6">
            <PlayerScoreCard
              player={me}
              score={myResult.score}
              highlight={isDraw ? "draw" : isWin ? "win" : "lose"}
            />
            <div className="flex flex-col items-center justify-center gap-2 shrink-0">
              <span className="text-[10px] font-black text-muted-foreground tracking-[0.25em]">VS</span>
              <div className="h-24 w-px bg-border" />
            </div>
            <PlayerScoreCard
              player={opponent}
              score={opponentResult.score}
              highlight={isDraw ? "draw" : isWin ? "lose" : "win"}
            />
          </div>

          <div className="bg-muted/20 border border-border rounded-2xl p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Рейтинг ELO</h3>
              <div className="flex items-baseline gap-3">
                <span className="text-xl font-mono text-muted-foreground line-through opacity-60">{oldElo}</span>
                <span className={`text-2xl sm:text-3xl font-black font-mono ${eloColor}`}>
                  {eloSign}
                  {myResult.elo_change}
                </span>
                <span className="text-3xl sm:text-4xl font-mono text-foreground ml-1">{myResult.new_elo}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <RankBadge elo={myResult.new_elo} size="sm" />

                <div className="flex-1 h-4 bg-muted/40 rounded-full overflow-hidden border border-border/50 relative shadow-inner flex">
                  <div
                    className="h-full transition-all duration-1000 ease-out"
                    style={{
                      width: `${baseWidth}%`,
                      background: pInfo.isMax
                        ? pInfo.currentRankInfo.fromColor
                        : `linear-gradient(90deg, ${pInfo.currentRankInfo.fromColor} 0%, ${pInfo.nextRankInfo.toColor} 100%)`,
                    }}
                  />
                  {deltaWidth > 0 && (
                    <div
                      className={`h-full transition-all duration-1000 ease-out animate-pulse ${
                        myResult.elo_change > 0 ? "bg-green-500" : "bg-destructive"
                      }`}
                      style={{ width: `${deltaWidth}%` }}
                    />
                  )}
                </div>

                {!pInfo.isMax && <RankBadge elo={pInfo.nextElo} size="sm" />}
              </div>

              <div className="flex justify-between items-center text-[11px] text-muted-foreground px-1">
                <span>{pInfo.currentRankInfo.title}</span>
                {!pInfo.isMax && <span>{Math.round(newPercent)}% Пройдено</span>}
                {!pInfo.isMax && <span>{pInfo.nextRankInfo.title}</span>}
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <Button onClick={onReturnHome} size="lg" className="h-12 w-64 text-base font-bold">
              Вернуться на базу
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
