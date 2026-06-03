"use client";

import React from "react";
import { Play, Swords } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PlayCardProps {
  onStartSearch: () => void;
  disabled?: boolean;
}

export default function PlayCard({ onStartSearch, disabled = false }: PlayCardProps) {
  return (
    <Card className="bg-card border-border flex-1 flex flex-col justify-between">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-foreground" />
          <CardTitle className="text-sm font-semibold text-foreground">Поиск игры</CardTitle>
        </div>
        <CardDescription className="text-muted-foreground text-xs">
          Подбирайте соперников и соревнуйтесь в рейтинге
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-center space-y-4">
        <div className="space-y-3">
          <Label className="text-xs font-semibold text-muted-foreground">Режим игры</Label>
          <Tabs defaultValue="ranked" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="ranked">Рейтинг</TabsTrigger>
              <TabsTrigger value="casual" disabled>
                Обычный
              </TabsTrigger>
              <TabsTrigger value="ai" disabled>
                Против ИИ
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="mt-4 p-4 rounded-xl border border-border bg-muted/20">
            <p className="text-sm font-bold text-foreground">Рейтинговый матч</p>
            <p className="text-xs text-muted-foreground mt-1">
              Официальные матчи с начислением и потерей ELO рейтинга.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 opacity-50">
            <div className="p-3 rounded-lg border border-border bg-muted/10 text-xs">
              <div className="font-semibold text-foreground">Обычный матч</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">В разработке</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/10 text-xs">
              <div className="font-semibold text-foreground">Против ИИ</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">В разработке</div>
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="border-t border-border bg-muted/20">
        <Button
          onClick={onStartSearch}
          disabled={disabled}
          className="w-full flex items-center justify-center gap-2 h-12 text-base font-semibold cursor-pointer"
        >
          <Play className="h-4 w-4 fill-current" />
          {disabled ? "Подключение..." : "Начать поиск"}
        </Button>
      </CardFooter>
    </Card>
  );
}
