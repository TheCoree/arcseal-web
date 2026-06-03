"use client";

import React from "react";
import { Swords, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RankBadge } from "@/app/components/RankBadge";
import { absolutizeAvatarUrl } from "@/lib/utils";
import type { User } from "@/app/contexts/AuthContext";

interface SearchingOverlayProps {
  user: User;
  searchTime: number;
  onCancel: () => void;
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function SearchingOverlay({ user, searchTime, onCancel }: SearchingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-lg animate-in fade-in-0 duration-500">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="absolute h-[600px] w-[600px] rounded-full border border-primary/5 animate-[ping_3s_ease-out_infinite]" />
        <div className="absolute h-[450px] w-[450px] rounded-full border border-primary/8 animate-[ping_3s_ease-out_0.5s_infinite]" />
        <div className="absolute h-[300px] w-[300px] rounded-full border border-primary/10 animate-[ping_3s_ease-out_1s_infinite]" />
      </div>

      <div className="relative flex flex-col items-center text-center space-y-8 max-w-sm px-6">
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="absolute -inset-1 rounded-full bg-primary/20 animate-pulse" />
              <Avatar className="h-16 w-16 border-2 border-primary relative">
                <AvatarImage src={absolutizeAvatarUrl(user.avatar_url) || ""} />
                <AvatarFallback className="bg-muted text-foreground font-bold">
                  {user.display_name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <span className="text-xs font-semibold text-foreground">{user.display_name}</span>
            <RankBadge elo={user.elo} size="sm" />
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-full bg-muted border border-border flex items-center justify-center">
              <Swords className="h-5 w-5 text-muted-foreground" />
            </div>
            <span className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">VS</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-2 border-dashed border-muted-foreground/30 bg-muted/20 flex items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">Поиск...</span>
            <div className="h-5" />
          </div>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">Поиск соперника</h3>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span>Рейтинговый матч</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="font-mono">{formatTime(searchTime)}</span>
          </div>
        </div>

        <div className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Ваш рейтинг</span>
          <span className="font-mono font-semibold text-foreground">{user.elo} ELO</span>
        </div>

        <Button
          onClick={onCancel}
          variant="destructive"
          className="w-full flex items-center justify-center gap-2 h-11 text-sm font-semibold cursor-pointer"
        >
          <X className="h-4 w-4" />
          Отменить поиск
        </Button>
      </div>
    </div>
  );
}
