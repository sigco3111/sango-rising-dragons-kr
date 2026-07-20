import Phaser from 'phaser';
import { content, cityDef, officerDef, itemDef, faction } from './content';
import { armyPower } from './battle/model';
import type { GameState, CityState, OfficerState, EventDef, EventChoice, OfficerDef, BattleSetup, BattleResult } from './types';

export const bus = new Phaser.Events.EventEmitter();

export let G: GameState = null as any;

const SAVE_KEY = 'sango_save_v1';
const AUTOPILOT_KEY = 'sango_autopilot_v1';

// ---------- autopilot (UI toggle, persisted) ----------

let autopilotOn = false;

export function getAutopilot(): boolean { return autopilotOn; }
export function setAutopilot(on: boolean): void {
  autopilotOn = !!on;
  try { localStorage.setItem(AUTOPILOT_KEY, autopilotOn ? '1' : '0'); } catch { /* private mode */ }
  bus.emit('autopilotChanged', autopilotOn);
}
export function loadAutopilot(): boolean {
  try {
    const v = localStorage.getItem(AUTOPILOT_KEY);
    autopilotOn = v === '1';
  } catch { autopilotOn = false; }
  return autopilotOn;
}

// ---------- helpers ----------

export function monthOf(turn: number) { return ((turn - 1) % 12) + 1; }
export function yearOf(turn: number) { return 190 + Math.floor((turn - 1) / 12); }
export function seasonOf(turn: number) {
  const m = monthOf(turn);
  return m <= 3 ? '봄' : m <= 6 ? '여름' : m <= 9 ? '가을' : '겨울';
}

export function citiesOf(fid: string): CityState[] {
  return Object.values(G.cities).filter((c) => c.owner === fid);
}
export function officersOf(fid: string): OfficerState[] {
  return Object.values(G.officers).filter((o) => o.faction === fid);
}
export function officersIn(cityId: string, fid?: string): OfficerState[] {
  return Object.values(G.officers).filter((o) => o.city === cityId && (fid === undefined || o.faction === fid));
}
export function freeOfficersIn(cityId: string): OfficerState[] {
  return Object.values(G.officers).filter((o) => o.city === cityId && o.faction === '' && !officerDef(o.id).hidden);
}

export function effStat(o: OfficerState, stat: 'war' | 'int' | 'ldr' | 'pol'): number {
  const base = officerDef(o.id)[stat] + (o.level - 1) * 2;
  const it = o.item ? itemDef(o.item) : null;
  return base + (it && it.stat === stat ? it.bonus : 0);
}

export function expToLevel(level: number) { return level * 100; }

export function gainExp(o: OfficerState, amount: number) {
  if (o.level >= 20) return;
  o.exp += amount;
  while (o.exp >= expToLevel(o.level) && o.level < 20) {
    o.exp -= expToLevel(o.level);
    o.level++;
    if (o.faction === G.playerFaction) {
      bus.emit('log', `⬆ ${officerDef(o.id).name} Lv${o.level} 레벨업!`);
    }
  }
}

export function maxCp(): number {
  return 3 + Math.floor(citiesOf(G.playerFaction).length / 2);
}

// ---------- new game / save / load ----------

export function newGame(playerFaction: string) {
  const cities: Record<string, CityState> = {};
  for (const c of content.cities) {
    cities[c.id] = { id: c.id, owner: c.owner, troops: c.troops, farm: c.farm, market: c.market, walls: c.walls };
  }
  const officers: Record<string, OfficerState> = {};
  for (const o of content.officers) {
    officers[o.id] = { id: o.id, faction: o.faction, city: o.city, level: 1, exp: 0 };
  }
  const aiGold: Record<string, number> = {};
  for (const f of content.factions) aiGold[f.id] = 800;

  G = {
    turn: 1, playerFaction, gold: 1000, food: 2000, cp: 0,
    cities, officers, firedEvents: [], aiGold,
  };
  G.cp = maxCp();
}

export function saveGame() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(G));
}
export function hasSave() { return !!localStorage.getItem(SAVE_KEY); }
export function loadGame(): boolean {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try { G = JSON.parse(raw); return true; } catch { return false; }
}

// ---------- economy / turn flow ----------

