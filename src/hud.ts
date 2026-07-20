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
export const TROOP_NAMES: Record<string, string> = { infantry: '보병', cavalry: '기병', archer: '궁병' };

let selectedCity: string | null = null;

// ============================================================ setup

export function initHud() {
  $('endTurnBtn').onclick = () => { if (!isBusy()) { sfx('click'); endTurn(); } };
  $('saveBtn').onclick = () => { saveGame(); log('💾 진행 상황이 저장되었습니다.'); sfx('confirm'); };

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
  $('dateVal').textContent = `${yearOf(G.turn)}년 ${seasonOf(G.turn)} ${monthOf(G.turn)}월`;
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
  const acted = o.acted ? `<span class="tag" style="background:#444;color:#999">행동함</span>` : '';
  return `<div class="officer-card" title="${sk.name}: ${sk.desc}${o.item ? `\n보물: ${itemDef(o.item).name} — ${itemDef(o.item).desc}` : ''}">
    ${portraitHtml(o)}
    <div class="info">
      <div class="nm">${d.name} <span class="lv">Lv${o.level}</span>${acted}</div>
      <div class="st">${TROOP_ICONS[d.troop]} 무력 ${effStat(o, 'war')} · 지력 ${effStat(o, 'int')} · 통솔 ${effStat(o, 'ldr')} · 정치 ${effStat(o, 'pol')}</div>
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
    $('sideSub').textContent = '진영 개관';
    const myCities = citiesOf(G.playerFaction);
    const troops = myCities.reduce((s, c) => s + c.troops, 0);
    const officers = Object.values(G.officers).filter((o) => o.faction === G.playerFaction);
    body.innerHTML = `
      <div class="statgrid">
        <div class="row"><span>성도</span><b>${myCities.length} / 20</b></div>
        <div class="row"><span>목표</span><b>12개 성도</b></div>
        <div class="row"><span>총병력</span><b>${troops.toLocaleString()}</b></div>
        <div class="row"><span>장수</span><b>${officers.length}</b></div>
      </div>
      <div style="color:var(--muted);font-size:12px;margin-bottom:6px">지도에서 아군 성도를 선택해 명령을 내리세요. ⚡ 명령점은 매 턴 회복됩니다.</div>
      ${officers.map((o) => officerCard(o)).join('')}
    `;
    return;
  }

  const cd = cityDef(selectedCity);
  const c = G.cities[selectedCity];
  const own = c.owner === G.playerFaction;
  const f = faction(c.owner);
  $('sideTitle').textContent = cd.name;
  $('sideSub').innerHTML = `<span style="color:${f.color}">⬤</span> ${f.name}${cd.capital ? ' · 수도' : ''}`;

  const stats = `
    <div class="statgrid">
      <div class="row"><span>병력</span><b>${c.troops.toLocaleString()}</b></div>
      <div class="row"><span>성벽</span><b>${'▮'.repeat(c.walls)}${'▯'.repeat(5 - c.walls)}</b></div>
      <div class="row"><span>농지</span><b>${'▮'.repeat(c.farm)}${'▯'.repeat(6 - c.farm)}</b></div>
      <div class="row"><span>시장</span><b>${'▮'.repeat(c.market)}${'▯'.repeat(6 - c.market)}</b></div>
    </div>`;

  if (!own) {
    const officers = officersIn(selectedCity, c.owner);
    body.innerHTML = `${stats}
      <div style="color:var(--muted);font-size:12px;margin-bottom:8px">
        ${c.owner === 'neutral' ? '재야 성도 — 수비 약함.' : `${f.name}의 영지.`}
        인접한 아군 성도에서 출병하여 빼앗을 수 있습니다.
      </div>
      ${officers.map((o) => officerCard(o)).join('')}`;
    return;
  }

  const officers = officersIn(selectedCity, G.playerFaction);
  const canAct = !isBusy() && !G.over;
  body.innerHTML = `${stats}
    <div class="actions">
      <button id="bFarm" ${!canAct ? 'disabled' : ''} title="매 레벨마다 매 턴 식량 +50 (${DEV_COST} 금, 1⚡)">🌾 개간</button>
      <button id="bMarket" ${!canAct ? 'disabled' : ''} title="매 레벨마다 매 턴 금전 +60 (${DEV_COST} 금, 1⚡)">🪙 통상</button>
      <button id="bWalls" ${!canAct ? 'disabled' : ''} title="수비 강화 (${DEV_COST} 금, 1⚡)">🧱 축성</button>
      <button id="bRecruit" ${!canAct ? 'disabled' : ''} title="병력 +1500 (200 금 +300 식량, 1⚡)">⚔ 징병</button>
      <button id="bMarch" class="primary" ${!canAct || officers.length === 0 ? 'disabled' : ''} title="장수와 부대를 인접한 성으로 출정 (1⚡)">🚩 출정</button>
    </div>
    <div style="margin-top:12px;font-size:12px;color:var(--muted)">주둔 장수${freeOfficersIn(selectedCity).length > 0 ? ' · <i>소문에 성 중에 재야 인재가 있다고……</i>' : ''}</div>
    ${officers.map((o) => officerCard(o, `
        <button data-search="${o.id}" ${!canAct || o.acted ? 'disabled' : ''} title="성 안의 재야 인재를 수색 / 세금 징수 (1⚡)">🔍</button>
        <button data-train="${o.id}" ${!canAct || o.acted ? 'disabled' : ''} title="조련: 경험치 획득 (150 금, 1⚡)">🎯</button>
      `)).join('')}
  `;
  if (canAct) {
    ($('bFarm') as HTMLButtonElement).onclick = () => { sfx('click'); develop(selectedCity!, 'farm'); };
    ($('bMarket') as HTMLButtonElement).onclick = () => { sfx('click'); develop(selectedCity!, 'market'); };
    ($('bWalls') as HTMLButtonElement).onclick = () => { sfx('click'); develop(selectedCity!, 'walls'); };
    ($('bRecruit') as HTMLButtonElement).onclick = () => { sfx('click'); recruit(selectedCity!); };
    const marchBtn = $('bMarch') as HTMLButtonElement;
    if (marchBtn) marchBtn.onclick = () => { sfx('click'); bus.emit('marchMode', selectedCity); log('🚩 지도에서 인접한 목적지를 선택하세요 (우클릭으로 취소).'); };
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
  if (officers.length === 0) { log('⚠ 이 성엔 출정할 장수가 없음.'); return; }

  const defOff = officersIn(to, tgt.owner);
  const intel = hostile
    ? `<div style="font-size:12px;color:var(--muted);margin:4px 0 10px">수비군: 약 ${tgt.troops.toLocaleString()}병력, 성벽${tgt.walls}단계${defOff.length ? ', 수장: ' + defOff.map((o) => officerDef(o.id).name).join('、') : ''}</div>`
    : `<div style="font-size:12px;color:var(--muted);margin:4px 0 10px">아군 성도 — 부대와 장수를 이동.</div>`;

  const maxTroops = Math.max(0, src.troops - 500);
  if (hostile && maxTroops < 500) { log('⚠ 출정할 병력이 부족합니다 (최소 500명 주둔 필요).'); return; }

  showModalRaw(`
    <h2>${hostile ? '⚔ 공격' : '🚩 이동'}${cityDef(to).name}</h2>
    <div class="mShort">${cityDef(from).name}에서 출발 · 출정 후 잔류 병력: <b id="mLeft"></b></div>
    ${intel}
    <div style="font-size:13px;margin-bottom:6px">통솔 장수 (최대 3명):</div>
    <div id="mOfficers">${officers.map((o) => `
      <label class="officer-card" style="cursor:pointer">
        <input type="checkbox" value="${o.id}" style="accent-color:#d4a536">
        ${portraitHtml(o, 36)}
        <div class="info"><div class="nm">${officerDef(o.id).name} <span class="lv">Lv${o.level}</span></div>
        <div class="st">${TROOP_ICONS[officerDef(o.id).troop]} 무력 ${effStat(o, 'war')} · 통솔 ${effStat(o, 'ldr')} · ✦ ${skillDef(officerDef(o.id).skill).name}</div></div>
      </label>`).join('')}
    </div>
    <div style="margin:12px 0 4px;font-size:13px">출정 병력: <b id="mTroopsVal"></b></div>
    <input id="mTroops" type="range" min="500" max="${Math.max(500, maxTroops)}" value="${Math.max(500, Math.floor(maxTroops * 0.8))}" step="100" style="width:100%">
    <div class="mChoices">
      <button id="mGo" class="primary">${hostile ? '⚔ 공격!' : '🚩 출발'}</button>
      <button id="mCancel">취소</button>
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
    if (picked.length === 0) { log('⚠ 통솔할 장수를 최소 1명 선택하세요.'); return; }
    const troops = +slider.value;
    hideModal();
    if (!hostile) {
      if (!G.cp) { log('⚠ 명령점이 부족합니다.'); return; }
      G.cp--;
      moveOfficers(from, to, picked, troops);
      sfx('confirm');
      return;
    }
    if (!G.cp) { log('⚠ 명령점이 부족합니다.'); return; }
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
    const odds = myPow > defPow * 1.3 ? '승산 크다' : myPow > defPow * 0.8 ? '호각세' : '흉조';  // 형세
    showModal({
      title: `${cityDef(to).name} 전투`,
      text: `아군 ${troops.toLocaleString()} vs 수비군 ${tgt.troops.toLocaleString()}. 이 전투 ${odds}.`,
      choices: [
        { label: '⚔ 직접 지휘 (전술 전투)', onPick: () => bus.emit('launchBattle', setup) },
        { label: '⚡ 장수에게 위임 (자동 결산)', onPick: () => { const r = autoResolve(setup); reportBattle(setup, r); applyBattleResult(setup, r); onBattleComplete(); } },
        { label: '병사 철수', onPick: () => { src.troops += troops; G.cp++; for (const id of picked) G.officers[id].acted = false; bus.emit('refresh'); } },
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
  banner(kind === 'win' ? '천하 통일' : '멸망');
  setTimeout(() => {
    showModal({
      title: kind === 'win' ? '🏆 천명소귀' : '💀 대세막아',
      text: kind === 'win'
        ? `${yearOf(G.turn)}년, 당신의 깃발이 열두 개유명의 도시 위에 나부낍니다. 군웅이 머리를 숙이고 만민이 추대하여, 새 왕조가 탄생합니다. 천하의 대세는 갈라졌다 합쳐지기를 반복하더니 — 난세가 드디어 당신의 손에서 막을 내립니다.\n\n천하 통일!`
        : `마지막 성도마저 함락되었습니다. 휘하 장수들이 사방으로 흩어졌고, 당신의 이름은 이제 난세의 역사 속에서만 전해질 뿐입니다.`,
      choices: [{ label: '새로운 출정 시작', onPick: () => { localStorage.removeItem('sango_save_v1'); location.reload(); } }],
    });
  }, 1900);
}
