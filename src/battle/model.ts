import { G, effStat, gainExp, bus, captureCity } from '../state';
import type { BattleSetup, BattleResult } from '../types';

/** Rough army strength estimate, used by auto-resolve and the AI. */
export function armyPower(troops: number, officerIds: string[], walls = 0): number {
  let bestWar = 40, bestLdr = 40;
  for (const id of officerIds) {
    const o = G.officers[id];
    if (!o) continue;
    bestWar = Math.max(bestWar, effStat(o, 'war'));
    bestLdr = Math.max(bestLdr, effStat(o, 'ldr'));
  }
  return troops * (1 + bestWar / 150 + bestLdr / 200) * (1 + walls * 0.09);
}

export function autoResolve(setup: BattleSetup): BattleResult {
  const atkPow = armyPower(setup.atkTroops, setup.atkOfficers) * (0.9 + Math.random() * 0.25);
  const defPow = armyPower(setup.defTroops, setup.defOfficers, setup.walls) * (0.9 + Math.random() * 0.25);
  const total = atkPow + defPow;
  // losses proportional to enemy power share
  const atkLossRatio = Math.min(0.95, defPow / total * 1.1);
  const defLossRatio = Math.min(0.95, atkPow / total * 1.1);
  const atkRemaining = Math.max(0, Math.floor(setup.atkTroops * (1 - atkLossRatio)));
  const defRemaining = Math.max(0, Math.floor(setup.defTroops * (1 - defLossRatio)));
  const winner: 'atk' | 'def' = atkPow > defPow ? 'atk' : 'def';
  return {
    winner,
    atkRemaining: winner === 'atk' ? Math.max(100, atkRemaining) : atkRemaining,
    defRemaining: winner === 'def' ? Math.max(100, defRemaining) : defRemaining,
  };
}

/** Apply a finished battle to the campaign map. */
export function applyBattleResult(setup: BattleSetup, result: BattleResult) {
  const city = G.cities[setup.cityId];
  if (result.winner === 'atk') {
    captureCity(setup.cityId, setup.attacker, result.atkRemaining, setup.atkOfficers);
  } else {
    city.troops = Math.max(100, result.defRemaining);
    // surviving attackers retreat home
    if (setup.sourceCityId && result.atkRemaining > 0) {
      G.cities[setup.sourceCityId].troops += result.atkRemaining;
    }
    for (const id of setup.atkOfficers) {
      if (setup.sourceCityId) G.officers[id].city = setup.sourceCityId;
    }
  }
  // experience for both sides' officers
  const expWin = 80, expLose = 35;
  for (const id of setup.atkOfficers) {
    const o = G.officers[id];
    if (o) gainExp(o, result.winner === 'atk' ? expWin : expLose);
  }
  for (const id of setup.defOfficers) {
    const o = G.officers[id];
    if (o) gainExp(o, result.winner === 'def' ? expWin : expLose);
  }
  bus.emit('refresh');
}
