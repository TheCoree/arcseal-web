"use client";

import React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RankBadge, getProgressDetails } from "@/app/components/RankBadge";

interface RankProgressProps {
  elo: number;
}

export default function RankProgress({ elo }: RankProgressProps) {
  const info = getProgressDetails(elo);

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">Прогресс звания</CardTitle>
        <CardDescription className="text-muted-foreground text-xs">
          {info.isMax
            ? "Вы достигли максимально доступного звания в игре."
            : `Осталось ${info.eloNeeded} ELO до звания ${info.nextRankInfo.title}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <RankBadge elo={elo} size="sm" />
            <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden border border-border/50 relative shadow-inner">
              <div
                className="h-full absolute left-0 top-0 transition-all duration-1000 ease-out"
                style={{
                  width: `${info.percent}%`,
                  background: info.isMax
                    ? info.currentRankInfo.fromColor
                    : `linear-gradient(90deg, ${info.currentRankInfo.fromColor} 0%, ${info.nextRankInfo.toColor} 100%)`,
                }}
              />
            </div>
            {!info.isMax && <RankBadge elo={info.nextElo} size="sm" />}
          </div>
          <div className="flex justify-between items-center text-[12px] text-muted-foreground px-2">
            <span>Текущий ранг</span>
            {!info.isMax && <span>{Math.round(info.percent)}% Пройдено</span>}
            {!info.isMax && <span>Следующий ранг</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