export function playerIncome() {
  const cities = citiesOf(G.playerFaction);
  let gold = 0, food = 0;
  for (const c of cities) {
    gold += 80 + c.market * 60;
    food += 60 + c.farm * 50;
  }
  // upkeep: troops eat
  const troops = cities.reduce((s, c) => s + c.troops, 0);
  food -= Math.floor(troops / 100);
  // items
  for (const o of officersOf(G.playerFaction)) {
    if (o.item && itemDef(o.item).stat === 'income') gold += itemDef(o.item).bonus;
  }
  return { gold, food };
}

export function startPlayerTurn() {
  const inc = playerIncome();
  G.gold += inc.gold;
  G.food += inc.food;
  if (G.food < 0) {
    // starvation: desertion
    const cities = citiesOf(G.playerFaction);
    for (const c of cities) c.troops = Math.max(200, Math.floor(c.troops * 0.93));
    G.food = 0;
    bus.emit('log', '⚠ 식량고이 비었습니다! 병사들이 굶주려 도망쳤습니다.');
  }
  G.cp = maxCp();
  for (const o of officersOf(G.playerFaction)) o.acted = false;
  bus.emit('refresh');
}

// ---------- player actions (cost CP) ----------

export function spendCp(n = 1): boolean {
  if (G.cp < n) { bus.emit('log', '⚠ 명령점이 모두 소진되었습니다 — 턴을 종료하세요.'); return false; }
  G.cp -= n;
  return true;
}

export const DEV_COST = 400;
export const RECRUIT_COST_GOLD = 200;
export const RECRUIT_COST_FOOD = 300;
export const RECRUIT_AMOUNT = 1500;

export function develop(cityId: string, kind: 'farm' | 'market' | 'walls'): boolean {
  const c = G.cities[cityId];
  const max = kind === 'walls' ? 5 : 6;
  if (c[kind] >= max) { bus.emit('log', '⚠ 이미 최고 레벨입니다.'); return false; }
  if (G.gold < DEV_COST) { bus.emit('log', '⚠ 금전이 부족합니다.'); return false; }
  if (!spendCp()) return false;
  G.gold -= DEV_COST;
  c[kind]++;
  bus.emit('sfx', 'build');
  bus.emit('log', `🏗 ${cityDef(cityId).name}:${kind === 'farm' ? '농지' : kind === 'market' ? '시장' : '성벽'}레벨 ${c[kind]}까지 향상.`);
  bus.emit('refresh');
  return true;
}

export function recruit(cityId: string): boolean {
  if (G.gold < RECRUIT_COST_GOLD || G.food < RECRUIT_COST_FOOD) {
    bus.emit('log', '⚠ 징병에는 200 금과 300 식량이 필요합니다.'); return false;
  }
  if (!spendCp()) return false;
  const beforeTroops = G.cities[cityId]?.troops ?? 0;
  G.gold -= RECRUIT_COST_GOLD; G.food -= RECRUIT_COST_FOOD;
  G.cities[cityId].troops += RECRUIT_AMOUNT;
  const afterTroops = G.cities[cityId].troops;
  // Debug hook: window.__sango.getG().cities[cityId].troops 으로 콘솔 검증 가능
  try { (window as any).__sangoRecruitLog = { cityId, before: beforeTroops, after: afterTroops, gold: G.gold, food: G.food }; } catch {}
  bus.emit('sfx', 'recruit');
  bus.emit('log', `⚔ ${cityDef(cityId).name}에서 신병 ${RECRUIT_AMOUNT}명 모집. (${beforeTroops.toLocaleString()}→${afterTroops.toLocaleString()})`);
  bus.emit('refresh');
  return true;
}

/** Send an officer to find free officers hiding in a city. */
export function searchTalent(cityId: string, searcherId: string): boolean {
  const searcher = G.officers[searcherId];
  if (searcher.acted) { bus.emit('log', '⚠ 그 장수는 이번 턴에 이미 행동했습니다.'); return false; }
  if (!spendCp()) return false;
  searcher.acted = true;
  const free = freeOfficersIn(cityId);
  const pol = effStat(searcher, 'pol');
  if (free.length === 0) {
    G.gold += 100;
    bus.emit('log', `🔍 ${officerDef(searcherId).name}이(가) ${cityDef(cityId).name}에서 인재는 찾지 못했지만, 세금 100 금을 거두었습니다.`);
  } else {
    const target = free[Math.floor(Math.random() * free.length)];
    const chance = 0.35 + pol / 200;
    if (Math.random() < chance) {
      target.faction = G.playerFaction;
      bus.emit('sfx', 'recruit');
      bus.emit('modal', {
        title: '인재가 합류합니다!',
        text: `${officerDef(searcherId).name}이(가) 일세에 명성 높은 ${officerDef(target.id).name}을(를) 설득하여 우리 군에 합류시켰습니다!`,
        choices: [{ label: '환영합니다!', effects: [] }],
      });
    } else {
      bus.emit('log', `🔍 ${officerDef(searcherId).name}소문${officerDef(target.id).name}이(가) ${cityDef(cityId).name}출몰, 안타깝게도못만날 수 있을지도.`);
    }
  }
  bus.emit('refresh');
  return true;
}

