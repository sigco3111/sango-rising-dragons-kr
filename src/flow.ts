import { G, bus, saveGame, startPlayerTurn, fireEvents, checkVictory, getAutopilot, stepPlayerAutopilot, announceAutopilotPlan } from './state';
import { runAiTurns } from './ai';
import { autoResolve, applyBattleResult } from './battle/model';
import { cityDef, faction, officerDef } from './content';
import type { BattleSetup, BattleResult } from './types';

/**
 * Turn sequencing: player acts → endTurn() → AI factions act (a defense
 * battle may interrupt) → month advances → income + events → player acts.
 *
 * Autopilot (full scope: develop + recruit + search + train + march):
 *   - endTurn() drains the full action queue, then chains to AI.
 *   - Defense battles always run auto-resolve directly when autopilot is ON.
 *   - The march choice modal is skipped entirely under autopilot; we auto-resolve.
 *   - Set `combatMode = 'auto' | 'manual'` per battle via setup if you want to override.
 */

let aiResumeIndex = 0;
let busy = false;

export function isBusy() { return busy; }

export function endTurn() {
  if (busy || G.over) return;
  busy = true;
  bus.emit('refresh');
  if (getAutopilot()) {
    announceAutopilotPlan();
    bus.emit('log', '🤖 자동위임 시작 — 모든 플레이어 행동을 위임합니다.', 'auto');
    runAutopilotTurn();
    return;
  }
  continueAi(0);
}

/**
 * Drain the autopilot queue step by step, then chain to AI.
 * - 'autopilotMarch' event halts us until flow.ts resolves the battle and re-calls.
 * - setTimeout 220ms keeps UI readable (each step paints).
 */
function runAutopilotTurn() {
  if (!G || G.over || G.cp <= 0) { continueAi(0); return; }
  // Safety net: cap total attempts per drain to avoid infinite loops if a bug slips through.
  if ((runAutopilotTurn as any)._depth === undefined) (runAutopilotTurn as any)._depth = 0;
  (runAutopilotTurn as any)._depth++;
  if ((runAutopilotTurn as any)._depth > 50) {
    (runAutopilotTurn as any)._depth = 0;
    bus.emit('log', '🤖 ⚠ 자동위임 안전 종료 (50회 시도 초과).', 'auto');
    continueAi(0);
    return;
  }
  setTimeout(() => {
    if (!busy || G.over) { (runAutopilotTurn as any)._depth = 0; return; }
    const more = stepPlayerAutopilot(true);
    bus.emit('refresh');
    if (more) {
      runAutopilotTurn();
    } else {
      if (!pendingMarch) {
        (runAutopilotTurn as any)._depth = 0;
        bus.emit('log', '🤖 자동위임 종료 — AI 턴으로 넘어갑니다.', 'auto');
        continueAi(0);
      }
    }
  }, 220);
}

let pendingMarch: BattleSetup | null = null;

