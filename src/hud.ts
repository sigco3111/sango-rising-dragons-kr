import {
  G, bus, monthOf, yearOf, seasonOf, citiesOf, officersIn, freeOfficersIn,
  effStat, develop, recruit, searchTalent, trainOfficer, moveOfficers,
  applyEffects, saveGame, maxCp, DEV_COST,
} from './state';
import { faction, cityDef, officerDef, skillDef, itemDef } from './content';
import { endTurn, isBusy, reportBattle, onBattleComplete } from './flow';
import { autoResolve, applyBattleResult, armyPower } from './battle/model';
import type { BattleSetup, OfficerState } from './types';

const $ = (id: string) => document.getElementById(id)!;

const TROOP_ICONS: Record<string, string> = { infantry: '🛡', cavalry: '🐎', archer: '🏹' };
export const TROOP_NAMES: Record<string, string> = { infantry: '步兵', cavalry: '騎兵', archer: '弓兵' };

let selectedCity: string | null = null;

// ============================================================ setup

export function initHud() {
  $('endTurnBtn').onclick = () => { if (!isBusy()) { sfx('click'); endTurn(); } };
  $('saveBtn').onclick = () => { saveGame(); log('💾 進度已儲存。'); sfx('confirm'); };

  bus.on('refresh', refresh);
  bus.on('log', (msg: string, cls?: string) => log(msg, cls));
  bus.on('modal', (m: any) => showModal(m));
  bus.on('banner', (text: string) => banner(text));
  bus.on('citySelected', (id: string | null) => { selectedCity = id; renderSide(); });
  bus.on('marchTarget', (data: { from: string; to: string }) => marchDialog(data.from, data.to));
  bus.on('gameover', (kind: 'win' | 'lose') => gameOver(kind));
}

export function showGameUi() {
  $('topbar').classList.remove('hidden');
  $('side').classList.remove('hidden');
  refresh();
}

// ============================================================ topbar / log / banner

function refresh() {
  if (!G) return;
  $('dateVal').textContent = `${yearOf(G.turn)}年 ${seasonOf(G.turn)} ${monthOf(G.turn)}月`;
  $('goldVal').textContent = G.gold.toLocaleString();
  $('foodVal').textContent = G.food.toLocaleString();
  $('cpVal').textContent = `${G.cp}/${maxCp()}`;
  const f = faction(G.playerFaction);
  ($('factionChip').querySelector('.dot') as HTMLElement).style.background = f.color;
  $('factionName').textContent = f.name;
  ($('endTurnBtn') as HTMLButtonElement).disabled = isBusy() || !!G.over;
  renderSide();
}

export function log(msg: string, cls = '') {
  const e = document.createElement('div');
  e.className = `entry ${cls}`;
  e.textContent = msg;
  $('log').prepend(e);
  while ($('log').children.length > 9) $('log').lastChild?.remove();
}

function banner(text: string) {
  const b = $('banner');
  b.textContent = text;
  b.classList.add('show');
  setTimeout(() => b.classList.remove('show'), 1800);
}

export function sfx(name: string) { bus.emit('sfx', name); }

// ============================================================ side panel

function portraitHtml(o: OfficerState, size = 42): string {
  const d = officerDef(o.id);
  const col = o.faction ? faction(o.faction).color : '#8a8576';
  const glyph = d.zh.charAt(0);
  return `<div class="portrait" style="width:${size}px;height:${size}px;background:linear-gradient(160deg,${col},#1a140a 130%)">${glyph}</div>`;
}

function officerCard(o: OfficerState, buttons = ''): string {
  const d = officerDef(o.id);
  const sk = skillDef(d.skill);
  const item = o.item ? ` · 🎁 ${itemDef(o.item).name}` : '';
  const acted = o.acted ? `<span class="tag" style="background:#444;color:#999">已行動</span>` : '';
  return `<div class="officer-card" title="${sk.name}：${sk.desc}${o.item ? `\n寶物：${itemDef(o.item).name} — ${itemDef(o.item).desc}` : ''}">
    ${portraitHtml(o)}
    <div class="info">
      <div class="nm">${d.name} <span class="lv">Lv${o.level}</span>${acted}</div>
      <div class="st">${TROOP_ICONS[d.troop]} 武力 ${effStat(o, 'war')} · 智力 ${effStat(o, 'int')} · 統率 ${effStat(o, 'ldr')} · 政治 ${effStat(o, 'pol')}</div>
      <div class="st">✦ ${sk.name}${item}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px">${buttons}</div>
  </div>`;
}