export function trainOfficer(officerId: string): boolean {
  const o = G.officers[officerId];
  if (o.acted) { bus.emit('log', '⚠ 그 장수는 이번 턴에 이미 행동했습니다.'); return false; }
  if (G.gold < 150) { bus.emit('log', '⚠ 조련에는 150 금이 필요합니다.'); return false; }
  if (!spendCp()) return false;
  o.acted = true;
  G.gold -= 150;
  gainExp(o, 40 + Math.floor(Math.random() * 30));
  bus.emit('log', `🎯 ${officerDef(officerId).name}이(가) 부대를 조련했습니다. (경험치 상승)`);
  bus.emit('refresh');
  return true;
}

export function moveOfficers(from: string, to: string, officerIds: string[], troops: number) {
  const src = G.cities[from];
  const dst = G.cities[to];
  src.troops -= troops;
  dst.troops += troops;
  for (const id of officerIds) { G.officers[id].city = to; G.officers[id].acted = true; }
  bus.emit('log', `🚩 ${troops.toLocaleString()} 병력이 ${cityDef(from).name}에서 ${cityDef(to).name}(으)로 이동.`);
  bus.emit('refresh');
}

// ---------- conquest ----------

export function captureCity(cityId: string, newOwner: string, troops: number, officerIds: string[]) {
  const c = G.cities[cityId];
  const oldOwner = c.owner;
  c.owner = newOwner;
  c.troops = troops;
  // defeated officers scatter to a random city of their faction, or become free
  for (const o of officersIn(cityId)) {
    if (o.faction !== newOwner && !officerIds.includes(o.id)) {
      const homes = citiesOf(o.faction);
      if (o.faction !== '' && homes.length > 0) {
        o.city = homes[Math.floor(Math.random() * homes.length)].id;
      } else if (o.faction !== '') {
        o.faction = ''; // faction destroyed → wanderer
      }
    }
  }
  for (const id of officerIds) G.officers[id].city = cityId;

  if (oldOwner !== 'neutral' && citiesOf(oldOwner).length === 0) {
    bus.emit('log', `💀 ${faction(oldOwner).name} 군이 괴멸되었습니다!`);
    for (const o of officersOf(oldOwner)) o.faction = '';
  }
  checkVictory();
  bus.emit('refresh');
}

export function checkVictory() {
  const owned = citiesOf(G.playerFaction).length;
  if (owned === 0) { G.over = 'lose'; bus.emit('gameover', 'lose'); }
  else if (owned >= 12) { G.over = 'win'; bus.emit('gameover', 'win'); }
}

// ---------- autopilot queue (full scope: develop + recruit + search + train + march) ----------
//
// 우선순위 (한 step = 한 행동):
//   P1 march-attack  — 강한 적지 출정 (autoResolve). CP>=1 + ratio>1.4 (CP 충분하면 ratio>1.0까지 완화)
//   P2 march-move    — 적 인접 도시로 부대 재배치 (응집)
//   P3 search        — 재야 인재 있는 도시 수색 (CP>=2일 때)
//   P4 train         — 가장 약한 아군 장수 조련 (CP>=2일 때)
//   P5 develop       — 개간/통상/축성/징병 (A안과 동일, CP 부족할 때)
//
// 모든 행동은 CP=0 또는 행동 불가 시 종료 → AI 턴 체인.

interface AutoAction {
  kind: 'march-attack' | 'march-move' | 'search' | 'train' | 'farm' | 'market' | 'walls' | 'recruit';
  cityId?: string;
  officerId?: string;
  // march 전용
  targetCityId?: string;
  picked?: string[];
  troops?: number;
}

const ACTION_ICON: Record<AutoAction['kind'], string> = {
  'march-attack': '⚔ 출정(공격)',
  'march-move': '🚩 출정(이동)',
  'search': '🔍 수색',
  'train': '🎯 조련',
  farm: '🌾 개간', market: '🪙 통상', walls: '🧱 축성', recruit: '⚔ 징병',
};

