import type { AbilityDef, CharacterDef, ChainStep, UnitState } from "@/app/components/game/types";

type Condition = NonNullable<ChainStep["conditions"]>[number];

// Selectors whose DAMAGE lands on the unit the player clicked (for passives:
// the unit the triggering hit landed on).
const HITS_TARGET = new Set(["MAIN_TARGET", "CUSTOM_SELECT", "SAME_ZONE", "LAST_HIT_ENEMIES"]);

interface Ctx {
  actor: UnitState;
  actorChar: CharacterDef;
  target: UnitState;
  // Distance of the hit — what `attacker_range` checks on the server.
  range: number;
}

function hasStatus(unit: UnitState, name?: string): boolean {
  return unit.statuses.some((s) => s.name === name);
}

function stacks(unit: UnitState, name?: string): number {
  return unit.statuses.find((s) => s.name === name)?.value ?? 0;
}

// Mirrors effects._apply_damage on the server: flat DAMAGE modifier, the
// isolation penalty/bonus, then defense (physical only), floored at 1.
export function hitDamage(attacker: UnitState, target: UnitState, base: number, damageType: string): number {
  let raw = base + (attacker.modifiers?.DAMAGE ?? 0);
  if (hasStatus(attacker, "ISOLATION") && !hasStatus(attacker, "DEBUFF_IMMUNE")) raw -= 1;
  if (hasStatus(target, "ISOLATION") && !hasStatus(target, "DEBUFF_IMMUNE")) raw += 2;
  return damageType === "MAGICAL" ? Math.max(1, raw) : Math.max(1, raw - target.current_defense);
}

function resolveValue(value: ChainStep["value"], ctx: Ctx): number | null {
  if (typeof value === "number") return value;
  if (value === "self.attack_damage") {
    const base = ctx.actorChar.attack.damage_schema.value;
    return typeof base === "number" ? base : null;
  }
  return null;
}

// true / false for checks the snapshot can settle; "chance" for dice rolls.
function judge(cond: Condition, ctx: Ctx, dealt: number): boolean | "chance" {
  const { actor, target } = ctx;
  switch (cond.check) {
    case "target_has_status":
      return hasStatus(target, cond.status_name);
    case "self_status_at_least":
      return stacks(actor, cond.status_name) >= Number(cond.value ?? 0);
    case "self_has_status":
      return hasStatus(actor, cond.status_name);
    case "target_hp_below_pct":
      return ((target.current_hp - dealt) * 100) / target.max_hp < Number(cond.value ?? 0);
    case "self_hp_below_pct":
      return (actor.current_hp * 100) / actor.max_hp < Number(cond.value ?? 0);
    case "attacker_range":
      return ctx.range === Number(cond.value ?? -1);
    case "random_chance":
      return "chance";
    default:
      return false;
  }
}

function judgeAll(conditions: Condition[] | undefined, ctx: Ctx, dealt: number): boolean | "chance" {
  let verdict: boolean | "chance" = true;
  for (const c of conditions ?? []) {
    const v = judge(c, ctx, dealt);
    if (v === false) return false;
    if (v === "chance") verdict = "chance";
  }
  return verdict;
}

// Individual hits a chain lands on the target, in order. A conditional that
// hinges on a dice roll is assumed not to fire.
function chainHits(chain: ChainStep[] | undefined, ctx: Ctx, dealt: number): number[] {
  const hits: number[] = [];
  for (const step of chain ?? []) {
    const sel = step.target_selector;
    if (step.type === "DAMAGE" && sel && HITS_TARGET.has(sel.type) && !(sel.type === "SAME_ZONE" && sel.filter === "ALLIES")) {
      const base = resolveValue(step.value, ctx);
      if (base !== null) hits.push(hitDamage(ctx.actor, ctx.target, base, step.damage_type ?? "PHYSICAL"));
    } else if (step.type === "CONDITIONAL") {
      const sofar = dealt + hits.reduce((a, b) => a + b, 0);
      const ok = judgeAll(step.conditions, ctx, sofar) === true;
      hits.push(...chainHits(ok ? step.if_true : step.if_false, ctx, sofar));
    }
  }
  return hits;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface HitPreview {
  // Damage that lands for sure.
  amount: number;
  lethal: boolean;
  // With every random proc firing (only set when procs can add damage).
  upTo?: number;
  maybeLethal?: boolean;
}

// Resolve an attack/ability chain plus the actor's damage passives the way
// the server does: ON_DEAL_DAMAGE fires once per hit, AFTER_ACTION once.
function resolve(chain: ChainStep[], actor: UnitState, actorChar: CharacterDef, target: UnitState): HitPreview | null {
  const ctx: Ctx = { actor, actorChar, target, range: Math.abs(target.zone - actor.zone) };
  const hits = chainHits(chain, ctx, 0);
  if (!hits.length) return null;
  let sure = sum(hits);
  let chance = 0;

  const book = (verdict: boolean | "chance", bonus: number) => {
    if (verdict === true) sure += bonus;
    else if (verdict === "chance") chance += bonus;
  };
  for (const passive of actorChar.passives) {
    if (passive.trigger_event === "ON_DEAL_DAMAGE") {
      for (let i = 0; i < hits.length; i++) {
        const verdict = judgeAll(passive.conditions, ctx, sure);
        if (verdict !== false) book(verdict, sum(chainHits(passive.execution_chain, ctx, sure)));
      }
    } else if (passive.trigger_event === "AFTER_ACTION") {
      const verdict = judgeAll(passive.conditions, ctx, sure);
      if (verdict !== false) book(verdict, sum(chainHits(passive.execution_chain, ctx, sure)));
    }
  }

  const preview: HitPreview = { amount: sure, lethal: sure >= target.current_hp };
  if (chance > 0) {
    preview.upTo = sure + chance;
    preview.maybeLethal = sure + chance >= target.current_hp;
  }
  return preview;
}

export function previewAttack(attacker: UnitState, char: CharacterDef, target: UnitState): HitPreview | null {
  const base = char.attack.damage_schema.value;
  if (typeof base !== "number") return null;
  const attackBuff = attacker.statuses
    .filter((s) => s.name === "BUFF_ATTACK_DAMAGE")
    .reduce((total, s) => total + (s.value ?? 0), 0);
  const chain: ChainStep[] = [
    {
      type: "DAMAGE",
      target_selector: { type: "MAIN_TARGET" },
      value: base + attackBuff,
      damage_type: char.attack.damage_type ?? "PHYSICAL",
    },
    ...(char.attack.execution_chain ?? []),
  ];
  return resolve(chain, attacker, char, target);
}

export function previewAbility(
  caster: UnitState,
  char: CharacterDef,
  ability: AbilityDef,
  target: UnitState,
): HitPreview | null {
  if (target.owner_side === caster.owner_side) return null;
  return resolve(ability.execution_chain ?? [], caster, char, target);
}