function renderSide() {
  if (!G) return;
  const body = $('sideBody');
  if (!selectedCity) {
    // faction overview
    $('sideTitle').textContent = faction(G.playerFaction).name;
    $('sideSub').textContent = '勢力總覽';
    const myCities = citiesOf(G.playerFaction);
    const troops = myCities.reduce((s, c) => s + c.troops, 0);
    const officers = Object.values(G.officers).filter((o) => o.faction === G.playerFaction);
    body.innerHTML = `
      <div class="statgrid">
        <div class="row"><span>城池</span><b>${myCities.length} / 20</b></div>
        <div class="row"><span>目標</span><b>12 座城池</b></div>
        <div class="row"><span>總兵力</span><b>${troops.toLocaleString()}</b></div>
        <div class="row"><span>將領</span><b>${officers.length}</b></div>
      </div>
      <div style="color:var(--muted);font-size:12px;margin-bottom:6px">點選地圖上你的城池以下達指令。⚡ 指令點每回合恢復。</div>
      ${officers.map((o) => officerCard(o)).join('')}
    `;
    return;
  }

  const cd = cityDef(selectedCity);
  const c = G.cities[selectedCity];
  const own = c.owner === G.playerFaction;
  const f = faction(c.owner);
  $('sideTitle').textContent = cd.name;
  $('sideSub').innerHTML = `<span style="color:${f.color}">⬤</span> ${f.name}${cd.capital ? ' · 都城' : ''}`;

  const stats = `
    <div class="statgrid">
      <div class="row"><span>兵力</span><b>${c.troops.toLocaleString()}</b></div>
      <div class="row"><span>城牆</span><b>${'▮'.repeat(c.walls)}${'▯'.repeat(5 - c.walls)}</b></div>
      <div class="row"><span>農田</span><b>${'▮'.repeat(c.farm)}${'▯'.repeat(6 - c.farm)}</b></div>
      <div class="row"><span>市集</span><b>${'▮'.repeat(c.market)}${'▯'.repeat(6 - c.market)}</b></div>
    </div>`;

  if (!own) {
    const officers = officersIn(selectedCity, c.owner);
    body.innerHTML = `${stats}
      <div style="color:var(--muted);font-size:12px;margin-bottom:8px">
        ${c.owner === 'neutral' ? '在野城池——守備薄弱。' : `${f.name}的領地。`}
        可從相鄰的我方城池出兵奪取。
      </div>
      ${officers.map((o) => officerCard(o)).join('')}`;
    return;
  }

  const officers = officersIn(selectedCity, G.playerFaction);
  const canAct = !isBusy() && !G.over;
  body.innerHTML = `${stats}
    <div class="actions">
      <button id="bFarm" ${!canAct ? 'disabled' : ''} title="每級每回合糧草+50（${DEV_COST}金，1⚡）">🌾 開墾</button>
      <button id="bMarket" ${!canAct ? 'disabled' : ''} title="每級每回合金錢+60（${DEV_COST}金，1⚡）">🪙 通商</button>
      <button id="bWalls" ${!canAct ? 'disabled' : ''} title="強化守備（${DEV_COST}金，1⚡）">🧱 築城</button>
      <button id="bRecruit" ${!canAct ? 'disabled' : ''} title="兵力+1500（200金+300糧，1⚡）">⚔ 徵兵</button>
      <button id="bMarch" class="primary" ${!canAct || officers.length === 0 ? 'disabled' : ''} title="派遣將領與部隊前往相鄰城池（1⚡）">🚩 出征</button>
    </div>
    <div style="margin-top:12px;font-size:12px;color:var(--muted)">駐守將領${freeOfficersIn(selectedCity).length > 0 ? ' · <i>傳聞城中有在野賢才……</i>' : ''}</div>
    ${officers.map((o) => officerCard(o, `
        <button data-search="${o.id}" ${!canAct || o.acted ? 'disabled' : ''} title="搜索城中在野人才／徵收賦稅（1⚡）">🔍</button>
        <button data-train="${o.id}" ${!canAct || o.acted ? 'disabled' : ''} title="操練：獲得經驗（150金，1⚡）">🎯</button>
      `)).join('')}
  `;
  if (canAct) {
    ($('bFarm') as HTMLButtonElement).onclick = () => { sfx('click'); develop(selectedCity!, 'farm'); };
    ($('bMarket') as HTMLButtonElement).onclick = () => { sfx('click'); develop(selectedCity!, 'market'); };
    ($('bWalls') as HTMLButtonElement).onclick = () => { sfx('click'); develop(selectedCity!, 'walls'); };
    ($('bRecruit') as HTMLButtonElement).onclick = () => { sfx('click'); recruit(selectedCity!); };
    const marchBtn = $('bMarch') as HTMLButtonElement;
    if (marchBtn) marchBtn.onclick = () => { sfx('click'); bus.emit('marchMode', selectedCity); log('🚩 點選地圖上相鄰的目的地（按右鍵取消）。'); };
    body.querySelectorAll('[data-search]').forEach((b) => {
      (b as HTMLButtonElement).onclick = () => { sfx('click'); searchTalent(selectedCity!, (b as HTMLElement).dataset.search!); };
    });
    body.querySelectorAll('[data-train]').forEach((b) => {
      (b as HTMLButtonElement).onclick = () => { sfx('click'); trainOfficer((b as HTMLElement).dataset.train!); };
    });
  }
}