const ATTACK_RATIO_STRICT = 1.4;  // AI와 동일 강도
const ATTACK_RATIO_RELAXED = 1.0;  // CP 충분할 때 (조련 안 하는 절약 모드)

/** Find best offensive target across all player cities. Returns null if none strong enough. */
function pickBestAttack(allowRelaxed: boolean): AutoAction | null {
  if (G.cp <= 0) return null;
  const my = citiesOf(G.playerFaction);
  const threshold = allowRelaxed ? ATTACK_RATIO_RELAXED : ATTACK_RATIO_STRICT;
  let best: { from: string; to: string; ratio: number; picked: string[]; troops: number } | null = null;

  for (const c of my) {
    if (c.troops < 6000) continue;
    const cd = cityDef(c.id);
    const available = officersIn(c.id, G.playerFaction).filter((o) => !o.acted);
    if (available.length === 0) continue;
    for (const adjId of cd.adj) {
      const t = G.cities[adjId];
      if (t.owner === G.playerFaction) continue;
      const maxTroops = Math.max(0, c.troops - 500);
      if (maxTroops < 500) continue;
      const picked = available.slice(0, 3).map((o) => o.id);
      const sendTroops = Math.floor(maxTroops * 0.85);
      const defOff = officersIn(adjId, t.owner).map((o) => o.id);
      const myPow = armyPower(sendTroops, picked);
      const defPow = armyPower(t.troops, defOff, t.walls);
      const ratio = myPow / Math.max(1, defPow);
      if (ratio >= threshold && (!best || ratio > best.ratio)) {
        best = { from: c.id, to: adjId, ratio, picked, troops: sendTroops };
      }
    }
  }
  if (!best) return null;
  return { kind: 'march-attack', cityId: best.from, targetCityId: best.to, picked: best.picked, troops: best.troops };
}

/** Move an officer-bearing stack toward an adjacent enemy (non-attacking) to consolidate. */
function pickBestMove(): AutoAction | null {
  if (G.cp <= 0) return null;
  const my = citiesOf(G.playerFaction);
  for (const c of my) {
    const cd = cityDef(c.id);
    const available = officersIn(c.id, G.playerFaction).filter((o) => !o.acted);
    if (available.length === 0) continue;
    // find adjacent friendly city that itself borders an enemy (front-line)
    for (const adjId of cd.adj) {
      if (G.cities[adjId].owner !== G.playerFaction) continue;
      const adjCd = cityDef(adjId);
      const frontline = adjCd.adj.some((a) => G.cities[a].owner !== G.playerFaction);
      if (!frontline) continue;
      const maxTroops = Math.max(0, c.troops - 500);
      if (maxTroops < 500) continue;
      return {
        kind: 'march-move',
        cityId: c.id,
        targetCityId: adjId,
        picked: available.slice(0, 3).map((o) => o.id),
        troops: Math.floor(maxTroops * 0.7),
      };
    }
  }
  return null;
}

/** Find a city with free officers that can be searched. */
function pickBestSearch(): AutoAction | null {
  if (G.cp <= 0) return null;
  const my = citiesOf(G.playerFaction);
  for (const c of my) {
    const free = freeOfficersIn(c.id);
    if (free.length === 0) continue;
    const searchers = officersIn(c.id, G.playerFaction).filter((o) => !o.acted);
    if (searchers.length === 0) continue;
    return { kind: 'search', cityId: c.id, officerId: searchers[0].id };
  }
  return null;
}

/** Find the weakest (lowest level) officer that can be trained. */
function pickBestTrain(): AutoAction | null {
  if (G.cp <= 0) return null;
  if (G.gold < 150) return null;  // pre-check so we don't pick a doomed target
  const my = officersOf(G.playerFaction)
    .filter((o) => !o.acted && G.gold >= 150)
    .sort((a, b) => a.level - b.level || a.exp - b.exp);
  if (my.length === 0) return null;
  return { kind: 'train', officerId: my[0].id };
}

