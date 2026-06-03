import React from "react";

export interface RankInfo {
  title: string;
  gradient: string;
  fromColor: string;
  toColor: string;
}

export const getRankInfo = (eloScore: number): RankInfo => {
  if (eloScore < 600) {
    return {
      title: "Bronze",
      gradient: "bg-gradient-to-r from-[#2c1b10] to-[#452c1e] border-y border-x-4 border-y-[#7d5135] border-x-[#8a5b3e] text-[#f7e0d3] shadow-[0_0_15px_rgba(125,81,53,0.15)]",
      fromColor: "#a16207", // Bright Bronze
      toColor: "#ca8a04"
    };
  } else if (eloScore < 1000) {
    return {
      title: "Silver",
      gradient: "bg-gradient-to-r from-[#1b2026] to-[#2e3742] border-y border-x-4 border-y-[#556272] border-x-[#6b7c8f] text-[#f1f5f9] shadow-[0_0_15px_rgba(85,98,114,0.15)]",
      fromColor: "#94a3b8", // Bright Silver
      toColor: "#cbd5e1"
    };
  } else if (eloScore < 1400) {
    return {
      title: "Gold",
      gradient: "bg-gradient-to-r from-[#332500] to-[#544000] border-y border-x-4 border-y-[#917105] border-x-[#a8840c] text-[#fef3c7] shadow-[0_0_15px_rgba(145,113,5,0.15)]",
      fromColor: "#eab308", // Vibrant Gold
      toColor: "#fde047"
    };
  } else if (eloScore < 1800) {
    return {
      title: "Platinum",
      gradient: "bg-gradient-to-r from-[#0d2222] to-[#1c4747] border-y border-x-4 border-y-[#317979] border-x-[#3c9494] text-[#ccfbf1] shadow-[0_0_15px_rgba(49,121,121,0.15)]",
      fromColor: "#14b8a6", // Bright Cyan/Platinum
      toColor: "#5eead4"
    };
  } else if (eloScore < 2200) {
    return {
      title: "Diamond",
      gradient: "bg-gradient-to-r from-[#08182b] to-[#163a61] border-y border-x-4 border-y-[#2965a3] border-x-[#337bc4] text-[#e0f2fe] shadow-[0_0_15px_rgba(41,101,163,0.15)]",
      fromColor: "#3b82f6", // Bright Blue
      toColor: "#93c5fd"
    };
  } else if (eloScore < 2600) {
    return {
      title: "Master",
      gradient: "bg-gradient-to-r from-[#17062e] to-[#3a1463] border-y border-x-4 border-y-[#6b2aa8] border-x-[#823bc7] text-[#f3e8ff] shadow-[0_0_15px_rgba(107,42,168,0.2)]",
      fromColor: "#a855f7", // Bright Purple
      toColor: "#d8b4fe"
    };
  } else {
    // ELITE
    return {
      title: "Elite",
      gradient: "bg-gradient-to-r from-[#3d0a0a] to-[#7a1212] border-y border-x-4 border-y-[#c92a2a] border-x-[#e03131] text-[#ffe3e3] shadow-[0_0_15px_rgba(201,42,42,0.3)]",
      fromColor: "#ef4444", // Bright Red
      toColor: "#fca5a5"
    };
  }
};

export const getProgressDetails = (elo: number) => {
  let nextElo = 600;
  if (elo >= 600) nextElo = 1000;
  if (elo >= 1000) nextElo = 1400;
  if (elo >= 1400) nextElo = 1800;
  if (elo >= 1800) nextElo = 2200;
  if (elo >= 2200) nextElo = 2600;
  
  const isMax = elo >= 2600;
  if (isMax) nextElo = elo;
  
  let prevElo = 0;
  if (elo >= 600) prevElo = 600;
  if (elo >= 1000) prevElo = 1000;
  if (elo >= 1400) prevElo = 1400;
  if (elo >= 1800) prevElo = 1800;
  if (elo >= 2200) prevElo = 2200;
  if (isMax) prevElo = 2600;
  
  const range = isMax ? 1 : nextElo - prevElo;
  const currentProgress = elo - prevElo;
  const percent = isMax ? 100 : Math.min(100, Math.max(0, (currentProgress / range) * 100));
  
  const currentRankInfo = getRankInfo(elo);
  const nextRankInfo = getRankInfo(nextElo);
  
  return {
    currentRankInfo,
    nextRankInfo,
    percent,
    eloNeeded: nextElo - elo,
    isMax,
    nextElo,
    prevElo,
    range,
    currentProgress
  };
};

export interface RankBadgeProps {
  elo: number;
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function RankBadge({ elo, size = "default", className = "" }: RankBadgeProps) {
  const rankInfo = getRankInfo(elo);

  let sizeClasses = "px-4 py-1 text-xs";
  if (size === "sm") {
    sizeClasses = "px-3 py-0.5 text-[10px]";
  } else if (size === "lg") {
    sizeClasses = "px-6 py-2.5 text-base w-full sm:w-44";
  }

  return (
    <div
      className={`select-none skew-x-[-12deg] rounded-none text-center inline-block transition-all duration-200 ${rankInfo.gradient} ${sizeClasses} ${className}`}
    >
      <span className="skew-x-[12deg] inline-block font-black uppercase tracking-wider italic">
        {rankInfo.title}
      </span>
    </div>
  );
}