// ============================================================ march dialog

function marchDialog(from: string, to: string) {
  const src = G.cities[from];
  const tgt = G.cities[to];
  const hostile = tgt.owner !== G.playerFaction;
  const officers = officersIn(from, G.playerFaction).filter((o) => !o.acted);
  if (officers.length === 0) { log('⚠ 此城已無可率軍出征的將領。'); return; }

  const defOff = officersIn(to, tgt.owner);
  const intel = hostile
    ? `<div style="font-size:12px;color:var(--muted);margin:4px 0 10px">守軍：約${tgt.troops.toLocaleString()}兵力，城牆${tgt.walls}級${defOff.length ? '，守將：' + defOff.map((o) => officerDef(o.id).name).join('、') : ''}</div>`
    : `<div style="font-size:12px;color:var(--muted);margin:4px 0 10px">我方城池——調動部隊與將領。</div>`;

  const maxTroops = Math.max(0, src.troops - 500);
  if (hostile && maxTroops < 500) { log('⚠ 兵力不足以出征（至少需留守500人）。'); return; }

  showModalRaw(`
    <h2>${hostile ? '⚔ 進攻' : '🚩 移防'}${cityDef(to).name}</h2>
    <div class="mShort">由${cityDef(from).name}出發 · 出征後留守兵力：<b id="mLeft"></b></div>
    ${intel}
    <div style="font-size:13px;margin-bottom:6px">統軍將領（至多3名）：</div>
    <div id="mOfficers">${officers.map((o) => `
      <label class="officer-card" style="cursor:pointer">
        <input type="checkbox" value="${o.id}" style="accent-color:#d4a536">
        ${portraitHtml(o, 36)}
        <div class="info"><div class="nm">${officerDef(o.id).name} <span class="lv">Lv${o.level}</span></div>
        <div class="st">${TROOP_ICONS[officerDef(o.id).troop]} 武力 ${effStat(o, 'war')} · 統率 ${effStat(o, 'ldr')} · ✦ ${skillDef(officerDef(o.id).skill).name}</div></div>
      </label>`).join('')}
    </div>
    <div style="margin:12px 0 4px;font-size:13px">出征兵力：<b id="mTroopsVal"></b></div>
    <input id="mTroops" type="range" min="500" max="${Math.max(500, maxTroops)}" value="${Math.max(500, Math.floor(maxTroops * 0.8))}" step="100" style="width:100%">
    <div class="mChoices">
      <button id="mGo" class="primary">${hostile ? '⚔ 進攻！' : '🚩 出發'}</button>
      <button id="mCancel">取消</button>
    </div>
  `);

  const slider = $('mTroops') as HTMLInputElement;
  const update = () => {
    $('mTroopsVal').textContent = (+slider.value).toLocaleString();
    $('mLeft').textContent = (src.troops - +slider.value).toLocaleString();
  };
  slider.oninput = update; update();

  ($('mCancel') as HTMLButtonElement).onclick = () => { sfx('back'); hideModal(); };
  ($('mGo') as HTMLButtonElement).onclick = () => {
    const picked = [...document.querySelectorAll('#mOfficers input:checked')].map((i) => (i as HTMLInputElement).value).slice(0, 3);
    if (picked.length === 0) { log('⚠ 請至少選擇一名統軍將領。'); return; }
    const troops = +slider.value;
    hideModal();
    if (!hostile) {
      if (!G.cp) { log('⚠ 指令點不足。'); return; }
      G.cp--;
      moveOfficers(from, to, picked, troops);
      sfx('confirm');
      return;
    }
    if (!G.cp) { log('⚠ 指令點不足。'); return; }
    G.cp--;
    src.troops -= troops;
    for (const id of picked) G.officers[id].acted = true;
    const setup: BattleSetup = {
      attacker: G.playerFaction, defender: tgt.owner, cityId: to,
      atkOfficers: picked, defOfficers: defOff.slice(0, 3).map((o) => o.id),
      atkTroops: troops, defTroops: tgt.troops, walls: tgt.walls,
      playerSide: 'atk', sourceCityId: from,
    };
    const myPow = armyPower(troops, picked);
    const defPow = armyPower(tgt.troops, setup.defOfficers, tgt.walls);
    const odds = myPow > defPow * 1.3 ? '勝算頗大' : myPow > defPow * 0.8 ? '勢均力敵' : '凶多吉少';
    showModal({
      title: `${cityDef(to).name}之戰`,
      text: `我軍${troops.toLocaleString()}對上守軍${tgt.troops.toLocaleString()}。此戰${odds}。`,
      choices: [
        { label: '⚔ 親臨戰陣（戰術戰鬥）', onPick: () => bus.emit('launchBattle', setup) },
        { label: '⚡ 委由將領（自動結算）', onPick: () => { const r = autoResolve(setup); reportBattle(setup, r); applyBattleResult(setup, r); onBattleComplete(); } },
        { label: '收兵作罷', onPick: () => { src.troops += troops; G.cp++; for (const id of picked) G.officers[id].acted = false; bus.emit('refresh'); } },
      ],
    });
  };
}

