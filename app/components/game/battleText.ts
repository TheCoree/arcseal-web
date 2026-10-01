import type { Side } from "@/app/components/game/types";

// Zone name from the viewer's point of view ("ваш фронтлайн", "центр", …).
export function zoneName(zone: number, mySide: Side): string {
  if (zone === 2) return "центр";
  const line = zone === 0 || zone === 4 ? "бэклайн" : "фронтлайн";
  const mine = (mySide === "LEFT" && zone < 2) || (mySide === "RIGHT" && zone > 2);
  return mine ? `ваш ${line}` : `${line} соперника`;
}

// "into <zone>" with the right preposition: «во фронтлайн», «в центр».
export function intoZone(zone: number, mySide: Side): string {
  const name = zoneName(zone, mySide);
  return name.startsWith("ф") ? `во ${name}` : `в ${name}`;
}
