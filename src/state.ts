import Phaser from 'phaser';
import { content, cityDef, officerDef, itemDef, faction } from './content';
import type { GameState, CityState, OfficerState, EventDef, EventChoice, OfficerDef } from './types';

export const bus = new Phaser.Events.EventEmitter();

export let G: GameState = null as any;

const SAVE_KEY = 'sango_save_v1';

// ---------- helpers ----------

export function monthOf(turn: number) { return ((turn - 1) % 12) + 1; }
export function yearOf(turn: number) { return 190 + Math.floor((turn - 1) / 12); }
export function seasonOf(turn: number) {
  const m = monthOf(turn);
  return m <= 3 ? '春' : m <= 6 ? '夏' : m <= 9 ? '秋' : '冬';
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
      bus.emit('log', `⬆ ${officerDef(o.id).name} 升到了 Lv${o.level}！`);
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
    bus.emit('log', '⚠ 糧倉空虛！士卒因飢餓而逃亡。');
  }
  G.cp = maxCp();
  for (const o of officersOf(G.playerFaction)) o.acted = false;
  bus.emit('refresh');
}

// ---------- player actions (cost CP) ----------

export function spendCp(n = 1): boolean {
  if (G.cp < n) { bus.emit('log', '⚠ 指令點已用盡——請結束回合。'); return false; }
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
  if (c[kind] >= max) { bus.emit('log', '⚠ 已達最高等級。'); return false; }
  if (G.gold < DEV_COST) { bus.emit('log', '⚠ 金錢不足。'); return false; }
  if (!spendCp()) return false;
  G.gold -= DEV_COST;
  c[kind]++;
  bus.emit('sfx', 'build');
  bus.emit('log', `🏗 ${cityDef(cityId).name}：${kind === 'farm' ? '農田' : kind === 'market' ? '市集' : '城牆'}提升至 ${c[kind]} 級。`);
  bus.emit('refresh');
  return true;
}

export function recruit(cityId: string): boolean {
  if (G.gold < RECRUIT_COST_GOLD || G.food < RECRUIT_COST_FOOD) {
    bus.emit('log', '⚠ 徵兵需要200金與300糧。'); return false;
  }
  if (!spendCp()) return false;
  G.gold -= RECRUIT_COST_GOLD; G.food -= RECRUIT_COST_FOOD;
  G.cities[cityId].troops += RECRUIT_AMOUNT;
  bus.emit('sfx', 'recruit');
  bus.emit('log', `⚔ ${cityDef(cityId).name}徵得新兵 ${RECRUIT_AMOUNT} 人。`);
  bus.emit('refresh');
  return true;
}

/** Send an officer to find free officers hiding in a city. */
export function searchTalent(cityId: string, searcherId: string): boolean {
  const searcher = G.officers[searcherId];
  if (searcher.acted) { bus.emit('log', '⚠ 該將領本回合已行動。'); return false; }
  if (!spendCp()) return false;
  searcher.acted = true;
  const free = freeOfficersIn(cityId);
  const pol = effStat(searcher, 'pol');
  if (free.length === 0) {
    G.gold += 100;
    bus.emit('log', `🔍 ${officerDef(searcherId).name}在${cityDef(cityId).name}未尋得賢才，但徵得賦稅100金。`);
  } else {
    const target = free[Math.floor(Math.random() * free.length)];
    const chance = 0.35 + pol / 200;
    if (Math.random() < chance) {
      target.faction = G.playerFaction;
      bus.emit('sfx', 'recruit');
      bus.emit('modal', {
        title: '賢才來投！',
        text: `${officerDef(searcherId).name}說動了名震一方的${officerDef(target.id).name}，使其加入我軍麾下！`,
        choices: [{ label: '歡迎之至！', effects: [] }],
      });
    } else {
      bus.emit('log', `🔍 ${officerDef(searcherId).name}聽聞${officerDef(target.id).name}在${cityDef(cityId).name}出沒，可惜未能會面。`);
    }
  }
  bus.emit('refresh');
  return true;
}

export function trainOfficer(officerId: string): boolean {
  const o = G.officers[officerId];
  if (o.acted) { bus.emit('log', '⚠ 該將領本回合已行動。'); return false; }
  if (G.gold < 150) { bus.emit('log', '⚠ 操練需要150金。'); return false; }
  if (!spendCp()) return false;
  o.acted = true;
  G.gold -= 150;
  gainExp(o, 40 + Math.floor(Math.random() * 30));
  bus.emit('log', `🎯 ${officerDef(officerId).name}操練兵馬。（經驗提升）`);
  bus.emit('refresh');
  return true;
}

export function moveOfficers(from: string, to: string, officerIds: string[], troops: number) {
  const src = G.cities[from];
  const dst = G.cities[to];
  src.troops -= troops;
  dst.troops += troops;
  for (const id of officerIds) { G.officers[id].city = to; G.officers[id].acted = true; }
  bus.emit('log', `🚩 ${troops.toLocaleString()} 兵力自${cityDef(from).name}移往${cityDef(to).name}。`);
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
    bus.emit('log', `💀 ${faction(oldOwner).name}已遭殲滅！`);
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
        bus.emit('log', `🎁 獲得「${itemDef(e.v).name}」！`);
        break;
      }
      case 'itemBest': {
        const best = officersOf(G.playerFaction).sort((a, b) => effStat(b, 'war') - effStat(a, 'war'))[0];
        if (best) { best.item = e.v; bus.emit('log', `🎁 ${officerDef(best.id).name}獲得「${itemDef(e.v).name}」！`); }
        break;
      }
      case 'itemBestInt': {
        const best = officersOf(G.playerFaction).sort((a, b) => effStat(b, 'int') - effStat(a, 'int'))[0];
        if (best) { best.item = e.v; bus.emit('log', `🎁 ${officerDef(best.id).name}獲得「${itemDef(e.v).name}」！`); }
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