/** Build a priority-ordered queue of full-scope actions for the player faction. */
function buildAutopilotQueue(allowRelaxed: boolean): AutoAction[] {
  const q: AutoAction[] = [];
  // P1 attack
  const atk = pickBestAttack(allowRelaxed);
  if (atk) q.push(atk);
  // P2 move
  const mv = pickBestMove();
  if (mv) q.push(mv);
  // P3 search (one)
  const sr = pickBestSearch();
  if (sr) q.push(sr);
  // P4 train (one)
  const tr = pickBestTrain();
  if (tr) q.push(tr);
  // P5 develop + recruit (A-scope)
  const my = citiesOf(G.playerFaction);
  for (const c of my) {
    const cd = cityDef(c.id);
    const adjacentHostile = cd.adj.some((a) => G.cities[a].owner !== G.playerFaction);
    if (c.farm < 2 && G.gold >= DEV_COST) q.push({ kind: 'farm', cityId: c.id });
    if (c.market < 2 && c.farm >= 2 && G.gold >= DEV_COST) q.push({ kind: 'market', cityId: c.id });
    if (adjacentHostile && c.walls < 3 && G.gold >= DEV_COST) q.push({ kind: 'walls', cityId: c.id });
    if (c.troops < 8000 && G.gold >= RECRUIT_COST_GOLD && G.food >= RECRUIT_COST_FOOD) {
      q.push({ kind: 'recruit', cityId: c.id });
    }
  }
  return q;
}

let autoStepIdx = 0;

/** Print a one-line summary of the planned queue before the autopilot drain starts. */
export function announceAutopilotPlan(): number {
  const allowRelaxed = G.cp >= 4;
  const queue = buildAutopilotQueue(allowRelaxed);
  autoStepIdx = 0;
  if (queue.length === 0) {
    bus.emit('log', `🤖 자동위임 계획: 명령할 행동 없음 (CP=${G.cp}, 금=${G.gold.toLocaleString()}, 식량=${G.food.toLocaleString()}).`, 'auto');
    return 0;
  }
  const grouped = new Map<string, number>();
  for (const a of queue) {
    const icon = ACTION_ICON[a.kind];
    grouped.set(icon, (grouped.get(icon) ?? 0) + 1);
  }
  const parts = [...grouped.entries()].map(([k, n]) => `${k} ×${n}`).join(', ');
  const mode = allowRelaxed ? '공격적' : '보수적';
  bus.emit('log', `🤖 자동위임 계획 (${mode}, CP=${G.cp}): ${queue.length}개 — ${parts}.`, 'auto');
  return queue.length;
}

/** Marker event so flow.ts knows a march battle resolved (then run autopilot again). */
export function autopilotMarchResult(setup: BattleSetup, result: BattleResult, auto: boolean): void {
  bus.emit('autopilotMarchResult', { setup, result, auto });
}

/**
 * Drain the autopilot queue one step at a time. Returns true if another step
 * can run (call again), false when done. For march-attack, returns a
 * 'pending' marker via the return object that flow.ts resolves and re-calls.
 *
 * When `silent=true` (autopilot mode), suppress in-modal popups from
 * searchTalent by passing through the search route without showing the
 * success modal — just log it instead.
 */
