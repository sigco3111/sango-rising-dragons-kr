import { G, bus, saveGame, startPlayerTurn, fireEvents, checkVictory } from './state';
import { runAiTurns } from './ai';
import { autoResolve, applyBattleResult } from './battle/model';
import { cityDef, faction } from './content';
import type { BattleSetup, BattleResult } from './types';

/**
 * Turn sequencing: player acts → endTurn() → AI factions act (a defense
 * battle may interrupt) → month advances → income + events → player acts.
 */

let aiResumeIndex = 0;
let busy = false;

export function isBusy() { return busy; }

export function endTurn() {
  if (busy || G.over) return;
  busy = true;
  bus.emit('refresh');
  continueAi(0);
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
