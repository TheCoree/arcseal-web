"use client";

import React, { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/app/components/ProtectedRoute";
import { apiRequest } from "@/lib/api";
import { ArrowLeft, Calendar, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { absolutizeAvatarUrl } from "@/lib/utils";
import { RankBadge } from "@/app/components/RankBadge";
import { toast } from "sonner";

interface PublicUser {
  id: string;
  username: string;
  display_name: string;
  elo: number;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export default function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await apiRequest(`/users/${username}`, { method: "GET" });
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        } else if (res.status === 404) {
          toast.error("Пользователь не найден.");
          router.push("/");
        } else {
          toast.error("Не удалось загрузить профиль пользователя.");
        }
      } catch (err) {
        console.error("Failed to fetch public profile:", err);
        toast.error("Не удалось подключиться к серверу.");
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [username, router]);

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex-1 w-full flex items-center justify-center bg-background">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!profile) return null;

  return (
    <ProtectedRoute>
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8 bg-background">
        <div className="space-y-6">
          {/* Back button */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </Button>
            <span className="text-xs text-muted-foreground tracking-wider font-semibold">Защищенный профиль игрока</span>
          </div>

          <Card className="bg-card border-border w-full flex flex-col">
            <CardContent className="pt-8 pb-8 flex-1">
              <div className="flex flex-col gap-8">
                
                {/* Top Row: Identity & ELO */}
                <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start justify-between w-full">
                  
                  {/* Avatar and Identity */}
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 flex-1">
                    <Avatar className="h-20 w-20 border border-border">
                      <AvatarImage src={absolutizeAvatarUrl(profile.avatar_url) || ""} alt={profile.display_name} />
                      <AvatarFallback className="bg-muted text-muted-foreground font-bold text-xl">
                        {profile.display_name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-center sm:items-start mt-1">
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                        <span className="text-2xl font-bold text-foreground leading-none">{profile.display_name}</span>
                        <RankBadge elo={profile.elo} size="default" />
                      </div>
                      <span className="text-sm font-mono text-muted-foreground mt-2">@{profile.username}</span>
                    </div>
                  </div>

                  {/* ELO Display */}
                  <div className="flex flex-col items-center sm:items-end justify-center shrink-0 mt-4 sm:mt-0 sm:pr-4">
                    <span className="text-5xl font-semibold font-mono tracking-tight text-foreground italic">
                      {profile.elo} <span className="text-3xl text-muted-foreground italic font-medium">ELO</span>
                    </span>
                  </div>

                </div>

                {/* Biography Section (Clean text format, no borders) */}
                <div className="w-full text-sm leading-relaxed text-muted-foreground">
                  {profile.bio ? (
                    <span className="text-foreground">{profile.bio}</span>
                  ) : (
                    <span className="italic">
                      Биография не заполнена.
                    </span>
                  )}
                </div>

              </div>
            </CardContent>
            
            <CardFooter className="flex-col sm:flex-row justify-between items-center border-t border-border bg-muted/5 pt-3 pb-3 px-6 text-xs text-muted-foreground gap-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <span>Регистрация: <span className="font-mono text-foreground font-medium">{new Date(profile.created_at).toLocaleDateString()}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Star className="h-4 w-4" />
                <span>Активность: <span className="font-mono text-foreground font-medium">{new Date(profile.updated_at).toLocaleDateString()}</span></span>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