export function stepPlayerAutopilot(silent = false): boolean {
  if (!G || G.over) return false;
  if (G.cp <= 0) return false;
  const allowRelaxed = G.cp >= 4;
  const queue = buildAutopilotQueue(allowRelaxed);
  if (queue.length === 0) return false;

  for (const a of queue) {
    const cityName = a.cityId ? cityDef(a.cityId).name : '';
    autoStepIdx++;

    if (a.kind === 'march-attack' && a.targetCityId && a.picked && a.troops !== undefined) {
      const setup: BattleSetup = {
        attacker: G.playerFaction,
        defender: G.cities[a.targetCityId].owner,
        cityId: a.targetCityId,
        atkOfficers: a.picked,
        defOfficers: officersIn(a.targetCityId, G.cities[a.targetCityId].owner).slice(0, 3).map((o) => o.id),
        atkTroops: a.troops,
        defTroops: G.cities[a.targetCityId].troops,
        walls: G.cities[a.targetCityId].walls,
        playerSide: 'atk',
        sourceCityId: a.cityId!,
      };
      bus.emit('autopilotMarch', setup);
      // Caller (flow.ts) will resolve and re-call stepPlayerAutopilot when done.
      // We return false here to halt the chain; flow.ts re-enters after battle.
      return false;
    }

    if (a.kind === 'march-move' && a.targetCityId && a.picked && a.troops !== undefined) {
      const src = G.cities[a.cityId!];
      const before = src.troops;
      moveOfficers(a.cityId!, a.targetCityId, a.picked, a.troops);
      bus.emit('log', `🤖 #${autoStepIdx} ${cityName}→${cityDef(a.targetCityId).name} 🚩 이동 ✓ ${before.toLocaleString()}→${src.troops.toLocaleString()} (전선 보강) (남은 CP: ${G.cp}).`, 'auto');
      return G.cp > 0;
    }

    if (a.kind === 'search' && a.officerId && a.cityId) {
      const beforeGold = G.gold;
      // Inline the search to avoid modal popup: same logic but log instead of modal
      const searcher = G.officers[a.officerId];
      searcher.acted = true;
      G.cp--;
      const free = freeOfficersIn(a.cityId);
      const pol = effStat(searcher, 'pol');
      if (free.length === 0) {
        G.gold += 100;
        bus.emit('log', `🤖 #${autoStepIdx} ${cityName} 🔍 수색 ✓ 인재 없음, 세금 +100 금 (총 변화 ${(G.gold - beforeGold).toLocaleString()}) (남은 CP: ${G.cp}).`, 'auto');
      } else {
        const target = free[Math.floor(Math.random() * free.length)];
        const chance = 0.35 + pol / 200;
        if (Math.random() < chance) {
          target.faction = G.playerFaction;
          bus.emit('log', `🤖 #${autoStepIdx} ${cityName} 🔍 수색 ✓ ${officerDef(target.id).name} 합류! (금 변화 ${(G.gold - beforeGold).toLocaleString()}) (남은 CP: ${G.cp}).`, 'auto');
        } else {
          bus.emit('log', `🤖 #${autoStepIdx} ${cityName} 🔍 수색 — ${officerDef(target.id).name} 영입 실패 (금 변화 ${(G.gold - beforeGold).toLocaleString()}) (남은 CP: ${G.cp}).`, 'auto');
        }
      }
      return G.cp > 0;
    }

    if (a.kind === 'train' && a.officerId) {
      const beforeGold = G.gold;
      // ★ FIX: check return value — trainOfficer may fail (gold 부족, 이미 행동함)
      const ok = trainOfficer(a.officerId);
      if (!ok) {
        // trainOfficer already emitted its own warning log. Skip and try next action.
        bus.emit('log', `🤖 #${autoStepIdx} ${officerDef(a.officerId).name} 🎯 조련 ✗ 스킵.`, 'auto');
        continue;
      }
      bus.emit('log', `🤖 #${autoStepIdx} ${officerDef(a.officerId).name} 🎯 조련 ✓ (금 변화 ${(G.gold - beforeGold).toLocaleString()}) (남은 CP: ${G.cp}).`, 'auto');
      return G.cp > 0;
    }

    // ---- develop / recruit (A-scope, snapshot-based) ----
    if (a.kind === 'recruit' && a.cityId) {
      const c = G.cities[a.cityId];
      if (G.gold < RECRUIT_COST_GOLD) { bus.emit('log', `🤖 #${autoStepIdx} ${cityName} ⚔ 징병 ✗ 스킵 — 금 부족.`, 'auto'); continue; }
      if (G.food < RECRUIT_COST_FOOD) { bus.emit('log', `🤖 #${autoStepIdx} ${cityName} ⚔ 징병 ✗ 스킵 — 식량 부족.`, 'auto'); continue; }
      const before = c.troops;
      const ok = recruit(a.cityId);
      const after = c.troops;
      if (!ok || after === before) {
        bus.emit('log', `🤖 #${autoStepIdx} ${cityName} ⚔ 징병 ✗ 실패 (변화 없음).`, 'auto');
        continue;
      }
      bus.emit('log', `🤖 #${autoStepIdx} ${cityName} ⚔ 징병 ✓ ${before.toLocaleString()}→${after.toLocaleString()} (+${(after - before).toLocaleString()}) · -200 금 · -300 식량 (남은 CP: ${G.cp}, 금: ${G.gold.toLocaleString()}).`, 'auto');
      return G.cp > 0;
    }
    if ((a.kind === 'farm' || a.kind === 'market' || a.kind === 'walls') && a.cityId) {
      const c = G.cities[a.cityId];
      const max = a.kind === 'walls' ? 5 : 6;
      if (c[a.kind] >= max) { bus.emit('log', `🤖 #${autoStepIdx} ${cityName} ${ACTION_ICON[a.kind]} ✗ 스킵 — 이미 최고 레벨(${max}).`, 'auto'); continue; }
      if (G.gold < DEV_COST) { bus.emit('log', `🤖 #${autoStepIdx} ${cityName} ${ACTION_ICON[a.kind]} ✗ 스킵 — 금 부족.`, 'auto'); continue; }
      const before = c[a.kind];
      // ★ FIX: check return value (develop may fail on max level, gold shortage)
      if (develop(a.cityId, a.kind)) {
        bus.emit('log', `🤖 #${autoStepIdx} ${cityName} ${ACTION_ICON[a.kind]} ✓ Lv${before}→Lv${c[a.kind]} · -400 금 (남은 CP: ${G.cp}, 금: ${G.gold.toLocaleString()}).`, 'auto');
        return G.cp > 0;
      }
      continue;
    }
  }
  return false;
}

