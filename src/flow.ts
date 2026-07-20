import { G, bus, saveGame, startPlayerTurn, fireEvents, checkVictory, getAutopilot, stepPlayerAutopilot, announceAutopilotPlan } from './state';
import { runAiTurns } from './ai';
import { autoResolve, applyBattleResult } from './battle/model';
import { cityDef, faction } from './content';
import type { BattleSetup, BattleResult } from './types';

/**
 * Turn sequencing: player acts → endTurn() → AI factions act (a defense
 * battle may interrupt) → month advances → income + events → player acts.
 *
 * Autopilot (A-scope: develop + recruit only):
 *   - getAutopilot() ON  → endTurn() drains the player action queue, then chains to AI.
 *   - getAutopilot() OFF → manual flow (user clicks cities).
 *   - Defense battles always run the AI side directly when autopilot is ON.
 *   - Combat / march / search / train stay manual (per A안 policy).
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
    bus.emit('log', '🤖 자동위임 시작 — 플레이어 행동을 위임합니다.', 'auto');
    runAutopilotTurn();
    return;
  }
  continueAi(0);
}

/** Drain the autopilot queue step by step, then chain to AI. */
function runAutopilotTurn() {
  if (!G || G.over || G.cp <= 0) { continueAi(0); return; }
  // Each step runs synchronously; small delay so UI can paint between actions.
  setTimeout(() => {
    if (!busy || G.over) return;
    const more = stepPlayerAutopilot();
    bus.emit('refresh');
    if (more) runAutopilotTurn();
    else {
      bus.emit('log', '🤖 자동위임 종료 — AI 턴으로 넘어갑니다.', 'auto');
      continueAi(0);
    }
  }, 220);
}

function continueAi(startIndex: number) {
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
