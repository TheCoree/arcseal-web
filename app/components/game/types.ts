export type Side = "LEFT" | "RIGHT";

// Loose chain-step shape used only for client-side targeting introspection.
// The strict definition lives in the backend Pydantic schema.
export interface ChainStep {
  type: string;
  target_selector?: {
    type: string;
    range?: number;
    filter?: "ALLIES" | "ENEMIES" | "ALL";
  };
  value?: number | string;
  status_name?: string;
  duration?: number;
  stat?: string;
  damage_type?: "PHYSICAL" | "MAGICAL";
  subject?: "SELF" | "TARGET";
  move_range?: number;
  conditions?: { check: string; status_name?: string; value?: unknown }[];
  if_true?: ChainStep[];
  if_false?: ChainStep[];
}

// Frontend collapses DRAFT_BAN + DRAFT_PICK into a single "DRAFT" screen;
// the sub-stage lives inside the DraftSnapshot.
export type GameStage = "IDLE" | "SEARCHING" | "DRAFT" | "BATTLE" | "FINISHED";

export type ServerStage = "DRAFT_BAN" | "DRAFT_PICK" | "BATTLE" | "FINISHED";

export interface PlayerInfo {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  elo: number;
}

export interface DraftSnapshot {
  sub_stage: "BAN" | "PICK";
  bans_enabled: boolean;
  bans_per_side: number;
  picks_per_side: number;
  first_pick_side: Side;
  current_side: Side;
  bans: Record<Side, string[]>;
  picks: Record<Side, string[]>;
  available_pool: string[];
}

export interface StatusEffect {
  name: string;
  value?: number;
  duration: number;
  // Original duration when applied — lets the UI draw a "time left" ring.
  max_duration?: number;
  // Composite-effect tag: statuses sharing a group collapse into one badge.
  group?: string;
}

export interface UnitState {
  unit_id: string;
  char_id: string;
  owner_side: Side;
  current_hp: number;
  max_hp: number;
  current_energy: number;
  max_energy: number;
  current_defense: number;
  current_regeneration: number;
  cooldowns: Record<string, number>;
  statuses: StatusEffect[];
  // Live aura modifiers (DAMAGE, PROC_CHANCE, ABILITY_RANGE, ABILITY_COST).
  modifiers: Record<string, number>;
  has_moved: boolean;
  // Action economy: attacking and using a (non-quick) ability are mutually
  // exclusive. has_attacked blocks re-attacking + non-quick abilities;
  // has_used_ability blocks attacking but not further abilities.
  has_attacked: boolean;
  has_used_ability: boolean;
  move_count: number;
  zone: number;
  is_dead: boolean;
  // Round number on which a dead unit respawns (null while alive).
  respawn_round: number | null;
}

export interface BattleSnapshot {
  zones: string[][];
  units: Record<string, UnitState>;
  current_round: number;
  current_actor_side: Side;
  active_unit_id: string | null;
  // Kill scoreboard; first side to score_to_win wins the match.
  scores: Record<Side, number>;
  score_to_win: number;
}

export interface ResultData {
  score: number;
  elo_change: number;
  new_elo: number;
  is_winner: boolean;
  is_draw?: boolean;
}

// Static character definition — fetched once from GET /api/v1/characters
// and cached client-side. Used to render names, roles, ability info, etc.
export interface CharacterDef {
  id: string;
  name: string;
  role: string;
  initial_position_type: "FRONTLINE" | "BACKLINE";
  // Relative path under /uploads (or null if no art uploaded yet). Resolve to
  // an absolute URL with absolutizeMediaUrl from @/lib/utils before rendering.
  portrait_url?: string | null;
  base_stats: {
    hp: number;
    defense: number;
    energy_regen: number;
    max_energy: number;
    regeneration: number;
    initiative: number;
    movement_range: number;
    isolation_immune?: boolean;
  };
  attack: {
    name: string;
    description?: string | null;
    icon_url?: string | null;
    range: number;
    damage_schema: { type: string; value: number | string };
    damage_type?: "PHYSICAL" | "MAGICAL";
    // Shape is intentionally loose — engine validation lives on the backend.
    execution_chain?: ChainStep[];
  };
  // A character's kit: any number of active abilities + passives.
  abilities: AbilityDef[];
  passives: PassiveDef[];
}

export interface AbilityDef {
  id: string;
  name: string;
  description?: string | null;
  icon_url?: string | null;
  energy_cost: number;
  cooldown: number;
  is_quick: boolean;
  is_ult?: boolean;
  range?: number | null;
  execution_chain?: ChainStep[];
}

export interface PassiveDef {
  id: string;
  name: string;
  description?: string | null;
  icon_url?: string | null;
  trigger_event: string;
  execution_chain?: ChainStep[];
}
