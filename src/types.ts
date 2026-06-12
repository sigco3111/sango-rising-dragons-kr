export type TroopType = 'infantry' | 'cavalry' | 'archer';

export interface FactionDef {
  id: string; name: string; zh: string; color: string;
  leader: string; playable: boolean; desc: string;
}

export interface CityDef {
  id: string; name: string; zh: string; x: number; y: number;
  adj: string[]; owner: string; troops: number;
  farm: number; market: number; walls: number; capital?: boolean;
}

export interface OfficerDef {
  id: string; name: string; zh: string; faction: string; city: string;
  ldr: number; war: number; int: number; pol: number;
  troop: TroopType; skill: string; hidden?: boolean;
}

export interface SkillDef {
  id: string; name: string; zh: string; desc: string;
  type: 'damage' | 'intdamage' | 'duel' | 'heal' | 'buff';
  power: number; range: number; aoe: number; cooldown: number;
  push?: boolean; pierce?: boolean;
}

export interface ItemDef {
  id: string; name: string; zh: string; desc: string;
  stat: 'war' | 'int' | 'ldr' | 'pol' | 'move' | 'income'; bonus: number;
}

export interface EventEffect { op: string; v: any; to?: string; amount?: number; }
export interface EventChoice { label: string; effects: EventEffect[]; requireGold?: number; }
export interface EventDef {
  id: string; title: string; text: string;
  trigger: {
    minTurn?: number; maxTurn?: number; once?: boolean; month?: number;
    faction?: string; notFaction?: string; ownsCity?: string;
    officerFree?: string; factionAlive?: string; chance?: number;
  };
  choices: EventChoice[];
}

export interface Content {
  factions: FactionDef[];
  cities: CityDef[];
  officers: OfficerDef[];
  skills: SkillDef[];
  items: ItemDef[];
  events: EventDef[];
}

// ---- mutable campaign state ----

export interface CityState {
  id: string; owner: string; troops: number;
  farm: number; market: number; walls: number;
}

export interface OfficerState {
  id: string; faction: string; city: string;
  level: number; exp: number; item?: string;
  acted?: boolean; // used an assignment this turn
}

export interface GameState {
  turn: number;             // 1 turn = 1 month, starts 190/1
  playerFaction: string;
  gold: number; food: number; cp: number;
  cities: Record<string, CityState>;
  officers: Record<string, OfficerState>;
  firedEvents: string[];
  aiGold: Record<string, number>;
  over?: 'win' | 'lose';
}

export interface BattleSetup {
  attacker: string;          // faction id
  defender: string;
  cityId: string;            // city being fought over
  atkOfficers: string[];     // officer ids
  defOfficers: string[];
  atkTroops: number;
  defTroops: number;
  walls: number;
  playerSide: 'atk' | 'def' | 'none';
  sourceCityId?: string;     // attacker origin (for retreat)
}

export interface BattleResult {
  winner: 'atk' | 'def';
  atkRemaining: number;
  defRemaining: number;
}