// ============================================================ modal

export function showModalRaw(html: string) {
  $('modal').innerHTML = html;
  $('modalWrap').classList.remove('hidden');
}
export function hideModal() { $('modalWrap').classList.add('hidden'); }

const modalQueue: any[] = [];
let modalOpen = false;

export function showModal(m: { title: string; text: string; choices: { label: string; disabled?: boolean; effects?: any[]; onPick?: () => void }[] }) {
  if (modalOpen) { modalQueue.push(m); return; }
  modalOpen = true;
  sfx('open');
  showModalRaw(`
    <h2>${m.title}</h2>
    <div class="mBody">${m.text}</div>
    <div class="mChoices">${m.choices.map((c, i) => `<button data-i="${i}" ${c.disabled ? 'disabled' : ''}>${c.label}</button>`).join('')}</div>
  `);
  document.querySelectorAll('#modal .mChoices button').forEach((b) => {
    (b as HTMLButtonElement).onclick = () => {
      const ch = m.choices[+(b as HTMLElement).dataset.i!];
      hideModal();
      modalOpen = false;
      sfx('click');
      if (ch.effects) applyEffects(ch.effects);
      ch.onPick?.();
      if (modalQueue.length) showModal(modalQueue.shift());
    };
  });
}

// ============================================================ game over

function gameOver(kind: 'win' | 'lose') {
  banner(kind === 'win' ? '天下統一' : '滅亡');
  setTimeout(() => {
    showModal({
      title: kind === 'win' ? '🏆 天命所歸' : '💀 大勢已去',
      text: kind === 'win'
        ? `${yearOf(G.turn)}年，你的旌旗飄揚於十二座名城之上。群雄俯首，萬民擁戴，新的王朝就此誕生。天下大勢，分久必合——亂世，終於在你手中落幕。\n\n天下統一！`
        : `最後的城池已然陷落。麾下將領四散飄零，你的名字，從此只存在於亂世的史冊之中。`,
      choices: [{ label: '展開新的征途', onPick: () => { localStorage.removeItem('sango_save_v1'); location.reload(); } }],
    });
  }, 1900);
}