// ---------- events engine ----------

export function applyEffects(effects: { op: string; v: any; to?: string; amount?: number }[]) {
  for (const e of effects) {
    switch (e.op) {
      case 'gold': G.gold += e.v; break;
      case 'food': G.food += e.v; break;
      case 'troopsHome': {
        const home = citiesOf(G.playerFaction)[0];
        if (home) home.troops = Math.max(200, home.troops + e.v);
        break;
      }
      case 'expAll': for (const o of officersOf(G.playerFaction)) gainExp(o, e.v); break;
      case 'recruit': {
        const o = G.officers[e.v];
        if (o) { o.faction = G.playerFaction; o.city = citiesOf(G.playerFaction)[0]?.id ?? o.city; }
        break;
      }
      case 'reveal': break; // hidden flag lives in content; recruit overrides visibility
      case 'item': {
        // give to faction leader
        const leader = faction(G.playerFaction).leader;
        if (G.officers[leader]) G.officers[leader].item = e.v;
        bus.emit('log', `🎁 '${itemDef(e.v).name}'을(를) 획득!`);
        break;
      }
      case 'itemBest': {
        const best = officersOf(G.playerFaction).sort((a, b) => effStat(b, 'war') - effStat(a, 'war'))[0];
        if (best) { best.item = e.v; bus.emit('log', `🎁 ${officerDef(best.id).name}획득「${itemDef(e.v).name}」！`); }
        break;
      }
      case 'itemBestInt': {
        const best = officersOf(G.playerFaction).sort((a, b) => effStat(b, 'int') - effStat(a, 'int'))[0];
        if (best) { best.item = e.v; bus.emit('log', `🎁 ${officerDef(best.id).name}획득「${itemDef(e.v).name}」！`); }
        break;
      }
      case 'exile': {
        const o = G.officers[e.v];
        if (o && e.to) { o.faction = ''; o.city = e.to; }
        break;
      }
      case 'weakenFaction': {
        for (const c of citiesOf(e.v)) c.troops = Math.max(500, c.troops - (e.amount ?? 2000));
        break;
      }
      case 'log': bus.emit('log', e.v); break;
    }
  }
  bus.emit('refresh');
}

export function eligibleEvents(): EventDef[] {
  return content.events.filter((ev) => {
    const t = ev.trigger;
    if (t.once && G.firedEvents.includes(ev.id)) return false;
    if (t.minTurn && G.turn < t.minTurn) return false;
    if (t.maxTurn && G.turn > t.maxTurn) return false;
    if (t.month && monthOf(G.turn) !== t.month) return false;
    if (t.faction && G.playerFaction !== t.faction) return false;
    if (t.notFaction && G.playerFaction === t.notFaction) return false;
    if (t.ownsCity && G.cities[t.ownsCity]?.owner !== G.playerFaction) return false;
    if (t.officerFree && G.officers[t.officerFree]?.faction !== '') return false;
    if (t.factionAlive && citiesOf(t.factionAlive).length === 0) return false;
    if (t.chance !== undefined && Math.random() > t.chance) return false;
    return true;
  });
}

export function fireEvents() {
  const evs = eligibleEvents();
  // fire at most 1 narrative event per turn to avoid spam (intro always fires)
  for (const ev of evs.slice(0, 1)) {
    G.firedEvents.push(ev.id);
    bus.emit('modal', {
      title: ev.title,
      text: ev.text,
      choices: ev.choices.map((ch: EventChoice) => ({
        label: ch.label,
        disabled: ch.requireGold !== undefined && G.gold < ch.requireGold,
        effects: ch.effects,
      })),
    });
  }
}
