"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import ProtectedRoute from "@/app/components/ProtectedRoute";
import { apiRequest } from "@/lib/api";
import { Trophy, ArrowLeft, Star, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { absolutizeAvatarUrl } from "@/lib/utils";
import { RankBadge } from "@/app/components/RankBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface LeaderboardUser {
  id: string;
  username: string;
  display_name: string;
  elo: number;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  rank: string;
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await apiRequest("/users/leaderboard?limit=50", { method: "GET" });
        if (res.ok) {
          const data = await res.json();
          setLeaderboard(data);
        } else {
          toast.error("Не удалось загрузить данные таблицы лидеров.");
        }
      } catch (err) {
        console.error("Failed to fetch leaderboard:", err);
        toast.error("Не удалось подключиться к серверу.");
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, []);

  const getRankTheme = (rankName: string) => {
    switch (rankName) {
      case "Bronze": return { rowBg: "bg-[#452c1e]/20 hover:bg-[#452c1e]/30 border-l-[6px] border-l-[#8a5b3e]", iconColor: "text-[#8a5b3e]" };
      case "Silver": return { rowBg: "bg-[#2e3742]/20 hover:bg-[#2e3742]/30 border-l-[6px] border-l-[#6b7c8f]", iconColor: "text-[#6b7c8f]" };
      case "Gold": return { rowBg: "bg-[#544000]/20 hover:bg-[#544000]/30 border-l-[6px] border-l-[#a8840c]", iconColor: "text-[#a8840c]" };
      case "Platinum": return { rowBg: "bg-[#1c4747]/20 hover:bg-[#1c4747]/30 border-l-[6px] border-l-[#3c9494]", iconColor: "text-[#3c9494]" };
      case "Diamond": return { rowBg: "bg-[#163a61]/20 hover:bg-[#163a61]/30 border-l-[6px] border-l-[#337bc4]", iconColor: "text-[#337bc4]" };
      case "Master": return { rowBg: "bg-[#3a1463]/20 hover:bg-[#3a1463]/30 border-l-[6px] border-l-[#823bc7]", iconColor: "text-[#823bc7]" };
      case "Elite": return { rowBg: "bg-[#7a1212]/20 hover:bg-[#7a1212]/30 border-l-[6px] border-l-[#e03131]", iconColor: "text-[#e03131]" };
      default: return { rowBg: "hover:bg-muted/40", iconColor: "text-muted-foreground" };
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8 bg-background">
        <div className="space-y-6">
          
          {/* Header section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Trophy className="h-6 w-6 text-foreground" />
                <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">Таблица лидеров</h1>
              </div>
              <p className="text-muted-foreground text-xs">Лучшие игроки в рейтинговой лиге Arcseal</p>
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

          <Card className="bg-card border-border">
            <CardContent className="p-0">
              {loading ? (
                /* Loading State */
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                  <p className="text-muted-foreground text-sm">Загрузка таблицы лидеров...</p>
                </div>
              ) : leaderboard.length === 0 ? (
                /* Empty State */
                <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                  <Star className="h-10 w-10 text-muted" />
                  <h3 className="text-base font-bold text-foreground">Нет активных игроков</h3>
                  <p className="text-muted-foreground text-xs max-w-xs">
                    Зарегистрируйтесь первым, чтобы занять верхнюю строчку рейтинга.
                  </p>
                </div>
              ) : (
                /* Table View */
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border hover:bg-transparent">
                      <TableHead className="w-16 text-center text-muted-foreground text-xs font-semibold">Место</TableHead>
                      <TableHead className="text-muted-foreground text-xs font-semibold">Игрок</TableHead>
                      <TableHead className="text-muted-foreground text-xs font-semibold">Рейтинг ELO</TableHead>
                      <TableHead className="text-muted-foreground text-xs font-semibold">Звание</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard.map((player, index) => {
                      const isCurrentUser = player.username === user?.username;
                      const place = index + 1;
                      const isTop3 = index <= 2;
                      const rankTheme = getRankTheme(player.rank);
                      
                      const rowClasses = isTop3 ? rankTheme.rowBg : "hover:bg-muted/40";
                      const iconClasses = isTop3 ? rankTheme.iconColor : "text-muted-foreground";
                      
                      const finalRowBg = isCurrentUser && !isTop3 
                        ? "bg-muted/80 border-l-[6px] border-l-primary hover:bg-muted" 
                        : rowClasses;
                      
                      return (
                        <TableRow
                          key={player.id}
                          onClick={() => router.push(`/users/${player.username}`)}
                          className={`border-b border-border cursor-pointer transition-all duration-200 ${finalRowBg}`}
                        >
                          {/* Rank column */}
                          <TableCell className="text-center font-mono font-bold text-sm">
                            {isTop3 ? (
                              <div className="flex items-center justify-center">
                                <Award className={`h-6 w-6 ${iconClasses}`} />
                              </div>
                            ) : (
                              <span className="text-muted-foreground">#{place}</span>
                            )}
                          </TableCell>

                          {/* Player Identity */}
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9 border border-border shadow-sm">
                                <AvatarImage src={absolutizeAvatarUrl(player.avatar_url) || ""} alt={player.display_name} />
                                <AvatarFallback className="bg-muted text-muted-foreground text-xs font-bold">
                                  {player.display_name.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col">
                                <span className={`text-sm flex items-center gap-1.5 ${
                                  isCurrentUser ? "text-foreground font-bold" : "text-foreground font-medium"
                                }`}>
                                  {player.display_name}
                                  {isCurrentUser && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.2 bg-foreground text-background rounded">
                                      Вы
                                    </span>
                                  )}
                                </span>
                                <span className="text-xs text-muted-foreground">@{player.username}</span>
                              </div>
                            </div>
                          </TableCell>

                          {/* Elo (High Contrast) */}
                          <TableCell className="font-mono font-semibold text-sm text-foreground italic text-xl">
                            {player.elo}
                          </TableCell>

                          {/* League Rank Chevron */}
                          <TableCell>
                            <RankBadge elo={player.elo} size="default" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
