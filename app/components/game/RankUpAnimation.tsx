"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { RankBadge, getRankInfo } from "@/app/components/RankBadge";

interface RankUpAnimationProps {
  fromElo: number;
  toElo: number;
  onContinue: () => void;
}

// Numeric stages let us write `stage >= N` checks cleanly.
//   0 intro    — letterbox bars slide in, vignette fades up
//   1 gather   — horizontal energy band grows, particles converge inward
//   2 flash    — quick white bang (covers the badge appearance)
//   3 reveal   — badge + corner brackets + expanding ring
//   4 title    — big rank name + from→to indicator
//   5 done     — continue button enabled
const STAGE_TIMINGS = [0, 500, 1500, 1700, 2300, 3100];

export default function RankUpAnimation({ fromElo, toElo, onContinue }: RankUpAnimationProps) {
  const fromRank = getRankInfo(fromElo);
  const toRank = getRankInfo(toElo);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = STAGE_TIMINGS.slice(1).map((ms, i) =>
      setTimeout(() => setStage(i + 1), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // Light particles that fly INWARD from off-screen edges toward the centre.
  // Inward motion reads as "energy being gathered" — much more cinematic
  // than the usual outward "happy birthday" burst.
  const inflowParticles = useMemo(
    () =>
      Array.from({ length: 32 }, (_, i) => {
        const angle = (i / 32) * 360 + (Math.random() * 10 - 5);
        const dist = 380 + Math.random() * 280;
        const rad = (angle * Math.PI) / 180;
        return {
          startX: Math.cos(rad) * dist,
          startY: Math.sin(rad) * dist,
          delay: Math.random() * 0.55,
          duration: 0.85 + Math.random() * 0.45,
          size: 1.5 + Math.random() * 2.5,
        };
      }),
    [],
  );

  return (
    <div
      className="fixed inset-0 z-[110] overflow-hidden flex items-center justify-center"
      style={{ background: "#000" }}
    >
      {/* Vignette — anchors the eye in the middle */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 25%, #000 90%)",
        }}
      />

      {/* Subtle radial wash in the new rank's colour */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-700"
        style={{
          background: `radial-gradient(ellipse at center, ${toRank.fromColor}22 0%, transparent 55%)`,
          opacity: stage >= 1 ? 1 : 0,
        }}
      />

      {/* Cinematic letterbox bars */}
      <div
        className="absolute top-0 left-0 right-0 bg-black z-20 pointer-events-none"
        style={{
          height: "9vh",
          transform: stage >= 0 ? "translateY(0)" : "translateY(-100%)",
          transition: "transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 bg-black z-20 pointer-events-none"
        style={{
          height: "9vh",
          transform: stage >= 0 ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />

      {/* Horizontal energy band growing across the centre line */}
      <div
        className="absolute left-0 right-0 top-1/2 pointer-events-none overflow-hidden"
        style={{
          height: stage === 1 ? 64 : stage >= 3 ? 0 : 1,
          transform: "translateY(-50%)",
          transition: "height 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
          opacity: stage >= 4 ? 0 : 1,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${toRank.fromColor} 30%, ${toRank.toColor} 50%, ${toRank.fromColor} 70%, transparent 100%)`,
            boxShadow: `0 0 80px ${toRank.fromColor}, 0 0 140px ${toRank.toColor}`,
          }}
        />
        {/* Light scanline sweeping across the band */}
        <div
          className="absolute inset-y-0 w-1/2"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
            animation:
              stage === 1 ? "rankup-scanline 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards" : undefined,
            opacity: stage === 1 ? 1 : 0,
          }}
        />
      </div>

      {/* Vertical pillar — only during gather */}
      <div
        className="absolute top-0 bottom-0 left-1/2 w-px pointer-events-none"
        style={{
          background: `linear-gradient(180deg, transparent, ${toRank.toColor}, transparent)`,
          boxShadow: `0 0 24px ${toRank.fromColor}, 0 0 48px ${toRank.toColor}`,
          transform: "translateX(-50%)",
          opacity: stage === 1 ? 0.9 : 0,
          transition: "opacity 0.5s ease",
        }}
      />

      {/* Particles streaming inward */}
      {stage === 1 &&
        inflowParticles.map((p, i) => (
          <div
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={
              {
                left: "50%",
                top: "50%",
                width: p.size,
                height: p.size,
                background: "#fff",
                boxShadow: `0 0 ${p.size * 5}px ${toRank.toColor}, 0 0 ${p.size * 10}px ${toRank.fromColor}`,
                animation: `rankup-converge ${p.duration}s cubic-bezier(0.5, 0, 0.75, 0) ${p.delay}s forwards`,
                "--start-x": `${p.startX}px`,
                "--start-y": `${p.startY}px`,
              } as React.CSSProperties
            }
          />
        ))}

      {/* White flash — short and crisp, hides the badge swap */}
      <div
        className="absolute inset-0 pointer-events-none bg-white z-30"
        style={{
          opacity: stage === 2 ? 0.92 : 0,
          transition: stage === 2 ? "opacity 0.08s linear" : "opacity 0.45s ease-out",
        }}
      />

      {/* From → To indicator — sits just below the top letterbox bar, inside
          the cinematic safe area. The text span eats its own trailing
          letter-spacing so the three flex children stay visually centred. */}
      <div
        className="absolute left-0 right-0 z-30 flex justify-center pointer-events-none"
        style={{
          top: "11vh",
          opacity: stage >= 3 ? 1 : 0,
          transform: stage >= 3 ? "translateY(0)" : "translateY(-12px)",
          transition: "opacity 0.6s ease 0.05s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.05s",
          color: toRank.toColor,
        }}
      >
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.4em]">
          <span className="h-px w-8" style={{ background: `${toRank.toColor}88` }} />
          <span style={{ marginRight: "-0.4em" }}>Rank Promoted</span>
          <span className="h-px w-8" style={{ background: `${toRank.toColor}88` }} />
        </div>
      </div>

      {/* Centre stack */}
      <div className="relative z-10 flex flex-col items-center gap-6 text-center px-6">
        {/* Hero badge framed by 4 corner brackets */}
        <div className="relative">
          {(["tl", "tr", "bl", "br"] as const).map((corner) => {
            const isTop = corner.startsWith("t");
            const isLeft = corner.endsWith("l");
            return (
              <div
                key={corner}
                className="absolute pointer-events-none"
                style={{
                  width: 28,
                  height: 28,
                  [isTop ? "top" : "bottom"]: -22,
                  [isLeft ? "left" : "right"]: -22,
                  borderTop: isTop ? `2px solid ${toRank.toColor}` : undefined,
                  borderBottom: !isTop ? `2px solid ${toRank.toColor}` : undefined,
                  borderLeft: isLeft ? `2px solid ${toRank.toColor}` : undefined,
                  borderRight: !isLeft ? `2px solid ${toRank.toColor}` : undefined,
                  opacity: stage >= 3 ? 1 : 0,
                  transform:
                    stage >= 3
                      ? "translate(0, 0)"
                      : `translate(${isLeft ? "16px" : "-16px"}, ${isTop ? "16px" : "-16px"})`,
                  transition:
                    "opacity 0.5s ease 0.15s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.15s",
                  boxShadow: `0 0 10px ${toRank.fromColor}`,
                }}
              />
            );
          })}

          {/* Single expanding energy ring, one-shot */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: `2px solid ${toRank.toColor}`,
              boxShadow: `0 0 24px ${toRank.fromColor}`,
              animation:
                stage >= 3
                  ? "rankup-ring 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards"
                  : undefined,
              opacity: 0,
            }}
          />

          {/* The badge — appears under the flash, no rubber-band scale */}
          <div
            style={{
              opacity: stage >= 3 ? 1 : 0,
              transform: stage >= 3 ? "scale(1)" : "scale(0.92)",
              transition: "opacity 0.3s ease, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
              filter: `drop-shadow(0 0 22px ${toRank.fromColor}) drop-shadow(0 0 6px ${toRank.toColor})`,
            }}
          >
            <RankBadge elo={toElo} size="lg" className="text-2xl px-12 py-4" />
          </div>
        </div>

        {/* Big rank name with vertical white→colour gradient.
            `pr-[0.18em]` gives the italic slant of the last glyph room so it
            doesn't get clipped by the text bounding box (visible on D-ending
            titles like "Diamond"). Padding is in em so it scales with size. */}
        <h2
          className="text-5xl sm:text-7xl font-black tracking-[0.04em] uppercase italic leading-none mt-2"
          style={{
            backgroundImage: `linear-gradient(180deg, #ffffff 0%, ${toRank.toColor} 100%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            color: toRank.fromColor, // used by drop-shadow currentColor
            paddingRight: "0.18em",
            opacity: stage >= 4 ? 1 : 0,
            transform: stage >= 4 ? "translateY(0)" : "translateY(24px)",
            transition:
              "opacity 0.55s ease, transform 0.75s cubic-bezier(0.16, 1, 0.3, 1)",
            animation: stage >= 4 ? "rankup-title-pulse 2.6s ease-in-out infinite" : undefined,
          }}
        >
          {toRank.title}
        </h2>

        {/* Old → new progression in small mono */}
        <div
          className="flex items-center gap-4 text-[11px] font-mono uppercase tracking-[0.3em]"
          style={{
            opacity: stage >= 4 ? 1 : 0,
            transform: stage >= 4 ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.55s ease 0.2s, transform 0.55s ease 0.2s",
          }}
        >
          <span className="text-zinc-500 line-through decoration-zinc-700">{fromRank.title}</span>
          <span style={{ color: toRank.toColor }}>›</span>
          <span style={{ color: toRank.toColor }}>{toRank.title}</span>
        </div>

        {/* Continue */}
        <Button
          size="lg"
          variant="outline"
          onClick={onContinue}
          className="h-11 w-64 text-[11px] font-mono uppercase tracking-[0.4em] bg-transparent hover:bg-white/5 mt-8"
          style={{
            borderColor: toRank.toColor,
            color: toRank.toColor,
            boxShadow: `0 0 24px ${toRank.fromColor}55, inset 0 0 18px ${toRank.fromColor}22`,
            opacity: stage >= 5 ? 1 : 0,
            transform: stage >= 5 ? "translateY(0)" : "translateY(14px)",
            transition: "opacity 0.5s ease, transform 0.5s ease",
            pointerEvents: stage >= 5 ? "auto" : "none",
          }}
        >
          Продолжить
        </Button>
      </div>
    </div>
  );
}
