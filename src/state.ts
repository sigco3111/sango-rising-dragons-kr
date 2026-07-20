import Phaser from 'phaser';
import { content, cityDef, officerDef, itemDef, faction } from './content';
import type { GameState, CityState, OfficerState, EventDef, EventChoice, OfficerDef } from './types';

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
  G.gold -= RECRUIT_COST_GOLD; G.food -= RECRUIT_COST_FOOD;
  G.cities[cityId].troops += RECRUIT_AMOUNT;
  bus.emit('sfx', 'recruit');
  bus.emit('log', `⚔ ${cityDef(cityId).name}에서 신병 ${RECRUIT_AMOUNT}명 모집.`);
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

// ---------- autopilot queue (A-scope: develop + recruit only) ----------
//
// 정책: 1) 식량 부족(farm<2) 도시 → 개간 2) 인접 적지 있는 미보강 도시(farm≥2) → 통상
//       3) 병력<8k 도시 → 징병 4) 벽<3이고 인접 적지 → 축성. CP 소진/실패 시 종료.

interface AutoAction {
  cityId: string;
  kind: 'farm' | 'market' | 'walls' | 'recruit';
}

/** Build a priority-ordered queue of A-scope actions for the player faction. */
function buildAutopilotQueue(): AutoAction[] {
  const my = citiesOf(G.playerFaction);
  if (my.length === 0) return [];
  const q: AutoAction[] = [];

  for (const c of my) {
    const cd = cityDef(c.id);
    const adjacentHostile = cd.adj.some((a) => G.cities[a].owner !== G.playerFaction);

    // 1) famine guard — push farm to 2 first
    if (c.farm < 2 && G.gold >= DEV_COST) q.push({ cityId: c.id, kind: 'farm' });
    // 2) market for income baseline
    if (c.market < 2 && c.farm >= 2 && G.gold >= DEV_COST) q.push({ cityId: c.id, kind: 'market' });
    // 4) walls under 3 AND adjacent hostile → prioritize walls
    if (adjacentHostile && c.walls < 3 && G.gold >= DEV_COST) q.push({ cityId: c.id, kind: 'walls' });
    // 3) low troops → recruit
    if (c.troops < 8000 && G.gold >= RECRUIT_COST_GOLD && G.food >= RECRUIT_COST_FOOD) {
      q.push({ cityId: c.id, kind: 'recruit' });
    }
  }
  // round-robin by kind so cities don't all spend CP on one track
  q.sort((a, b) => (a.kind === b.kind ? 0 : a.kind < b.kind ? -1 : 1));
  return q;
}

/**
 * Drain the autopilot queue one step at a time. Returns true if another step
 * can run (call again), false when done. Caller must gate with isBusy()/G.over
 * and emit 'refresh' between steps if it wants UI updates between actions.
 */
export function stepPlayerAutopilot(): boolean {
  if (!G || G.over) return false;
  // 1) defend first if any enemy battle is pending for player — handled in flow.ts via promptDefense
  const queue = buildAutopilotQueue();
  if (queue.length === 0 || G.cp <= 0) return false;
  // Try first actionable item; if blocked (e.g. gold just drained), skip it.
  for (const a of queue) {
    if (a.kind === 'recruit') {
      if (recruit(a.cityId)) return G.cp > 0;
      continue;
    }
    if (develop(a.cityId, a.kind)) return G.cp > 0;
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
