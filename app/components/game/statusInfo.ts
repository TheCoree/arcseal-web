import {
  Ban,
  Bomb,
  Brain,
  CircleDot,
  Droplets,
  Dumbbell,
  Eye,
  Flame,
  HeartPulse,
  MapPin,
  MapPinOff,
  ShieldCheck,
  ShieldMinus,
  ShieldPlus,
  Swords,
  VenetianMask,
  type LucideIcon,
} from "lucide-react";

import type { StatusEffect } from "@/app/components/game/types";

export type StatusTone = "good" | "bad" | "special";

export interface StatusInfo {
  // Full name with its strength, e.g. "Защита снижена на 2".
  title: string;
  // Chip label, e.g. "Защита −2".
  short: string;
  // What it does, in plain words.
  text: string;
  tone: StatusTone;
  Icon: LucideIcon;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// "ещё 2 хода" — durations count the affected hero's own turns. Null for
// effects without a timer.
export function turnsLeft(s: Pick<StatusEffect, "duration">): string | null {
  if (s.duration == null || s.duration < 0) return null;
  return `ещё ${s.duration} ${plural(s.duration, "ход", "хода", "ходов")}`;
}

type Described = Pick<StatusEffect, "name" | "value">;

export function describeStatus(s: Described): StatusInfo {
  const v = s.value ?? 0;
  const abs = Math.abs(v);
  switch (s.name) {
    case "STUN":
      return {
        title: "Оглушение",
        short: "Оглушён",
        text: "Пропустит свой следующий ход: не сможет ни ходить, ни атаковать, ни применять способности.",
        tone: "bad",
        Icon: Ban,
      };
    case "POISON":
      return {
        title: `Яд: −${v} HP за ход`,
        short: `Яд ${v}`,
        text: `Теряет ${v} HP в начале каждого своего хода.`,
        tone: "bad",
        Icon: Droplets,
      };
    case "ISOLATION":
      return {
        title: "Изоляция",
        short: "Изоляция",
        text: "Стоит на половине врага: получает на 2 урона больше и наносит на 1 меньше. Пройдёт, как только вернётся в центр или на свою сторону.",
        tone: "bad",
        Icon: MapPinOff,
      };
    case "REGEN":
    case "BUFF_REGENERATION":
      return {
        title: `Регенерация +${v} HP за ход`,
        short: `Реген +${v}`,
        text: `Восстанавливает ${v} HP в начале каждого своего хода.`,
        tone: "good",
        Icon: HeartPulse,
      };
    case "MARK_BOMB":
      return {
        title: "Метка пламени",
        short: "Метка",
        text: "Если Пиромант ещё раз применит к цели «Метку пламени», метка взорвётся: большой магический урон ей и всем её союзникам в той же зоне.",
        tone: "bad",
        Icon: Bomb,
      };
    case "BUFF_DEFENSE":
      return v >= 0
        ? {
            title: `Защита повышена на ${v}`,
            short: `Защита +${v}`,
            text: `Физический урон по нему меньше на ${v}.`,
            tone: "good",
            Icon: ShieldPlus,
          }
        : {
            title: `Защита снижена на ${abs}`,
            short: `Защита −${abs}`,
            text: `Физический урон по нему больше на ${abs}.`,
            tone: "bad",
            Icon: ShieldMinus,
          };
    case "BUFF_DAMAGE":
      return {
        title: `Урон +${v}`,
        short: `Урон +${v}`,
        text: `Все его удары наносят на ${v} урона больше.`,
        tone: "good",
        Icon: Swords,
      };
    case "BUFF_ATTACK_DAMAGE":
      return {
        title: `Атака +${v}`,
        short: `Атака +${v}`,
        text: `Обычная атака наносит на ${v} урона больше.`,
        tone: "good",
        Icon: Swords,
      };
    case "RESOLVE":
      return {
        title: `Стойкость: ${v} из 5`,
        short: `Стойкость ${v}`,
        text: "Копится, когда Гоггинс получает урон. Каждый стак даёт +1 энергии в начале его хода; с 3 стаков сильнее атака и Carry the Log; на 5 стаках сам включается Hell Week.",
        tone: "special",
        Icon: Dumbbell,
      };
    case "HELL_WEEK":
      return {
        title: "Hell Week",
        short: "Hell Week",
        text: "Режим ярости: сильнее бьёт, лучше держит удары, быстро лечится и не поддаётся дебаффам. В начале каждого хода бьёт врагов рядом.",
        tone: "special",
        Icon: Flame,
      };
    case "DEBUFF_IMMUNE":
      return {
        title: "Иммунитет к дебаффам",
        short: "Иммунитет",
        text: "Оглушение, яд, изоляция и снижение защиты на него сейчас не действуют.",
        tone: "good",
        Icon: ShieldCheck,
      };
    case "ISO_IMMUNE":
      return {
        title: "Без изоляции",
        short: "Без изоляции",
        text: "Не получает штраф изоляции на половине врага.",
        tone: "good",
        Icon: MapPin,
      };
    case "OBSESSION":
      return {
        title: "Одержимость",
        short: "Одержимость",
        text: "Цель Джо Голдберга: его атака бьёт её на 8 сильнее сквозь защиту, он лечится, нанося ей урон, а «Стеклянная клетка» сжигает метку ради 28 урона.",
        tone: "bad",
        Icon: Eye,
      };
    case "ALIBI":
      return {
        title: "Алиби использовано",
        short: "Алиби",
        text: "«Идеальное алиби» уже спасло его в этой жизни и до смерти больше не сработает.",
        tone: "special",
        Icon: VenetianMask,
      };
    case "INSIGHT":
      return {
        title: `Наблюдательность: ${v} из 3`,
        short: `Наблюд. ${v}`,
        text: "Копится, когда Джейн задевает врагов. На 3 стаках в начале раунда вся его команда получает +1 энергии; «Гипноз» сжигает стаки и отнимает у цели столько же энергии.",
        tone: "special",
        Icon: Brain,
      };
    default:
      return { title: s.name, short: s.name, text: "", tone: "special", Icon: CircleDot };
  }
}

// Statuses DEBUFF_IMMUNE suppresses while it lasts.
export function isDebuff(s: Described): boolean {
  return describeStatus(s).tone === "bad";
}

export interface StatusGroup {
  key: string;
  // The status that names the group (e.g. HELL_WEEK); the only one for singles.
  head: StatusEffect;
  members: StatusEffect[];
}

// Collapse multi-effect abilities (statuses sharing a `group`, e.g. Hell Week)
// into one entry headed by the status named after the group.
export function groupStatuses(statuses: StatusEffect[]): StatusGroup[] {
  const groups = new Map<string, StatusEffect[]>();
  const out: StatusGroup[] = [];
  statuses.forEach((s, i) => {
    if (!s.group) {
      out.push({ key: `${s.name}-${i}`, head: s, members: [s] });
      return;
    }
    const list = groups.get(s.group);
    if (list) list.push(s);
    else groups.set(s.group, [s]);
  });
  for (const [group, members] of groups) {
    const head = members.find((m) => m.name === group) ?? members[0];
    out.unshift({ key: `group-${group}`, head, members });
  }
  return out;
}
