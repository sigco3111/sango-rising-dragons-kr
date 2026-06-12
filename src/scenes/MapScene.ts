import Phaser from 'phaser';
import { content, cityDef, faction } from '../content';
import { G, bus, officersIn } from '../state';

const W = 1280, H = 720;

/** The strategic layer: a stylized map of Han-dynasty China. */
export class MapScene extends Phaser.Scene {
  private nodes = new Map<string, Phaser.GameObjects.Container>();
  private flags = new Map<string, Phaser.GameObjects.Rectangle>();
  private glyphs = new Map<string, Phaser.GameObjects.Text>();
  private badges = new Map<string, Phaser.GameObjects.Text>();
  private offDots = new Map<string, Phaser.GameObjects.Text>();
  private ring!: Phaser.GameObjects.Arc;
  private marchFrom: string | null = null;
  private marchRings: Phaser.GameObjects.Arc[] = [];
  private selected: string | null = null;

  constructor() { super('Map'); }

  create() {
    this.drawTerrain();
    this.drawRoads();
    for (const c of content.cities) this.makeCityNode(c.id);

    this.ring = this.add.circle(0, 0, 34).setStrokeStyle(2.5, 0xffe9b0).setVisible(false).setDepth(50);
    this.tweens.add({ targets: this.ring, scale: { from: 1, to: 1.12 }, yoyo: true, repeat: -1, duration: 600 });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) this.cancelMarch();
    });
    this.input.mouse?.disableContextMenu();

    bus.on('refresh', this.refresh, this);
    bus.on('marchMode', (cityId: string) => this.enterMarchMode(cityId));
    this.events.on('wake', () => { this.refresh(); bus.emit('music', 'map'); });
    this.refresh();
    bus.emit('music', 'map');
  }

  // ---------- drawing ----------

  private drawTerrain() {
    // hand-drawn parchment base (Kenney Cartography Pack)
    this.add.image(W / 2, H / 2, 'c_parchmentBasic').setDisplaySize(W, H).setTint(0xf2e4bf);

    // sea in the east
    const sea = this.add.graphics();
    sea.fillStyle(0xa9c2b8, 0.75);
    sea.beginPath();
    sea.moveTo(W, 0);
    const coast = [ [1075, 0], [1060, 60], [1090, 130], [1055, 200], [1085, 280], [1100, 360], [1130, 430], [1160, 520], [1140, 620], [1170, 720] ];
    coast.forEach(([x, y]) => sea.lineTo(x, y));
    sea.lineTo(W, H);
    sea.closePath();
    sea.fillPath();
    sea.lineStyle(2.5, 0x6b8577, 0.7);
    sea.beginPath();
    sea.moveTo(1075, 0);
    coast.slice(1).forEach(([x, y]) => sea.lineTo(x, y));
    sea.strokePath();
    this.add.image(1190, 150, 'c_ship').setScale(0.8).setAlpha(0.85);
    this.add.image(1225, 420, 'c_ship').setScale(0.6).setAlpha(0.7).setFlipX(true);

    // the two great rivers
    this.drawRiver([[300, 130], [480, 200], [620, 245], [760, 250], [900, 300], [1055, 330]], 0x87a7b3, 9); // Yellow River
    this.drawRiver([[180, 460], [360, 500], [520, 520], [660, 590], [820, 600], [1000, 560], [1130, 600]], 0x7fa3b8, 12); // Yangtze

    // western mountain ranges
    for (const [x, y, s] of [[160, 250, 1], [205, 310, 0.85], [150, 360, 0.9], [235, 395, 0.8], [185, 470, 0.95], [150, 555, 0.85], [230, 555, 0.7], [470, 370, 0.8], [515, 225, 0.7], [340, 320, 0.75], [95, 420, 0.8]]) {
      this.add.image(x as number, y as number, 'c_rocksMountain').setScale(s as number).setAlpha(0.92);
    }
    // forests
    for (let i = 0; i < 22; i++) {
      const x = Phaser.Math.Between(60, 1040), y = Phaser.Math.Between(60, 680);
      if (content.cities.some((c) => Phaser.Math.Distance.Between(c.x, c.y, x, y) < 78)) continue;
      this.add.image(x, y, Math.random() < 0.5 ? 'c_treeTall' : 'c_treePines').setScale(Phaser.Math.FloatBetween(0.32, 0.45)).setAlpha(0.85);
    }

    this.add.image(70, 650, 'c_compass').setScale(0.9).setAlpha(0.8);
    this.add.text(1190, 695, '青龍紀年 · 190', { fontFamily: 'serif', fontSize: '13px', color: '#7a6a48' }).setOrigin(1, 1);
  }

  private drawRiver(points: number[][], color: number, width: number) {
    const curve = new Phaser.Curves.Spline(points.flat());
    const g = this.add.graphics();
    g.lineStyle(width, color, 0.85);
    curve.draw(g, 64);
    g.lineStyle(width + 6, color, 0.25);
    curve.draw(g, 64);
  }

  private drawRoads() {
    const g = this.add.graphics();
    const drawn = new Set<string>();
    for (const c of content.cities) {
      for (const adj of c.adj) {
        const key = [c.id, adj].sort().join('|');
        if (drawn.has(key)) continue;
        drawn.add(key);
        const o = cityDef(adj);
        const dist = Phaser.Math.Distance.Between(c.x, c.y, o.x, o.y);
        const steps = Math.floor(dist / 14);
        g.fillStyle(0x8a7350, 0.65);
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          g.fillCircle(c.x + (o.x - c.x) * t, c.y + (o.y - c.y) * t, 1.8);
        }
      }
    }
  }

  private makeCityNode(id: string) {
    const cd = cityDef(id);
    const node = this.add.container(cd.x, cd.y).setDepth(20);

    const shadow = this.add.ellipse(0, 14, 52, 16, 0x4a3a20, 0.25);
    const img = this.add.image(0, 0, cd.capital ? 'c_castle' : 'c_tower').setScale(cd.capital ? 0.85 : 0.72);
    // banner flag
    const pole = this.add.rectangle(-26, -16, 2.5, 40, 0x5a4626);
    const flag = this.add.rectangle(-17, -30, 20, 14, 0x888888);
    const glyph = this.add.text(-17, -30, '', { fontFamily: 'serif', fontSize: '11px', color: '#fff' }).setOrigin(0.5);
    const name = this.add.text(0, 28, cd.name, {
      fontFamily: '"Noto Serif TC", "PMingLiU", serif', fontSize: '15px', color: '#2b2113', fontStyle: 'bold',
    }).setOrigin(0.5).setShadow(0, 1, '#e6d7b2', 2);
    const badge = this.add.text(24, -22, '', {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#fff', backgroundColor: '#00000088', padding: { x: 4, y: 1 },
    }).setOrigin(0.5);
    const offDot = this.add.text(0, -40, '', { fontSize: '11px' }).setOrigin(0.5);

    node.add([shadow, img, pole, flag, glyph, name, badge, offDot]);
    this.flags.set(id, flag);
    this.glyphs.set(id, glyph);
    this.badges.set(id, badge);
    this.offDots.set(id, offDot);
    this.nodes.set(id, node);

    img.setInteractive({ useHandCursor: true });
    img.on('pointerover', () => node.setScale(1.08));
    img.on('pointerout', () => node.setScale(1));
    img.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.onCityClick(id);
    });
  }

  // ---------- interaction ----------

  private onCityClick(id: string) {
    bus.emit('sfx', 'select');
    if (this.marchFrom) {
      const from = this.marchFrom;
      if (cityDef(from).adj.includes(id)) {
        this.cancelMarch();
        bus.emit('marchTarget', { from, to: id });
        return;
      }
      this.cancelMarch();
    }
    this.selected = id;
    this.ring.setVisible(true).setPosition(cityDef(id).x, cityDef(id).y);
    bus.emit('citySelected', id);
  }

  private enterMarchMode(cityId: string) {
    this.cancelMarch();
    this.marchFrom = cityId;
    for (const adj of cityDef(cityId).adj) {
      const t = cityDef(adj);
      const hostile = G.cities[adj].owner !== G.playerFaction;
      const ring = this.add.circle(t.x, t.y, 38).setStrokeStyle(3, hostile ? 0xd64533 : 0x3fae5c, 0.95).setDepth(49);
      this.tweens.add({ targets: ring, alpha: { from: 1, to: 0.4 }, yoyo: true, repeat: -1, duration: 450 });
      this.marchRings.push(ring);
    }
  }

  private cancelMarch() {
    this.marchFrom = null;
    this.marchRings.forEach((r) => r.destroy());
    this.marchRings = [];
  }

  // ---------- state sync ----------

  refresh() {
    if (!G) return;
    for (const c of content.cities) {
      const st = G.cities[c.id];
      const f = faction(st.owner);
      const color = Phaser.Display.Color.HexStringToColor(f.color).color;
      this.flags.get(c.id)!.setFillStyle(color);
      this.glyphs.get(c.id)!.setText(st.owner === 'neutral' ? '' : f.zh);
      this.badges.get(c.id)!.setText(`${Math.round(st.troops / 1000)}k`);
      const mine = officersIn(c.id, G.playerFaction).length;
      this.offDots.get(c.id)!.setText(st.owner === G.playerFaction && mine > 0 ? '👤'.repeat(Math.min(mine, 3)) : '');
    }
    if (this.selected && G.cities[this.selected]) {
      this.ring.setPosition(cityDef(this.selected).x, cityDef(this.selected).y);
    }
  }
}