// Hand off march battles the autopilot queued — auto-resolve them silently and
// re-enter the autopilot queue so the campaign keeps rolling.
bus.on('autopilotMarch', (setup: BattleSetup) => {
  if (!getAutopilot()) return; // safety
  pendingMarch = setup;
  const fromName = cityDef(setup.sourceCityId!).name;
  const toName = cityDef(setup.cityId).name;
  const ratio = setup.atkTroops * (1 + 60 / 150) / Math.max(1, setup.defTroops * (1 + 60 / 150) * (1 + setup.walls * 0.09));
  bus.emit('log', `🤖 자동 출정: ${fromName}→${toName} 공격 (${setup.atkTroops.toLocaleString()} vs ${setup.defTroops.toLocaleString()}, 성벽 ${setup.walls}, 비율 ≈${ratio.toFixed(2)}) — 자동 결산.`, 'auto');
  // Pay CP and mark officers (mirrors hud's marchDialog hostile path)
  G.cp--;
  for (const id of setup.atkOfficers) G.officers[id].acted = true;
  const result = autoResolve(setup);
  const won = result.winner === 'atk';
  bus.emit('log', `🤖 자동 출정: ${fromName}→${toName} ${won ? '🏴 함락!' : '💥 공격 실패'} (${setup.atkTroops.toLocaleString()} vs ${setup.defTroops.toLocaleString()}, 성벽 ${setup.walls}, 비율 ≈${ratio.toFixed(2)}) — 아군 잔여 ${result.atkRemaining.toLocaleString()}, 적 잔여 ${result.defRemaining.toLocaleString()}.`, 'auto');
  // IMPORTANT: applyBattleResult expects source troop to already be debited (hud convention).
  // For autopilot, we *don't* pre-debit — so we add and then immediately subtract our sendTroops
  // from source, then applyBattleResult's retreat+ path becomes a no-op for us (since atkRemaining
  // is part of our sent troops, and we want them all back at source). Simpler: just debit before.
  G.cities[setup.sourceCityId!].troops = Math.max(0, G.cities[setup.sourceCityId!].troops - setup.atkTroops);
  applyBattleResult(setup, result);
  bus.emit('refresh');
  pendingMarch = null;
  runAutopilotTurn();
});

function continueAi(startIndex: number) {
  (runAutopilotTurn as any)._depth = 0;  // reset safety counter when leaving autopilot
  const { pendingBattle, nextIndex } = runAiTurns(startIndex);
  aiResumeIndex = nextIndex;
  if (pendingBattle) {
    promptDefense(pendingBattle);
  } else {
    finishTurn();
  }
}

function promptDefense(setup: BattleSetup) {
  const atk = faction(setup.attacker).name;
  const city = cityDef(setup.cityId).name;
  // Autopilot ON → skip the prompt and auto-resolve the defense directly.
  if (getAutopilot()) {
    bus.emit('log', `🤖 자동위임 — ${city} 방어 (적 ${setup.atkTroops.toLocaleString()} vs 아군 ${setup.defTroops.toLocaleString()}, 성벽 ${setup.walls}) 자동 결산.`, 'auto');
    const r = autoResolve(setup);
    reportBattle(setup, r);
    applyBattleResult(setup, r);
    afterBattle();
    return;
  }
  bus.emit('modal', {
    title: `${city}告急！`,
    text: `${atk}率 ${setup.atkTroops.toLocaleString()} 大軍進犯${city}！\n\n我方守軍：${setup.defTroops.toLocaleString()} 兵力，城牆 ${setup.walls} 級。`,
    choices: [
      { label: '⚔ 親臨城頭，指揮守城（戰術戰鬥）', onPick: () => bus.emit('launchBattle', setup) },
      { label: '⚡ 委由守將應戰（自動結算）', onPick: () => { const r = autoResolve(setup); reportBattle(setup, r); applyBattleResult(setup, r); afterBattle(); } },
    ],
  });
}

export function reportBattle(setup: BattleSetup, r: BattleResult) {
  const city = cityDef(setup.cityId).name;
  const won = (setup.playerSide === 'atk' && r.winner === 'atk') || (setup.playerSide === 'def' && r.winner === 'def');
  if (setup.playerSide !== 'none') {
    bus.emit('banner', won ? '勝利' : '敗北');
    bus.emit('sfx', won ? 'victory' : 'defeat');
    bus.emit('log', won ? `🏆 ${city}之戰大獲全勝！` : `💔 ${city}之戰落敗……`, 'battle');
  }
}

/** Called when a tactical battle scene finishes (already applied). */
export function onBattleComplete() {
  checkVictory();
  afterBattle();
}

function afterBattle() {
  if (busy) {
    continueAi(aiResumeIndex);
  } else {
    bus.emit('refresh');
    saveGame();
  }
}

function finishTurn() {
  G.turn++;
  busy = false;
  startPlayerTurn();
  fireEvents();
  saveGame();
  bus.emit('refresh');
}
