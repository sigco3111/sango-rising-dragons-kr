import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MapScene } from './scenes/MapScene';
import { BattleScene } from './scenes/BattleScene';
import { content, faction } from './content';
import { G, bus, newGame, loadGame, hasSave, startPlayerTurn, fireEvents } from './state';
import { initHud, showGameUi, log } from './hud';
import type { BattleSetup } from './types';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#0d0b07',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, MapScene, BattleScene],
});

// only Boot runs at startup; Map starts after faction pick
game.scene.stop('Map');
game.scene.stop('Battle');

// ---------------- audio ----------------
const SFX: Record<string, string> = {
  click: 's_click', select: 's_select', confirm: 's_confirm', error: 's_error',
  open: 's_page', back: 's_back', move: 's_move', build: 's_build', recruit: 's_recruit',
  hit: 's_hit', hit2: 's_hit2', die: 's_die', skill: 's_skill', fire: 's_fire',
  duel: 's_duel', heal: 's_heal', guard: 's_guard', arrow: 's_arrow',
  victory: 's_victory', defeat: 's_defeat',
};
// ---------------- music ----------------
let currentMusic: Phaser.Sound.BaseSound | null = null;
let currentTrack = '';
bus.on('music', (track: 'map' | 'battle' | 'off') => {
  const key = track === 'map' ? 'music_map' : 'music_battle';
  if (track !== 'off' && currentTrack === key) return;
  currentMusic?.stop();
  currentMusic?.destroy();
  currentMusic = null;
  currentTrack = '';
  if (track === 'off') return;
  try {
    currentMusic = game.sound.add(key, { loop: true, volume: track === 'map' ? 0.22 : 0.3 });
    currentMusic.play();
    currentTrack = key;
  } catch { /* audio locked until user gesture */ }
});
// browsers block audio until first interaction — retry once unlocked
game.sound.once('unlocked', () => {
  const t = currentTrack;
  currentTrack = '';
  if (t) bus.emit('music', t === 'music_map' ? 'map' : 'battle');
});

bus.on('sfx', (name: string) => {
  const key = SFX[name];
  if (key && game.sound) {
    try { game.sound.play(key, { volume: name.startsWith('hit') || name === 'die' ? 0.5 : 0.4 }); } catch { /* ignore */ }
  }
});

// ---------------- battle launching ----------------
bus.on('launchBattle', (setup: BattleSetup) => {
  document.getElementById('side')!.classList.add('hidden');
  bus.emit('citySelected', null);
  game.scene.sleep('Map');
  game.scene.start('Battle', { setup });
});

// ---------------- title screen ----------------
function buildTitle() {
  const pick = document.getElementById('factionPick')!;
  pick.innerHTML = '';
  for (const f of content.factions.filter((f) => f.playable)) {
    const card = document.createElement('div');
    card.className = 'fcard';
    card.style.setProperty('--c', f.color);
    const sentences = f.desc.split('。').filter((s) => s.length > 0);
    card.innerHTML = `<div class="fzh">${f.zh}</div><h3>${f.name}</h3>
      <div class="leader">${sentences[0] ?? ''}。</div>
      <p>${sentences.slice(1).join('。')}${sentences.length > 1 ? '。' : ''}</p>`;
    card.onclick = () => startCampaign(f.id);
    pick.appendChild(card);
  }
  if (hasSave()) {
    document.getElementById('continueRow')!.classList.remove('hidden');
    (document.getElementById('continueBtn') as HTMLButtonElement).onclick = () => {
      if (loadGame()) beginPlay(false);
    };
  }
}

function startCampaign(factionId: string) {
  newGame(factionId);
  beginPlay(true);
}

function beginPlay(fresh: boolean) {
  document.getElementById('title')!.classList.add('hidden');
  game.scene.start('Map');
  showGameUi();
  bus.emit('sfx', 'confirm');
  if (fresh) {
    startPlayerTurn();
    fireEvents();
    log(`🏯 출정이 시작됩니다 — 당신은 ${faction(G.playerFaction).name}을(를) 이끕니다. 12개 성도를 점령하면 천하를 통일합니다!`);
  } else {
    log('💾 세이브를 불러왔습니다. 출정을 계속합니다.');
  }
  bus.emit('refresh');
}

bus.once('contentReady', () => {
  initHud();
  buildTitle();
});

(window as any).__sango = { game, bus, getG: () => G };
