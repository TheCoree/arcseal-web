"use client";

import React, { useState } from "react";

import ProtectedRoute from "@/app/components/ProtectedRoute";
import { useAuth } from "@/app/contexts/AuthContext";
import { useMatchSocket } from "@/app/hooks/useMatchSocket";
import { getRankInfo } from "@/app/components/RankBadge";

import ProfileHero from "@/app/components/dashboard/ProfileHero";
import RankProgress from "@/app/components/dashboard/RankProgress";
import StatsCard from "@/app/components/dashboard/StatsCard";
import PlayCard from "@/app/components/dashboard/PlayCard";
import EditProfileDialog from "@/app/components/dashboard/EditProfileDialog";
import SearchingOverlay from "@/app/components/dashboard/SearchingOverlay";

import DraftScreen from "@/app/components/game/DraftScreen";
import BattleScreen from "@/app/components/game/BattleScreen";
import ResultScreen from "@/app/components/game/ResultScreen";
import RankUpAnimation from "@/app/components/game/RankUpAnimation";

export default function Dashboard() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { user, updateProfile, refreshUser } = useAuth();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [rankUpFromElo, setRankUpFromElo] = useState<number | null>(null);
  // "Play again" chosen on the result screen: queue up once we're back in
  // the lobby (after the rank-up animation, if one plays).
  const [queueAfterResult, setQueueAfterResult] = useState(false);

  const match = useMatchSocket({
    userId: user?.id,
    onFinished: refreshUser,
  });

  // Intercept the "back to base" button so a rank-up celebration plays before
  // we tear down the result screen. We only intercept when the player actually
  // crossed a rank threshold upward — a loss that drops them a tier just
  // returns to lobby silently.
  const leaveResult = (playAgain: boolean) => {
    match.returnHome();
    if (playAgain) match.startSearch();
  };

  const handleReturnHome = (playAgain = false) => {
    const result = match.myResult;
    if (result && result.elo_change > 0) {
      const oldElo = result.new_elo - result.elo_change;
      const oldRank = getRankInfo(oldElo).title;
      const newRank = getRankInfo(result.new_elo).title;
      if (oldRank !== newRank) {
        setQueueAfterResult(playAgain);
        setRankUpFromElo(oldElo);
        return;
      }
    }
    leaveResult(playAgain);
  };

  const handleRankUpFinished = () => {
    setRankUpFromElo(null);
    leaveResult(queueAfterResult);
    setQueueAfterResult(false);
  };

  if (!user) return null;

  const isInGame = match.gameState !== "IDLE";

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 bg-background relative">
      {match.gameState === "DRAFT" && match.draft && match.mySide && (
        <DraftScreen
          leftPlayer={match.leftPlayer}
          rightPlayer={match.rightPlayer}
          draft={match.draft}
          mySide={match.mySide}
          turnClock={match.turnClock}
          onBan={match.banCharacter}
          onPick={match.pickCharacter}
          onSurrender={match.surrender}
        />
      )}

      {match.gameState === "BATTLE" && match.battle && match.mySide && (
        <BattleScreen
          leftPlayer={match.leftPlayer}
          rightPlayer={match.rightPlayer}
          battle={match.battle}
          mySide={match.mySide}
          turnClock={match.turnClock}
          battleLog={match.battleLog}
          eventBatch={match.eventBatch}
          opponentDisconnected={match.opponentDisconnected}
          procPulses={match.procPulses}
          opponentIntent={match.opponentIntent}
          telegraphs={match.telegraphs}
          onIntent={match.sendIntent}
          actions={{
            activate: match.activateUnit,
            move: match.moveActiveUnit,
            attack: match.attackTarget,
            useAbility: match.useAbility,
            endTurn: match.endTurn,
            surrender: match.surrender,
          }}
        />
      )}

      {match.gameState === "FINISHED" && (
        <ResultScreen
          me={match.mySide === "LEFT" ? match.leftPlayer : match.rightPlayer}
          opponent={match.mySide === "LEFT" ? match.rightPlayer : match.leftPlayer}
          mySide={match.mySide}
          myResult={match.myResult}
          opponentResult={match.opponentResult}
          finish={match.finishInfo}
          onReturnHome={() => handleReturnHome(false)}
          onPlayAgain={() => handleReturnHome(true)}
        />
      )}

      {rankUpFromElo != null && match.myResult && (
        <RankUpAnimation
          fromElo={rankUpFromElo}
          toElo={match.myResult.new_elo}
          onContinue={handleRankUpFinished}
        />
      )}

      {match.gameState === "SEARCHING" && (
        <SearchingOverlay user={user} searchTime={match.searchTime} onCancel={match.cancelSearch} />
      )}

      <div
        className="space-y-8 transition-all duration-700"
        style={{
          opacity: isInGame ? 0 : 1,
          transform: isInGame ? "scale(0.95)" : "scale(1)",
          pointerEvents: isInGame ? "none" : "auto",
          userSelect: isInGame ? "none" : "auto",
          visibility: isInGame ? "hidden" : "visible",
        }}
      >
        <ProfileHero user={user} onEdit={() => setIsEditOpen(true)} />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7 flex flex-col gap-6">
            <RankProgress elo={user.elo} />
            <StatsCard
              gamesPlayed={user.games_played ?? 0}
              wins={user.wins ?? 0}
              losses={user.losses ?? 0}
            />
          </div>
          <div className="lg:col-span-5 flex flex-col">
            <PlayCard onStartSearch={match.startSearch} disabled={!match.isConnected} />
          </div>
        </div>
      </div>

      <EditProfileDialog
        user={user}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSave={updateProfile}
      />
    </div>
  );
}
