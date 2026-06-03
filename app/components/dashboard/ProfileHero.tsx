"use client";

import React from "react";
import { Edit2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { RankBadge } from "@/app/components/RankBadge";
import { absolutizeAvatarUrl } from "@/lib/utils";
import type { User } from "@/app/contexts/AuthContext";

interface ProfileHeroProps {
  user: User;
  onEdit: () => void;
}

export default function ProfileHero({ user, onEdit }: ProfileHeroProps) {
  return (
    <Card className="bg-card border-border w-full flex flex-col">
      <CardContent className="pt-8 pb-8 flex-1">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start justify-between w-full">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 flex-1">
              <Avatar className="h-20 w-20 border border-border">
                <AvatarImage src={absolutizeAvatarUrl(user.avatar_url) || ""} alt={user.display_name} />
                <AvatarFallback className="bg-muted text-muted-foreground font-bold text-xl">
                  {user.display_name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-center sm:items-start mt-1">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                  <span className="text-2xl font-bold text-foreground leading-none">{user.display_name}</span>
                  <RankBadge elo={user.elo} size="default" />
                </div>
                <span className="text-sm font-mono text-muted-foreground mt-2">@{user.username}</span>
              </div>
            </div>

            <div className="flex flex-col items-center sm:items-end justify-center shrink-0 mt-4 sm:mt-0 sm:pr-4">
              <span className="text-5xl font-semibold font-mono tracking-tight text-foreground italic">
                {user.elo} <span className="text-3xl text-muted-foreground italic font-medium">ELO</span>
              </span>
            </div>
          </div>

          <div className="w-full text-sm leading-relaxed text-muted-foreground">
            {user.bio ? (
              <span className="text-foreground">{user.bio}</span>
            ) : (
              <span className="italic">
                Биография не заполнена. Вы можете добавить информацию о себе, нажав на кнопку редактирования.
              </span>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex justify-end border-t border-border bg-muted/5 pt-3 pb-3 pr-4">
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="h-8 px-3 text-muted-foreground hover:text-foreground cursor-pointer text-xs"
        >
          <Edit2 className="h-3 w-3 sm:mr-1.5" />
          <span className="hidden sm:inline">Редактировать профиль</span>
        </Button>
      </CardFooter>
    </Card>
  );
}
