import Phaser from 'phaser';
import { G, bus, effStat, gainExp } from '../state';
import { officerDef, skillDef, faction, cityDef, itemDef } from '../content';
import { applyBattleResult } from '../battle/model';
import { reportBattle, onBattleComplete } from '../flow';
import type { BattleSetup, BattleResult, TroopType, SkillDef } from '../types';

const COLS = 12, ROWS = 7, CELL = 72;
const OX = (1280 - COLS * CELL) / 2, OY = 92;
const MAX_ROUNDS = 14;

type Terrain = 'plain' | 'forest' | 'hill' | 'river';

interface BUnit {
  id: number;
  officerId: string | null;
  name: string; zh: string;
  side: 'atk' | 'def';
  troop: TroopType;
  war: number; int: number; ldr: number;
  skill: string; cd: number;
  hp: number; maxHp: number;
  move: number; range: number;
  gx: number; gy: number;
  done: boolean; guarding: boolean; dead: boolean;
  sprite: Phaser.GameObjects.Container;
  hpBar: Phaser.GameObjects.Rectangle;
  level: number;
}

const TROOP_MOVE: Record<TroopType, number> = { infantry: 3, cavalry: 4, archer: 3 };
const TROOP_RANGE: Record<TroopType, number> = { infantry: 1, cavalry: 1, archer: 2 };
const TROOP_ICONS: Record<TroopType, string> = { infantry: '🛡', cavalry: '🐎', archer: '🏹' };

export class BattleScene extends Phaser.Scene {
  private setup!: BattleSetup;
  private terrain: Terrain[][] = [];
  private units: BUnit[] = [];
  private nextId = 1;
  private round = 1;
  private phase: 'player' | 'enemy' | 'over' = 'player';
  private playerSide: 'atk' | 'def' = 'atk';
  private sel: BUnit | null = null;
  private mode: 'idle' | 'moved' | 'skill' = 'idle';
  private hl: Phaser.GameObjects.Rectangle[] = [];
  private terrainSprites: Phaser.GameObjects.GameObject[] = [];
  private busyAnim = false;

  constructor() { super('Battle'); }

