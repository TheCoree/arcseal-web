"use client";

import React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface StatsCardProps {
  gamesPlayed: number;
  wins: number;
  losses: number;
}

interface StatCellProps {
  label: string;
  value: string | number;
}

function StatCell({ label, value }: StatCellProps) {
  return (
    <div className="rounded-lg bg-muted/40 border border-border p-3 text-center">
      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">{label}</span>
      <p className="text-xl font-bold font-mono text-foreground mt-1">{value}</p>
    </div>
  );
}

export default function StatsCard({ gamesPlayed, wins, losses }: StatsCardProps) {
  const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">Игровая статистика</CardTitle>
        <CardDescription className="text-muted-foreground text-xs">
          Информация о ваших сыгранных матчах и результатах
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCell label="Игр" value={gamesPlayed} />
        <StatCell label="Винрейт" value={`${winRate}%`} />
        <StatCell label="Победы" value={wins} />
        <StatCell label="Поражения" value={losses} />
      </CardContent>
    </Card>
  );
}
