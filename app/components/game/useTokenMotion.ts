"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

import type { BattleEvent, MoveCause } from "@/app/components/game/types";

type Motion = MoveCause | "respawn";
type Point = { x: number; y: number };

// Board-local layout position. offsetLeft/Top ignore CSS transforms, so the
// pan/zoom of the map and any animation still in flight don't skew it.
function offsetWithin(el: HTMLElement, root: HTMLElement): Point {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

const t = (dx: number, dy: number, extra = "") => `translate(${dx}px, ${dy}px) ${extra}`.trim();

// How a token travels from its old spot (dx, dy away) to where it now is.
function flight(cause: Motion | undefined, dx: number, dy: number): [Keyframe[], KeyframeAnimationOptions] {
  switch (cause) {
    case "walk":
      return [
        [{ transform: t(dx, dy) }, { transform: t(dx / 2, dy / 2 - 18), offset: 0.5 }, { transform: "none" }],
        { duration: 480, easing: "ease-in-out" },
      ];
    case "pull":
      // Yanked: accelerates toward the puller, overshoots, squashes back.
      return [
        [
          { transform: t(dx, dy) },
          { transform: t(dx * 0.12, dy * 0.12, "scale(1.12, 0.88)"), offset: 0.55 },
          { transform: t(-dx * 0.07, -dy * 0.07, "scale(0.95, 1.05)"), offset: 0.78 },
          { transform: "none" },
        ],
        { duration: 560, easing: "cubic-bezier(0.6, 0, 0.4, 1)" },
      ];
    case "dash":
      return [
        [
          { transform: t(dx, dy), filter: "blur(0px)", opacity: 1 },
          { transform: t(dx * 0.35, dy * 0.35), filter: "blur(3px)", opacity: 0.55, offset: 0.45 },
          { transform: "none", filter: "blur(0px)", opacity: 1 },
        ],
        { duration: 340, easing: "ease-out" },
      ];
    case "carry":
      return [
        [{ transform: t(dx, dy) }, { transform: t(dx / 2, dy / 2 - 64, "scale(1.06)"), offset: 0.5 }, { transform: "none" }],
        { duration: 680, easing: "ease-in-out" },
      ];
    case "relocate":
      return [
        [
          { transform: t(dx, dy) },
          { transform: t(dx / 2, dy / 2 - 150, "scale(1.22)"), offset: 0.5 },
          { transform: "none" },
        ],
        { duration: 950, easing: "ease-in-out" },
      ];
    case "swap":
      // Teleport: fade out where it was, fade in where it is.
      return [
        [
          { transform: t(dx, dy), opacity: 1 },
          { transform: t(dx, dy, "scale(0.4)"), opacity: 0, offset: 0.42 },
          { transform: "scale(0.4)", opacity: 0, offset: 0.58 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 620, easing: "ease-in-out" },
      ];
    case "respawn":
      return [
        [
          { transform: "scale(0.3)", opacity: 0 },
          { transform: "scale(1.15)", opacity: 1, offset: 0.7 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 650, easing: "ease-out" },
      ];
    default:
      // Re-layout inside a zone (someone joined or left it).
      return [[{ transform: t(dx, dy) }, { transform: "none" }], { duration: 320, easing: "ease-out" }];
  }
}

// RGB of the motion streak / burst left behind, per cause.
const FX_COLOR: Partial<Record<Motion, string>> = {
  pull: "251, 146, 60",
  dash: "212, 212, 216",
  carry: "56, 189, 248",
  relocate: "232, 121, 249",
  swap: "167, 139, 250",
  respawn: "52, 211, 153",
};

function spawn(layer: HTMLElement, style: Partial<CSSStyleDeclaration>, frames: Keyframe[], duration: number) {
  const el = document.createElement("div");
  Object.assign(el.style, { position: "absolute", pointerEvents: "none" }, style);
  layer.appendChild(el);
  el.animate(frames, { duration, easing: "ease-out", fill: "forwards" }).onfinish = () => el.remove();
}

function streak(layer: HTMLElement, from: Point, to: Point, rgb: string) {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const rot = `rotate(${angle}rad)`;
  spawn(
    layer,
    {
      left: `${from.x}px`,
      top: `${from.y - 4}px`,
      width: `${len}px`,
      height: "8px",
      borderRadius: "4px",
      transformOrigin: "0 50%",
      background: `linear-gradient(90deg, rgba(${rgb},0) 0%, rgba(${rgb},0.9) 100%)`,
      filter: "blur(1.5px)",
    },
    [
      { opacity: 0, transform: `${rot} scaleX(0.15)` },
      { opacity: 1, transform: `${rot} scaleX(1)`, offset: 0.35 },
      { opacity: 0, transform: `${rot} scaleX(1)` },
    ],
    650,
  );
}

function burst(layer: HTMLElement, at: Point, rgb: string, size = 70) {
  spawn(
    layer,
    {
      left: `${at.x - size / 2}px`,
      top: `${at.y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "9999px",
      border: `3px solid rgba(${rgb},0.9)`,
      boxShadow: `0 0 24px rgba(${rgb},0.6)`,
    },
    [
      { opacity: 0.9, transform: "scale(0.4)" },
      { opacity: 0, transform: "scale(1.9)" },
    ],
    700,
  );
}

// FLIP animation for battlefield tokens. Register each token's wrapper with
// the returned callback; whenever the board re-renders, any token whose
// layout position changed glides there from where it was, styled by the
// move's cause from the event batch that came with the new snapshot.
export function useTokenMotion(
  boardRef: React.RefObject<HTMLElement | null>,
  fxLayerRef: React.RefObject<HTMLElement | null>,
  layoutKey: unknown,
  eventBatch: { key: number; events: BattleEvent[] } | null,
) {
  const elements = useRef(new Map<string, HTMLElement>());
  const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const positions = useRef(new Map<string, Point>());
  const handledBatch = useRef<number | null>(null);

  const register = useCallback((uid: string) => {
    let cb = callbacks.current.get(uid);
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        if (el) elements.current.set(uid, el);
        else elements.current.delete(uid);
      };
      callbacks.current.set(uid, cb);
    }
    return cb;
  }, []);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const layer = fxLayerRef.current;

    const causes = new Map<string, Motion>();
    if (eventBatch && eventBatch.key !== handledBatch.current) {
      handledBatch.current = eventBatch.key;
      for (const ev of eventBatch.events) {
        if (ev.t === "move") causes.set(ev.unit, ev.cause);
        else if (ev.t === "respawn") causes.set(ev.unit, "respawn");
      }
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    for (const [uid, el] of elements.current) {
      const pos = offsetWithin(el, board);
      const prev = positions.current.get(uid);
      positions.current.set(uid, pos);
      if (!prev || reduced) continue;

      const cause = causes.get(uid);
      const dx = prev.x - pos.x;
      const dy = prev.y - pos.y;
      if (cause !== "respawn" && Math.hypot(dx, dy) < 2) continue;

      const [frames, timing] = flight(cause, dx, dy);
      // A newer move supersedes one still in flight.
      el.getAnimations().forEach((a) => a.cancel());
      // Fly above the other zones' tokens while in transit (the wrapper is
      // position: relative, so z-index applies).
      el.animate(frames.map((f) => ({ ...f, zIndex: 20 })), timing);

      const rgb = cause && FX_COLOR[cause];
      if (!layer || !rgb) continue;
      const half = { x: el.offsetWidth / 2, y: el.offsetHeight / 2 };
      const to = { x: pos.x + half.x, y: pos.y + half.y };
      const from = { x: prev.x + half.x, y: prev.y + half.y };
      if (cause === "respawn") {
        burst(layer, to, rgb, 110);
      } else if (cause === "swap") {
        burst(layer, from, rgb);
        burst(layer, to, rgb);
      } else {
        streak(layer, from, to, rgb);
      }
    }
  }, [boardRef, fxLayerRef, layoutKey, eventBatch]);

  return register;
}
