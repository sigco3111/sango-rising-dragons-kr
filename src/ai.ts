import { G, citiesOf, officersIn, bus, captureCity } from './state';
import { content, cityDef, faction } from './content';
import { armyPower, autoResolve, applyBattleResult } from './battle/model';
import type { BattleSetup } from './types';

/**
 * Runs every AI faction's turn. Returns a BattleSetup if an AI attacks a
 * player-owned city (the player then fights the defense battle), else null.
 * Call again after that battle resolves to continue remaining factions.
 */
export function runAiTurns(startIndex = 0): { pendingBattle: BattleSetup | null; nextIndex: number } {
  const factions = content.factions.filter((f) => f.id !== G.playerFaction && f.id !== 'neutral');
  for (let i = startIndex; i < factions.length; i++) {
    const f = factions[i];
    const cities = citiesOf(f.id);
    if (cities.length === 0) continue;

    // --- economy: income, recruit, develop ---
    G.aiGold[f.id] = (G.aiGold[f.id] ?? 0) + cities.reduce((s, c) => s + 80 + c.market * 60, 0);
    for (const c of cities) {
      if (G.aiGold[f.id] > 500 && c.troops < 16000) {
        c.troops += 1200;
        G.aiGold[f.id] -= 200;
      }
      if (G.aiGold[f.id] > 900 && Math.random() < 0.4) {
        const kind = (['farm', 'market', 'walls'] as const)[Math.floor(Math.random() * 3)];
        if (c[kind] < 5) { c[kind]++; G.aiGold[f.id] -= 400; }
      }
    }

    // --- aggression: B안 약화 — threshold 1.45→1.7, chance 65%→40% ---
    let best: { from: string; to: string; ratio: number } | null = null;
    for (const c of cities) {
      if (c.troops < 6000) continue;
      for (const adjId of cityDef(c.id).adj) {
        const t = G.cities[adjId];
        if (t.owner === f.id) continue;
        const myOff = officersIn(c.id, f.id).map((o) => o.id);
        const defOff = officersIn(adjId, t.owner).map((o) => o.id);
        const myPow = armyPower(Math.floor(c.troops * 0.75), myOff);
        const defPow = armyPower(t.troops, defOff, t.walls);
        const ratio = myPow / Math.max(1, defPow);
        if (ratio > 1.7 && (!best || ratio > best.ratio)) best = { from: c.id, to: adjId, ratio };
      }
    }
    if (best && Math.random() < 0.4) {
      const src = G.cities[best.from];
      const tgt = G.cities[best.to];
      const sendTroops = Math.floor(src.troops * 0.75);
      src.troops -= sendTroops;
      const atkOfficers = officersIn(best.from, f.id).slice(0, 3).map((o) => o.id);
      const defOfficers = officersIn(best.to, tgt.owner).slice(0, 3).map((o) => o.id);
      const setup: BattleSetup = {
        attacker: f.id, defender: tgt.owner, cityId: best.to,
        atkOfficers, defOfficers,
        atkTroops: sendTroops, defTroops: tgt.troops, walls: tgt.walls,
        playerSide: tgt.owner === G.playerFaction ? 'def' : 'none',
        sourceCityId: best.from,
      };
      if (setup.playerSide === 'def') {
        bus.emit('log', `🔥 ${faction(f.id).name}進軍${cityDef(best.to).name}！`, 'battle');
        return { pendingBattle: setup, nextIndex: i + 1 };
      }
      // AI vs AI / neutral: auto-resolve silently
      const result = autoResolve(setup);
      applyBattleResult(setup, result);
      if (result.winner === 'atk') {
        bus.emit('log', `⚔ ${faction(f.id).name}自${faction(tgt.owner === f.id ? setup.defender : tgt.owner).name}手中奪下${cityDef(best.to).name}。`, 'battle');
      }
    }
  }
  return { pendingBattle: null, nextIndex: factions.length };
}