  init(data: { setup: BattleSetup }) {
    this.setup = data.setup;
    this.playerSide = data.setup.playerSide === 'def' ? 'def' : 'atk';
    this.units = [];
    this.terrain = [];
    this.round = 1;
    this.phase = 'player';
    this.sel = null;
    this.mode = 'idle';
    this.nextId = 1;
    this.busyAnim = false;
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a2416');
    this.genTerrain();
    this.drawBoard();
    this.spawnArmies();
    this.drawHeader();
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) { this.clearSel(); this.updateHud(); }
    });
    this.updateTurnLabel();
    this.updateHud();
    document.getElementById('battleTurn')!.classList.remove('hidden');
    document.getElementById('battleHud')!.classList.remove('hidden');
    bus.emit('music', 'battle');
  }

  // ============================== board ==============================

  private genTerrain() {
    const riverCol = Phaser.Math.Between(5, 7);
    const bridges = [Phaser.Math.Between(1, 2), Phaser.Math.Between(4, 5)];
    for (let y = 0; y < ROWS; y++) {
      this.terrain[y] = [];
      for (let x = 0; x < COLS; x++) {
        let t: Terrain = 'plain';
        const hasRiver = this.setup.walls < 2; // walled cities fight on dry ground
        if (hasRiver && x === riverCol && !bridges.includes(y)) t = 'river';
        else if (Math.random() < 0.13) t = 'forest';
        else if (Math.random() < 0.08) t = 'hill';
        this.terrain[y][x] = t;
      }
    }
  }

  private drawBoard() {
    const g = this.add.graphics();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const px = OX + x * CELL, py = OY + y * CELL;
        const t = this.terrain[y][x];
        const shade = (x + y) % 2 === 0 ? 0x66804d : 0x5f7847;
        g.fillStyle(t === 'river' ? 0x4a7d96 : shade, 1).fillRect(px, py, CELL, CELL);
        if (t === 'river') {
          g.fillStyle(0x5d92ab, 0.5);
          g.fillRect(px + 8, py + 14, CELL - 16, 6);
          g.fillRect(px + 14, py + 40, CELL - 24, 6);
        }
        if (t === 'forest') this.terrainSprites.push(this.add.image(px + CELL / 2, py + CELL / 2, 'tree').setScale(1.15).setDepth(5 + y));
        if (t === 'hill') this.terrainSprites.push(this.add.image(px + CELL / 2, py + CELL / 2 + 6, 'rock').setScale(1.1).setDepth(5 + y));
      }
    }
    g.lineStyle(1, 0x000000, 0.12);
    for (let x = 0; x <= COLS; x++) g.lineBetween(OX + x * CELL, OY, OX + x * CELL, OY + ROWS * CELL);
    for (let y = 0; y <= ROWS; y++) g.lineBetween(OX, OY + y * CELL, OX + COLS * CELL, OY + y * CELL);

    // defender's city walls on the right edge
    if (this.setup.walls > 0) {
      for (let y = 0; y < ROWS; y++) {
        this.add.image(OX + (COLS - 0.5) * CELL + 18, OY + y * CELL + CELL / 2, 'keep')
          .setScale(0.5).setAlpha(0.9).setDepth(4);
      }
    }
  }

  private drawHeader() {
    const cd = cityDef(this.setup.cityId);
    const af = faction(this.setup.attacker), df = faction(this.setup.defender);
    this.add.text(640, 20, `⚔ ${cd.name}之戰`, {
      fontFamily: '"Noto Serif TC", "PMingLiU", serif', fontSize: '24px', color: '#ffe9b0',
    }).setOrigin(0.5, 0);
    this.add.text(640, 50, `${af.name}（左方·攻）  對  ${df.name}（右方·守）`, {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#b9aa86',
    }).setOrigin(0.5, 0);
  }

  // ============================== armies ==============================

  private spawnArmies() {
    this.makeSide('atk', this.setup.atkOfficers, this.setup.atkTroops, 0);
    this.makeSide('def', this.setup.defOfficers, this.setup.defTroops, COLS - 1);
  }

  private makeSide(side: 'atk' | 'def', officerIds: string[], troops: number, col: number) {
    interface Spec { officerId: string | null; name: string; zh: string; war: number; int: number; ldr: number; troop: TroopType; skill: string; level: number; moveBonus: number; }
    const specs: Spec[] = [];
    for (const id of officerIds.slice(0, 3)) {
      const o = G.officers[id]; const d = officerDef(id);
      const moveBonus = o.item && itemDef(o.item).stat === 'move' ? itemDef(o.item).bonus : 0;
      specs.push({ officerId: id, name: d.name, zh: d.zh, war: effStat(o, 'war'), int: effStat(o, 'int'), ldr: effStat(o, 'ldr'), troop: d.troop, skill: d.skill, level: o.level, moveBonus });
    }
    if (specs.length === 0) {
      specs.push({ officerId: null, name: '守備隊長', zh: '兵', war: 55, int: 45, ldr: 55, troop: 'infantry', skill: 'guard', level: 1, moveBonus: 0 });
      if (troops > 5000) specs.push({ officerId: null, name: '守備弓隊', zh: '弓', war: 50, int: 45, ldr: 50, troop: 'archer', skill: 'volley', level: 1, moveBonus: 0 });
    }
    const totalLdr = specs.reduce((s, sp) => s + sp.ldr, 0);
    const rows = [3, 1, 5];
    specs.forEach((sp, i) => {
      const hp = Math.max(300, Math.floor(troops * (sp.ldr / totalLdr)));
      const gx = side === 'atk' ? (i === 1 ? 1 : 0) : (i === 1 ? COLS - 2 : COLS - 1);
      let gy = rows[i];
      if (this.terrain[gy][gx] === 'river') gy = Math.min(ROWS - 1, gy + 1);
      const u: BUnit = {
        id: this.nextId++, officerId: sp.officerId, name: sp.name, zh: sp.zh, side,
        troop: sp.troop, war: sp.war, int: sp.int, ldr: sp.ldr,
        skill: sp.skill, cd: 0, hp, maxHp: hp,
        move: TROOP_MOVE[sp.troop] + sp.moveBonus, range: TROOP_RANGE[sp.troop],
        gx, gy, done: false, guarding: false, dead: false,
        sprite: null as any, hpBar: null as any, level: sp.level,
      };
      this.makeUnitSprite(u);
      this.units.push(u);
    });
  }

  private makeUnitSprite(u: BUnit) {
    const fid = u.side === 'atk' ? this.setup.attacker : this.setup.defender;
    const color = Phaser.Display.Color.HexStringToColor(faction(fid).color).color;
    const c = this.add.container(0, 0).setDepth(30);
    const base = this.add.ellipse(0, 20, 46, 16, color, 0.85).setStrokeStyle(2, 0xffffff, 0.5);
    const img = this.add.image(0, -2, `px_${u.troop}`).setScale(0.92);
    if (u.side === 'def') img.setFlipX(true);
    const nm = this.add.text(0, -36, u.zh.charAt(0), {
      fontFamily: 'serif', fontSize: '14px', color: '#fff', backgroundColor: '#000000aa', padding: { x: 4, y: 1 },
    }).setOrigin(0.5);
    const barBg = this.add.rectangle(0, 32, 48, 6, 0x000000, 0.6);
    const bar = this.add.rectangle(-24, 32, 48, 6, color).setOrigin(0, 0.5);
    c.add([base, img, nm, barBg, bar]);
    u.sprite = c;
    u.hpBar = bar;
    this.placeUnit(u);

    img.setInteractive({ useHandCursor: true });
    img.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!p.rightButtonDown()) this.onUnitClick(u); });
  }

  private placeUnit(u: BUnit) {
    u.sprite.setPosition(OX + u.gx * CELL + CELL / 2, OY + u.gy * CELL + CELL / 2);
    u.sprite.setDepth(30 + u.gy);
  }

  // ============================== input ==============================

  private cellAt(gx: number, gy: number) { return this.units.find((u) => !u.dead && u.gx === gx && u.gy === gy); }

  private onUnitClick(u: BUnit) {
    if (this.phase !== 'player' || this.busyAnim) return;
    if (this.sel && this.mode === 'skill') {
      this.tryskillAt(u.gx, u.gy);
      return;
    }
    if (u.side === this.playerSide) {
      if (u.done) return;
      bus.emit('sfx', 'select');
      this.selectUnit(u);
    } else if (this.sel) {
      // attack if in range from current position
      if (this.dist(this.sel, u) <= this.attackRange(this.sel)) {
        this.doAttack(this.sel, u);
      }
    }
  }

  private selectUnit(u: BUnit) {
    this.clearSel();
    this.sel = u;
    this.mode = 'idle';
    this.showMoves(u);
    this.updateHud();
  }

  private attackRange(u: BUnit) {
    // archers on hills shoot further
    return u.range + (u.troop === 'archer' && this.terrain[u.gy][u.gx] === 'hill' ? 1 : 0);
  }

  private dist(a: BUnit | { gx: number; gy: number }, b: BUnit | { gx: number; gy: number }) {
    return Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy);
  }

  private reachable(u: BUnit): { x: number; y: number }[] {
    const res: { x: number; y: number }[] = [];
    const seen = new Set([`${u.gx},${u.gy}`]);
    const q: [number, number, number][] = [[u.gx, u.gy, 0]];
    while (q.length) {
      const [x, y, d] = q.shift()!;
      if (d >= u.move) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const key = `${nx},${ny}`;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || seen.has(key)) continue;
        seen.add(key);
        if (this.terrain[ny][nx] === 'river') continue;
        const occ = this.cellAt(nx, ny);
        if (occ && occ.side !== u.side) continue;        // can't pass enemies
        const cost = this.terrain[ny][nx] === 'forest' || this.terrain[ny][nx] === 'hill' ? 2 : 1;
        if (d + cost > u.move) continue;
        if (!occ) res.push({ x: nx, y: ny });
        q.push([nx, ny, d + cost]);
      }
    }
    return res;
  }

  private showMoves(u: BUnit) {
    this.clearHl();
    for (const c of this.reachable(u)) {
      const r = this.add.rectangle(OX + c.x * CELL + CELL / 2, OY + c.y * CELL + CELL / 2, CELL - 6, CELL - 6, 0x68a0ff, 0.3)
        .setStrokeStyle(1.5, 0x9cc1ff, 0.8).setDepth(20).setInteractive();
      r.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!p.rightButtonDown()) this.doMove(u, c.x, c.y); });
      this.hl.push(r);
    }
    this.showTargets(u);
  }

  private showTargets(u: BUnit) {
    const range = this.attackRange(u);
    for (const e of this.units.filter((e) => !e.dead && e.side !== u.side)) {
      if (this.dist(u, e) <= range) {
        const r = this.add.rectangle(OX + e.gx * CELL + CELL / 2, OY + e.gy * CELL + CELL / 2, CELL - 4, CELL - 4)
          .setStrokeStyle(3, 0xff5544, 0.95).setDepth(21);
        this.hl.push(r);
      }
    }
  }

  private showSkillTargets(u: BUnit) {
    this.clearHl();
    const sk = skillDef(u.skill);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (this.dist(u, { gx: x, gy: y }) > sk.range || (sk.range > 0 && x === u.gx && y === u.gy)) continue;
        if (sk.range === 0 && !(x === u.gx && y === u.gy)) continue;
        const r = this.add.rectangle(OX + x * CELL + CELL / 2, OY + y * CELL + CELL / 2, CELL - 6, CELL - 6, 0xffaa33, 0.28)
          .setStrokeStyle(1.5, 0xffcc66, 0.9).setDepth(20).setInteractive();
        r.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!p.rightButtonDown()) this.tryskillAt(x, y); });
        this.hl.push(r);
      }
    }
  }

  private clearHl() { this.hl.forEach((h) => h.destroy()); this.hl = []; }
  private clearSel() { this.sel = null; this.mode = 'idle'; this.clearHl(); }

  // ============================== actions ==============================

  private doMove(u: BUnit, x: number, y: number) {
    this.clearHl();
    this.busyAnim = true;
    bus.emit('sfx', 'move');
    u.gx = x; u.gy = y;
    this.tweens.add({
      targets: u.sprite, x: OX + x * CELL + CELL / 2, y: OY + y * CELL + CELL / 2,
      duration: 220, ease: 'Cubic.Out',
      onComplete: () => {
        u.sprite.setDepth(30 + u.gy);
        this.busyAnim = false;
        this.mode = 'moved';
        this.showTargets(u);
        this.updateHud();
      },
    });
  }

  private terrainDefMult(u: BUnit) {
    const t = this.terrain[u.gy][u.gx];
    let m = t === 'forest' ? 0.75 : 1;
    if (u.side === 'def') m *= 1 - this.setup.walls * 0.05;
    if (u.guarding) m *= 0.5;
    return m;
  }

  private typeMult(a: TroopType, d: TroopType) {
    if (a === 'infantry' && d === 'cavalry') return 1.25;
    if (a === 'cavalry' && d === 'archer') return 1.3;
    if (a === 'archer' && d === 'infantry') return 1.2;
    return 1;
  }

  private rawDamage(a: BUnit, d: BUnit, powMult = 1, useInt = false) {
    const stat = useInt ? a.int : a.war;
    const hillBonus = this.terrain[a.gy][a.gx] === 'hill' ? 1.15 : 1;
    const base = (stat * 1.25 + a.ldr * 0.45 + 20) * 6.2;
    const strength = Math.pow(a.hp / a.maxHp, 0.55);
    const variance = Phaser.Math.FloatBetween(0.9, 1.12);
    return Math.floor(base * strength * powMult * hillBonus * variance * this.typeMult(a.troop, d.troop) * this.terrainDefMult(d));
  }

  private applyDamage(target: BUnit, dmg: number, attacker?: BUnit) {
    target.hp = Math.max(0, target.hp - dmg);
    this.floatText(target, `-${dmg}`, '#ff7a5c');
    this.tweens.add({ targets: target.sprite, alpha: { from: 1, to: 0.3 }, yoyo: true, duration: 80, repeat: 1 });
    target.hpBar.width = 48 * (target.hp / target.maxHp);
    if (target.hp <= 0) {
      target.dead = true;
      bus.emit('sfx', 'die');
      if (attacker && attacker.officerId && attacker.side === this.playerSide) {
        const o = G.officers[attacker.officerId];
        if (o) gainExp(o, 50);
      }
      this.tweens.add({ targets: target.sprite, alpha: 0, scale: 0.6, duration: 380, onComplete: () => target.sprite.setVisible(false) });
      this.time.delayedCall(420, () => this.checkEnd());
    }
  }

  private floatText(u: BUnit, text: string, color: string) {
    const t = this.add.text(u.sprite.x, u.sprite.y - 40, text, {
      fontFamily: 'Georgia, serif', fontSize: '18px', color, stroke: '#000', strokeThickness: 3, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(90);
    this.tweens.add({ targets: t, y: t.y - 36, alpha: 0, duration: 950, onComplete: () => t.destroy() });
  }

  private doAttack(a: BUnit, d: BUnit) {
    if (this.busyAnim) return;
    this.busyAnim = true;
    this.clearHl();
    bus.emit('sfx', 'hit');
    // lunge animation
    const dx = (d.sprite.x - a.sprite.x) * 0.3, dy = (d.sprite.y - a.sprite.y) * 0.3;
    this.tweens.add({
      targets: a.sprite, x: a.sprite.x + dx, y: a.sprite.y + dy, yoyo: true, duration: 120,
      onComplete: () => {
        const dmg = this.rawDamage(a, d);
        this.applyDamage(d, dmg, a);
        // counterattack
        if (!d.dead && this.dist(a, d) <= this.attackRange(d)) {
          this.time.delayedCall(240, () => {
            if (!d.dead && !a.dead) {
              bus.emit('sfx', 'hit2');
              const c = Math.floor(this.rawDamage(d, a) * 0.55);
              this.applyDamage(a, c, d);
            }
            this.finishAction(a);
          });
        } else {
          this.finishAction(a);
        }
      },
    });
  }

  private tryskillAt(x: number, y: number) {
    const u = this.sel;
    if (!u || this.mode !== 'skill' || this.busyAnim) return;
    const sk = skillDef(u.skill);
    if (this.dist(u, { gx: x, gy: y }) > sk.range) return;
    this.execSkill(u, sk, x, y);
  }

  private execSkill(u: BUnit, sk: SkillDef, x: number, y: number) {
    this.busyAnim = true;
    this.clearHl();
    u.cd = sk.cooldown;
    const inAoe = (e: BUnit) => Math.abs(e.gx - x) + Math.abs(e.gy - y) <= sk.aoe;
    this.cameras.main.shake(150, 0.004);

    switch (sk.type) {
      case 'damage': {
        bus.emit('sfx', sk.id === 'snipe' ? 'arrow' : 'skill');
        this.aoeFlash(x, y, sk.aoe, 0xffcc44);
        for (const e of this.units.filter((e) => !e.dead && e.side !== u.side && inAoe(e))) {
          const dmg = Math.floor(this.rawDamage(u, e, sk.power) * (sk.pierce && e.guarding ? 2 : 1));
          this.applyDamage(e, dmg, u);
        }
        if (sk.push) {
          const target = this.cellAt(x, y);
          if (target && !target.dead) {
            const px = Phaser.Math.Clamp(x + Math.sign(x - u.gx), 0, COLS - 1);
            const py = Phaser.Math.Clamp(y + Math.sign(y - u.gy), 0, ROWS - 1);
            if (!this.cellAt(px, py) && this.terrain[py][px] !== 'river') {
              target.gx = px; target.gy = py;
              this.tweens.add({ targets: target.sprite, x: OX + px * CELL + CELL / 2, y: OY + py * CELL + CELL / 2, duration: 180 });
            }
          }
        }
        break;
      }
      case 'intdamage': {
        bus.emit('sfx', 'fire');
        this.aoeFlash(x, y, sk.aoe, 0xff5522);
        for (const e of this.units.filter((e) => !e.dead && e.side !== u.side && inAoe(e))) {
          const forestMult = this.terrain[e.gy][e.gx] === 'forest' ? 1.5 : 1;
          this.applyDamage(e, Math.floor(this.rawDamage(u, e, sk.power * forestMult, true)), u);
        }
        break;
      }
      case 'duel': {
        const e = this.cellAt(x, y);
        if (e && e.side !== u.side) {
          bus.emit('sfx', 'duel');
          const myRoll = u.war * Phaser.Math.FloatBetween(0.85, 1.15);
          const theirRoll = e.war * Phaser.Math.FloatBetween(0.85, 1.15);
          if (myRoll >= theirRoll) {
            this.floatText(u, '⚔ 單挑獲勝！', '#ffe9b0');
            this.applyDamage(e, Math.floor(this.rawDamage(u, e, sk.power)), u);
          } else {
            this.floatText(e, '⚔ 單挑獲勝！', '#ffe9b0');
            this.applyDamage(u, Math.floor(this.rawDamage(e, u, sk.power * 0.7)), e);
          }
        }
        break;
      }
      case 'heal': {
        bus.emit('sfx', 'heal');
        const amount = Math.floor(u.ldr * 14 * sk.power);
        for (const a of this.units.filter((a) => !a.dead && a.side === u.side && this.dist(u, a) <= 1)) {
          a.hp = Math.min(a.maxHp, a.hp + amount);
          a.hpBar.width = 48 * (a.hp / a.maxHp);
          this.floatText(a, `+${amount}`, '#7dffa0');
        }
        break;
      }
      case 'buff': {
        bus.emit('sfx', 'guard');
        u.guarding = true;
        this.floatText(u, '🛡 鐵壁', '#9cc1ff');
        break;
      }
    }
    this.time.delayedCall(420, () => this.finishAction(u));
  }

  private aoeFlash(x: number, y: number, aoe: number, color: number) {
    for (let dy = -aoe; dy <= aoe; dy++) {
      for (let dx = -aoe; dx <= aoe; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > aoe) continue;
        const px = x + dx, py = y + dy;
        if (px < 0 || py < 0 || px >= COLS || py >= ROWS) continue;
        const r = this.add.rectangle(OX + px * CELL + CELL / 2, OY + py * CELL + CELL / 2, CELL - 4, CELL - 4, color, 0.55).setDepth(60);
        this.tweens.add({ targets: r, alpha: 0, duration: 500, onComplete: () => r.destroy() });
      }
    }
  }

  private finishAction(u: BUnit) {
    u.done = true;
    this.busyAnim = false;
    if (this.sel === u) this.clearSel();
    this.updateHud();
    this.checkEnd();
    if (this.phase === 'player' && this.units.filter((x) => !x.dead && x.side === this.playerSide && !x.done).length === 0) {
      this.startEnemyPhase();
    }
  }

  // ============================== enemy AI ==============================

  private startEnemyPhase() {
    if (this.phase === 'over') return;
    this.phase = 'enemy';
    this.clearSel();
    this.updateTurnLabel();
    this.updateHud();
    this.time.delayedCall(450, () => this.enemyStep());
  }

  private enemyStep() {
    if (this.phase === 'over') return;
    const enemySide = this.playerSide === 'atk' ? 'def' : 'atk';
    const u = this.units.find((x) => !x.dead && x.side === enemySide && !x.done);
    if (!u) { this.endRound(); return; }

    const foes = this.units.filter((x) => !x.dead && x.side === this.playerSide);
    if (foes.length === 0) { this.endRound(); return; }

    // try skill on a target in range
    const sk = skillDef(u.skill);
    if (u.cd <= 0 && Math.random() < 0.6 && (sk.type === 'damage' || sk.type === 'intdamage' || sk.type === 'duel')) {
      const target = foes.filter((f) => this.dist(u, f) <= sk.range).sort((a, b) => a.hp - b.hp)[0];
      if (target) { this.execSkill(u, sk, target.gx, target.gy); this.time.delayedCall(800, () => this.enemyStep()); return; }
    }
    // attack if in range
    const inRange = foes.filter((f) => this.dist(u, f) <= this.attackRange(u)).sort((a, b) => a.hp - b.hp);
    if (inRange.length > 0) {
      this.doAttackAI(u, inRange[0]);
      return;
    }
    // move toward nearest foe
    const nearest = foes.sort((a, b) => this.dist(u, a) - this.dist(u, b))[0];
    const cells = this.reachable(u);
    if (cells.length > 0) {
      const best = cells.sort((a, b) =>
        (Math.abs(a.x - nearest.gx) + Math.abs(a.y - nearest.gy)) - (Math.abs(b.x - nearest.gx) + Math.abs(b.y - nearest.gy)))[0];
      u.gx = best.x; u.gy = best.y;
      this.tweens.add({
        targets: u.sprite, x: OX + best.x * CELL + CELL / 2, y: OY + best.y * CELL + CELL / 2, duration: 220,
        onComplete: () => {
          u.sprite.setDepth(30 + u.gy);
          const t2 = this.units.filter((x) => !x.dead && x.side === this.playerSide && this.dist(u, x) <= this.attackRange(u)).sort((a, b) => a.hp - b.hp)[0];
          if (t2) this.doAttackAI(u, t2);
          else { u.done = true; this.time.delayedCall(160, () => this.enemyStep()); }
        },
      });
    } else {
      u.done = true;
      this.time.delayedCall(120, () => this.enemyStep());
    }
  }

  private doAttackAI(a: BUnit, d: BUnit) {
    bus.emit('sfx', 'hit');
    const dx = (d.sprite.x - a.sprite.x) * 0.3, dy = (d.sprite.y - a.sprite.y) * 0.3;
    this.tweens.add({
      targets: a.sprite, x: a.sprite.x + dx, y: a.sprite.y + dy, yoyo: true, duration: 120,
      onComplete: () => {
        this.applyDamage(d, this.rawDamage(a, d), a);
        if (!d.dead && this.dist(a, d) <= this.attackRange(d)) {
          this.applyDamage(a, Math.floor(this.rawDamage(d, a) * 0.55), d);
        }
        a.done = true;
        this.time.delayedCall(380, () => this.enemyStep());
      },
    });
  }

  private endRound() {
    if (this.phase === 'over') return;
    this.round++;
    if (this.round > MAX_ROUNDS) {
      this.finish('def'); // time runs out — the siege is repelled
      return;
    }
    for (const u of this.units) {
      if (u.dead) continue;
      u.done = false;
      u.guarding = false;
      if (u.cd > 0) u.cd--;
    }
    this.phase = 'player';
    this.updateTurnLabel();
    this.updateHud();
  }

  private checkEnd() {
    if (this.phase === 'over') return;
    const atkAlive = this.units.some((u) => !u.dead && u.side === 'atk');
    const defAlive = this.units.some((u) => !u.dead && u.side === 'def');
    if (!atkAlive) this.finish('def');
    else if (!defAlive) this.finish('atk');
  }

  private finish(winner: 'atk' | 'def') {
    this.phase = 'over';
    const sum = (side: 'atk' | 'def') => this.units.filter((u) => u.side === side).reduce((s, u) => s + Math.max(0, u.hp), 0);
    const result: BattleResult = {
      winner,
      atkRemaining: Math.floor(sum('atk')),
      defRemaining: Math.floor(sum('def')),
    };
    this.time.delayedCall(700, () => {
      document.getElementById('battleTurn')!.classList.add('hidden');
      document.getElementById('battleHud')!.classList.add('hidden');
      document.getElementById('side')!.classList.remove('hidden');
      reportBattle(this.setup, result);
      applyBattleResult(this.setup, result);
      this.scene.stop();
      this.scene.wake('Map');
      onBattleComplete();
    });
  }

  /** Player concedes the field. */
  retreat() {
    if (this.phase === 'over') return;
    // retreating side keeps 60% of surviving troops
    for (const u of this.units.filter((u) => u.side === this.playerSide && !u.dead)) u.hp = Math.floor(u.hp * 0.6);
    this.finish(this.playerSide === 'atk' ? 'def' : 'atk');
  }

  // ============================== HUD ==============================

  private updateTurnLabel() {
    const el = document.getElementById('battleTurn')!;
    el.textContent = this.phase === 'player' ? `第 ${this.round}/${MAX_ROUNDS} 回合 — 我方行動` : `第 ${this.round} 回合 — 敵方行動`;
    el.style.color = this.phase === 'player' ? '#ffe9b0' : '#ff8a70';
  }

  private updateHud() {
    const hud = document.getElementById('battleHud')!;
    if (this.phase !== 'player') {
      hud.innerHTML = `<div class="unitInfo">敵軍行動中……</div>`;
      return;
    }
    const remaining = this.units.filter((x) => !x.dead && x.side === this.playerSide && !x.done).length;
    if (!this.sel) {
      hud.innerHTML = `<div class="unitInfo">選擇部隊（尚有 ${remaining} 隊可行動）· 右鍵取消選取</div>
        <button id="bhEndPhase">⏭ 結束階段</button> <button id="bhRetreat">🏳 撤退</button>`;
      (document.getElementById('bhEndPhase') as HTMLButtonElement).onclick = () => {
        this.units.filter((x) => !x.dead && x.side === this.playerSide).forEach((x) => (x.done = true));
        this.startEnemyPhase();
      };
      (document.getElementById('bhRetreat') as HTMLButtonElement).onclick = () => this.retreat();
      return;
    }
    const u = this.sel;
    const sk = skillDef(u.skill);
    const skillReady = u.cd <= 0;
    hud.innerHTML = `
      <div class="unitInfo"><b>${u.name}</b> ${TROOP_ICONS[u.troop]} Lv${u.level}<br>
      兵力 ${u.hp.toLocaleString()} / ${u.maxHp.toLocaleString()} · 武力 ${u.war} 智力 ${u.int}</div>
      <button id="bhSkill" ${skillReady ? '' : 'disabled'} title="${sk.desc}">✦ ${sk.name}${skillReady ? '' : `（${u.cd}）`}</button>
      <button id="bhWait">⏸ 待命</button>
      <button id="bhRetreat">🏳</button>`;
    (document.getElementById('bhSkill') as HTMLButtonElement).onclick = () => {
      if (this.mode === 'skill') { this.mode = 'moved'; this.clearHl(); this.showTargets(u); }
      else { this.mode = 'skill'; this.showSkillTargets(u); }
    };
    (document.getElementById('bhWait') as HTMLButtonElement).onclick = () => this.finishAction(u);
    (document.getElementById('bhRetreat') as HTMLButtonElement).onclick = () => this.retreat();
  }
}
