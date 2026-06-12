import Phaser from 'phaser';
import { loadContent } from '../content';
import { bus } from '../state';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    // custom SVG pixel-art units (tools/gen-pixel-art.mjs)
    for (const t of ['infantry', 'cavalry', 'archer']) {
      this.load.svg(`px_${t}`, `assets/px/${t}.svg`, { width: 64, height: 64 });
    }
    this.load.image('keep', 'assets/med/medievalStructure_05.png');
    this.load.image('tree', 'assets/med/medievalEnvironment_01.png');
    this.load.image('rock', 'assets/med/medievalEnvironment_10.png');
    // cartography pack — strategic map art
    for (const n of ['parchmentBasic', 'castle', 'castleWide', 'tower', 'towerWatch', 'rocksMountain', 'rocksTall', 'treeTall', 'treePines', 'compass', 'ship', 'bridge', 'mill']) {
      this.load.image(`c_${n}`, `assets/carto/${n}.png`);
    }
    this.load.audio('music_map', 'assets/audio/music_map.ogg');
    this.load.audio('music_battle', 'assets/audio/music_battle.ogg');
    this.load.audio('s_page', 'assets/audio/bookFlip2.ogg');
    this.load.audio('s_slice', 'assets/audio/knifeSlice.ogg');

    const sounds: [string, string][] = [
      ['s_click', 'click_001'], ['s_select', 'click_002'], ['s_confirm', 'confirmation_001'],
      ['s_error', 'error_001'], ['s_open', 'open_001'], ['s_back', 'close_001'],
      ['s_move', 'drop_001'], ['s_build', 'maximize_001'], ['s_recruit', 'select_001'],
      ['s_hit', 'impactPlate_medium_000'], ['s_hit2', 'impactMetal_medium_000'],
      ['s_die', 'impactSoft_heavy_000'], ['s_skill', 'impactMetal_heavy_000'],
      ['s_fire', 'impactMining_000'], ['s_duel', 'impactMetal_heavy_000'],
      ['s_heal', 'glass_001'], ['s_guard', 'impactPlate_medium_000'],
      ['s_arrow', 'impactPunch_medium_000'],
      ['s_victory', 'confirmation_001'], ['s_defeat', 'bong_001'],
    ];
    for (const [key, file] of sounds) this.load.audio(key, `assets/audio/${file}.ogg`);
  }

  create() {
    loadContent()
      .then(() => bus.emit('contentReady'))
      .catch((err) => console.error('Content load failed:', err));
  }
}
