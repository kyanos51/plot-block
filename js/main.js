// 플롯 블록: 타임라인 시트, 블록 쌓기, 저장
import { initPop } from './pop.js';
import { initMemo, extractTags, addTags } from './memo.js';
import { initPalette } from './palette.js';
import { initText } from './text.js';
import { initSheetInfo } from './sheetinfo.js';
import { initSearch } from './search.js';
import { initSettings } from './settings.js';
import { loadDoc, saveDoc, clearDoc } from './store.js';

const $ = (id) => document.getElementById(id);

// 화면 맨 아래에 표시. 수정을 올릴 때마다 올려서 반영 여부를 확인
const VERSION = 'r29';

// ---------- 문서 ----------
const PRESETS = ['#F2CCC3', '#C79C90', '#C0D4EE', '#F6DCAE'];
const COLS = 5;
const ROWS = 3;

const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 처음 실행할 때만 쓰는 예시 배치
function sampleDoc() {
  const b = (slot, col, row, summary, stage = 0) =>
    ({ id: uid('b'), slot, col, row, summary, stage, memoTitle: '', body: '' });
  return {
    version: 1,
    settings: { edge: false, noteFs: 12 },
    meta: {},
    slots: PRESETS.map((color) => ({ color, meaning: '' })),
    sheets: [
      { id: uid('s'), from: 1, to: 17, blocks: [b(0, 0, 1, '첫 만남', 2), b(2, 2, 1, '복선', 2)] },
      { id: uid('s'), from: 18, blocks: [b(1, 1, 1, '배신'), b(0, 3, 1, '재회', 2)] },
      { id: uid('s'), from: 19, to: 30, blocks: [b(3, 0, 1, '수련'), b(2, 2, 1, '회수'), b(0, 4, 1, '고백', 2)] },
      { id: uid('s'), from: 31, to: 35, blocks: [b(2, 1, 1, '진실', 1)] },
      { id: uid('s'), from: 36, to: 50, blocks: [] },
    ],
  };
}

const state = {
  doc: null,
  loadFailed: false, // 읽기에 실패하면 기존 데이터를 덮어쓰지 않도록 저장을 멈춤
  editing: false,
  texting: false, // 글(요약 메모) 편집 모드
  popOff: false,
};

// ---------- 자동 저장 ----------
let saveTimer = null;
function changed() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}
function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (state.loadFailed) return toast('저장소를 읽지 못해 저장하지 않습니다. 앱을 다시 열어 주세요');
  saveDoc(state.doc).catch(() => toast('저장에 실패했습니다'));
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && saveTimer) flush();
});

// ---------- 되돌리기: 변경 직전 상태를 최대 20개 보관 (앱을 닫으면 사라짐) ----------
const history = [];
function snapshot() {
  history.push(JSON.stringify(state.doc));
  if (history.length > 20) history.shift();
  updateUndo();
}
function undo() {
  if (!history.length) return;
  state.doc = JSON.parse(history.pop());
  renderTray();
  render();
  updateUndo();
  changed();
  toast('되돌렸습니다');
}
function updateUndo() {
  $('btn-undo').disabled = history.length === 0;
}

const color = (slot) => state.doc.slots[slot].color;
const findSheet = (id) => state.doc.sheets.find((s) => s.id === id);
function findBlock(id) {
  for (const s of state.doc.sheets) {
    const b = s.blocks.find((x) => x.id === id);
    if (b) return { sheet: s, block: b };
  }
  return null;
}

// 요약 메모 바깥 위치: 블록의 상하좌우 한 칸 (데이터 좌표 기준)
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const inGrid = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
function noteCell(b) {
  if (!b.noteDir || !DIRS[b.noteDir]) return null;
  const [dc, dr] = DIRS[b.noteDir];
  const col = b.col + dc;
  const row = b.row + dr;
  return inGrid(col, row) ? { col, row } : null;
}
// 바깥 메모 칸에 블록이 생겼거나 다른 메모와 겹치면 그 메모는 블록 안으로
function normalizeNotes(sheet) {
  const used = new Set();
  for (const b of sheet.blocks) {
    const c = noteCell(b);
    if (!b.noteDir) continue;
    const key = c && `${c.col},${c.row}`;
    if (!c || used.has(key) || sheet.blocks.some((o) => o.col === c.col && o.row === c.row)) b.noteDir = null;
    else used.add(key);
  }
}

// 색을 흰색 쪽(+) 또는 검은색 쪽(-)으로 섞음
function mix(hex, amt, alpha = 1) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgba(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)}, ${alpha})`;
}

// ---------- 배치 계산 ----------
const isDesktop = () => window.matchMedia('(min-width: 900px)').matches;

function layout() {
  const desk = isDesktop();
  const gap = 6;
  // 모바일에서 화면 폭을 넘지 않도록 축소
  const cell = desk ? 54 : Math.min(54, Math.floor((window.innerWidth - 32 - gap * 4) / 5));
  return { desk, gap, cell, step: cell + gap };
}

// 데이터는 항상 (열 0~4, 행 0~2). 데스크탑은 진행 방향에 맞춰 화면에서 회전
function cellToXY(col, row, L) {
  return L.desk ? [row * L.step, col * L.step] : [col * L.step, row * L.step];
}
function xyToCell(x, y, L) {
  const a = Math.round(x / L.step);
  const b = Math.round(y / L.step);
  return L.desk ? { col: b, row: a } : { col: a, row: b };
}

// ---------- 렌더링 ----------
let L = layout();

function sheetLabel(s) {
  return s.to && s.to !== s.from ? `${s.from}~${s.to}화` : `${s.from}화`;
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function render() {
  L = layout();
  document.documentElement.style.setProperty('--cell', `${L.cell}px`);
  document.body.classList.toggle('desktop', L.desk);
  document.body.classList.toggle('editing', state.editing);
  document.body.classList.toggle('texting', state.texting);
  applySettings();

  const w = (L.desk ? ROWS : COLS) * L.step - L.gap;
  const h = (L.desk ? COLS : ROWS) * L.step - L.gap;

  $('timeline').innerHTML = state.doc.sheets.map((s) => `
    <section class="sheet" data-sheet="${s.id}">
      <button class="label" data-label="${s.id}">${sheetLabel(s)}${s.memo ? '<span class="label-dot" aria-label="시트 메모 있음"></span>' : ''}</button>
      <div class="grid" style="width:${w}px;height:${h}px">
        <div class="ghost"></div>
        ${s.blocks.map((b) => {
          const [x, y] = cellToXY(b.col, b.row, L);
          // 요약 메모는 블록 안(기본) 또는 블록 상하좌우의 가로형 말풍선
          const out = b.summary && noteCell(b);
          const inside = out ? '' : esc(b.summary || '');
          const note = out ? noteHTML(s, b, out) : '';
          return `<div class="block" data-id="${b.id}"${b.summary ? '' : ' data-empty'} style="--c:${color(b.slot)};left:${x}px;top:${y}px">${inside}</div>${note}`;
        }).join('')}
      </div>
    </section>`).join('') + `<button class="add-sheet" id="add-sheet">+ 시트 추가</button>
    <p class="version">프로토타입 ${VERSION}</p>`;

  $('add-sheet').addEventListener('click', addSheet);
}

// 말풍선은 블록 가장자리에 붙고, 블록 쪽으로 꼬리가 나옴. 블록 색으로 물들여 어느 블록의 메모인지 보이게 함
function noteHTML(sheet, b, cell) {
  const [bx, by] = cellToXY(b.col, b.row, L);
  const [nx, ny] = cellToXY(cell.col, cell.row, L);
  const vx = Math.sign(nx - bx);
  const vy = Math.sign(ny - by);
  // 화면 기준으로 옆 칸이 비어 있으면 말풍선을 더 넓게
  const freeAt = (px, py) => {
    const c = xyToCell(px, py, L);
    return px >= 0 && py >= 0 && inGrid(c.col, c.row) && !sheet.blocks.some((o) => o.col === c.col && o.row === c.row);
  };
  const GAP = 7;
  let pos;
  let maxW;
  let tail;
  if (vy) {
    const wide = freeAt(nx - L.step, ny) && freeAt(nx + L.step, ny);
    maxW = L.step * (wide ? 1.9 : 1) - L.gap;
    pos = vy > 0
      ? `left:${bx + L.cell / 2}px;top:${by + L.cell + GAP}px;transform:translateX(-50%)`
      : `left:${bx + L.cell / 2}px;top:${by - GAP}px;transform:translate(-50%,-100%)`;
    tail = vy > 0 ? 'top' : 'bottom';
  } else {
    // 양옆 배치는 블록 두 칸 길이까지 (바깥쪽 칸이 막혀 있어도 그 위로 겹쳐 표시)
    maxW = L.cell * 2 + L.gap - GAP;
    pos = vx > 0
      ? `left:${bx + L.cell + GAP}px;top:${by + L.cell / 2}px;transform:translateY(-50%)`
      : `left:${bx - GAP}px;top:${by + L.cell / 2}px;transform:translate(-100%,-50%)`;
    tail = vx > 0 ? 'left' : 'right';
  }
  const c = color(b.slot);
  return `<div class="note tail-${tail}" data-note="${b.id}" style="${pos};max-width:${maxW}px;--tint:${mix(c, 0.7)};--edge:${mix(c, -0.15, 0.6)}"><span>${esc(b.summary)}</span></div>`;
}

// 설정: 블록 외곽선, 바깥 메모 글자 크기
function applySettings() {
  const st = state.doc.settings;
  document.body.classList.toggle('edge', !!st.edge);
  document.documentElement.style.setProperty('--note-fs', `${st.noteFs}px`);
}

// 불러온 문서(저장소·백업 파일)를 현재 형식으로 맞춤
function prepareDoc(doc) {
  doc.settings = { edge: false, noteFs: 12, ...(doc.settings || {}) };
  doc.meta = doc.meta || {};
  // r24의 빈칸 메모 위치(notePos)를 상하좌우 방향으로 바꿈. 붙어 있지 않던 메모는 블록 안으로
  for (const sh of doc.sheets) {
    for (const b of sh.blocks) {
      // r28까지 본문에 쓰던 #태그는 태그란으로 옮김
      if (!Array.isArray(b.tags)) b.tags = [];
      if (b.body && b.body.includes('#')) {
        const { names, rest } = extractTags(b.body);
        if (names.length) {
          b.body = rest;
          addTags(b, names);
        }
      }
      if (!b.notePos) continue;
      const dir = Object.keys(DIRS).find((k) => b.col + DIRS[k][0] === b.notePos.col && b.row + DIRS[k][1] === b.notePos.row);
      b.noteDir = dir || null;
      delete b.notePos;
    }
    normalizeNotes(sh);
  }
  return doc;
}

function renderTray() {
  $('tray').innerHTML = `
    ${state.doc.slots.map((s, i) => `<div class="block slot" data-slot="${i}" style="--c:${s.color}"></div>`).join('')}
    <button class="add" id="btn-palette" aria-label="색 변경">+</button>
    <div class="trash">삭제</div>`;
}

function addSheet() {
  snapshot();
  const sheets = state.doc.sheets;
  const last = sheets[sheets.length - 1];
  const from = last ? (last.to || last.from) + 1 : 1;
  sheets.push({ id: uid('s'), from, blocks: [] });
  render();
  changed();
  const el = document.querySelector(`[data-sheet="${sheets[sheets.length - 1].id}"]`);
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
}

async function resetAll() {
  if (!confirm('모든 시트와 메모를 지우고 처음 예시로 되돌립니다. 계속할까요?')) return;
  await clearDoc();
  state.doc = sampleDoc();
  state.loadFailed = false;
  history.length = 0;
  updateUndo();
  renderTray();
  render();
  flush();
  toast('초기화했습니다');
  return true;
}

// ---------- 토스트 ----------
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

// ---------- 끌기 ----------
let drag = null;

function startDrag(e, opts) {
  const { el, kind, slot, text, id } = opts;
  const r = el.getBoundingClientRect();
  const size = L.cell;

  // 손가락 아래 지점을 유지. 트레이에서 꺼낼 때는 블록 중앙을 잡은 것으로 처리
  const offX = kind === 'move' ? e.clientX - r.left : size / 2;
  const offY = kind === 'move' ? e.clientY - r.top : size / 2;

  const wrap = document.createElement('div');
  wrap.className = 'drag picking';
  wrap.innerHTML = `<div class="block" style="--c:${color(slot)};width:${size}px;height:${size}px">${esc(text)}</div>`;
  $('drag-layer').appendChild(wrap);
  const x = kind === 'move' ? r.left : e.clientX - offX;
  const y = kind === 'move' ? r.top : e.clientY - offY;
  wrap.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  // 다음 프레임에 들어 올림 (커지는 전환이 보이도록)
  requestAnimationFrame(() => wrap.classList.remove('picking'));

  if (kind === 'move') el.classList.add('hidden');

  drag = {
    kind, id, slot, el, wrap, offX, offY, x, y,
    px: e.clientX, py: e.clientY, t: performance.now(),
    vx: 0, rot: 0, target: null, cellKey: '', raf: 0, edgeSince: 0,
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  document.addEventListener('touchmove', blockScroll, { passive: false });
  drag.raf = requestAnimationFrame(tick);
}

function onMove(e) {
  if (!drag) return;
  const now = performance.now();
  const dt = Math.max(1, now - drag.t);
  // 가로 속도로 살짝 기울임 (손으로 들고 있는 느낌)
  drag.vx = drag.vx * 0.6 + ((e.clientX - drag.px) / dt) * 0.4;
  drag.px = e.clientX;
  drag.py = e.clientY;
  drag.t = now;
  drag.x = e.clientX - drag.offX;
  drag.y = e.clientY - drag.offY;
  drag.wrap.style.transform = `translate3d(${drag.x}px, ${drag.y}px, 0)`;
  updateTarget();
}

// 매 프레임: 기울기 복원, 가장자리 자동 스크롤
function tick() {
  if (!drag) return;
  drag.rot += (Math.max(-10, Math.min(10, drag.vx * 7)) - drag.rot) * 0.25;
  drag.vx *= 0.9;
  drag.wrap.style.setProperty('--rot', `${drag.rot.toFixed(2)}deg`);

  const speed = autoScrollSpeed();
  if (speed) {
    if (L.desk) $('timeline').scrollLeft += speed;
    else window.scrollBy(0, speed);
    updateTarget();
  }
  drag.raf = requestAnimationFrame(tick);
}

// 블록을 들고 있는 동안 화면이 손가락을 따라 스크롤되지 않게 막음
function blockScroll(e) {
  e.preventDefault();
}

// 자동 스크롤: 트레이에서 꺼낸 블록은 사용 안 함.
// 시트 블록 이동은 가장자리에 0.4초 머물러야 시작 (스치기만 해서는 움직이지 않게)
function autoScrollSpeed() {
  if (drag.kind === 'new') return 0;
  const raw = edgeSpeed();
  if (!raw) {
    drag.edgeSince = 0;
    return 0;
  }
  const now = performance.now();
  if (!drag.edgeSince) drag.edgeSince = now;
  return now - drag.edgeSince >= 400 ? raw : 0;
}

function edgeSpeed() {
  const EDGE = 64;
  const MAX = 14;
  if (L.desk) {
    const r = $('timeline').getBoundingClientRect();
    if (drag.px < r.left + EDGE) return -MAX * (1 - (drag.px - r.left) / EDGE);
    if (drag.px > r.right - EDGE) return MAX * (1 - (r.right - drag.px) / EDGE);
    return 0;
  }
  const top = document.querySelector('.appbar').getBoundingClientRect().bottom;
  const trayTop = $('tray').getBoundingClientRect().top;
  if (drag.py < top + EDGE) return -MAX * Math.min(1, 1 - (drag.py - top) / EDGE);
  // 트레이 위쪽 64px부터 화면 맨 아래까지가 아래 스크롤 구역. 깊이 내릴수록 빨라짐
  const start = trayTop - EDGE;
  if (drag.py > start) {
    const k = Math.min(1, (drag.py - start) / EDGE);
    const below = Math.max(0, drag.py - trayTop) / Math.max(1, window.innerHeight - trayTop);
    return MAX * k + 8 * Math.min(1, below);
  }
  return 0;
}

// 삭제는 트레이 오른쪽 삭제 칸 위에서만 (트레이의 나머지는 아래 스크롤 구역)
function overTrash() {
  const r = $('tray').querySelector('.trash').getBoundingClientRect();
  return drag.px >= r.left - 10 && drag.px <= r.right + 10 && drag.py >= r.top - 10 && drag.py <= r.bottom + 10;
}

function updateTarget() {
  const prev = drag.target;
  let target = null;

  if (overTrash()) {
    target = { trash: true };
  } else {
    const cx = drag.x + L.cell / 2;
    const cy = drag.y + L.cell / 2;
    for (const sheetEl of document.querySelectorAll('.sheet')) {
      const grid = sheetEl.querySelector('.grid');
      const r = grid.getBoundingClientRect();
      const lx = cx - r.left - L.cell / 2;
      const ly = cy - r.top - L.cell / 2;
      const pad = L.step * 0.5;
      if (lx < -pad || ly < -pad || lx > r.width - L.cell + pad || ly > r.height - L.cell + pad) continue;
      let { col, row } = xyToCell(lx, ly, L);
      col = Math.max(0, Math.min(COLS - 1, col));
      row = Math.max(0, Math.min(ROWS - 1, row));
      const sheet = findSheet(sheetEl.dataset.sheet);
      const self = drag.kind === 'move' ? drag.id : null;
      const occupant = sheet.blocks.find((b) => b.id !== self && b.col === col && b.row === row);
      // 트레이 색을 다른 색 블록 위에 놓으면 그 블록의 색을 바꿈
      const recolor = drag.kind === 'new' && occupant && occupant.slot !== drag.slot ? occupant : null;
      target = { sheet, grid, col, row, recolor, ok: !occupant || !!recolor };
      break;
    }
  }
  drag.target = target;

  // 삭제 구역 표시 (새 블록은 트레이에 놓으면 취소)
  $('tray').classList.toggle('hot', !!(target && target.trash && drag.kind === 'move'));

  // 놓일 칸 표시
  const key = target && !target.trash ? `${target.sheet.id}:${target.col}:${target.row}` : '';
  if (key === drag.cellKey) return;
  drag.cellKey = key;
  if (prev && prev.grid) prev.grid.querySelector('.ghost').classList.remove('show', 'bad', 'recolor');
  if (!key) return;
  const ghost = target.grid.querySelector('.ghost');
  const [gx, gy] = cellToXY(target.col, target.row, L);
  ghost.style.left = `${gx}px`;
  ghost.style.top = `${gy}px`;
  ghost.style.setProperty('--c', color(drag.slot));
  ghost.classList.add('show');
  ghost.classList.toggle('bad', !target.ok);
  ghost.classList.toggle('recolor', !!target.recolor);
  ghost.animate(
    [{ transform: 'scale(0.78)' }, { transform: 'scale(1.06)', offset: 0.6 }, { transform: 'scale(1)' }],
    { duration: 180, easing: 'ease-out' }
  );
}

function onUp() {
  if (!drag) return;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onUp);
  document.removeEventListener('touchmove', blockScroll);
  cancelAnimationFrame(drag.raf);
  $('tray').classList.remove('hot');

  const d = drag;
  drag = null;
  const t = d.target;

  if (t && t.trash) {
    if (d.kind === 'move') {
      snapshot();
      const found = findBlock(d.id);
      found.sheet.blocks = found.sheet.blocks.filter((b) => b.id !== d.id);
      flyAway(d, true);
      render();
      changed();
      wiggle($('tray'));
    } else {
      flyAway(d, false);
    }
    return;
  }

  if (t && t.recolor) {
    snapshot();
    t.recolor.slot = d.slot;
    d.wrap.remove();
    render();
    changed();
    const el = document.querySelector(`.grid .block[data-id="${t.recolor.id}"]`);
    el.animate([{ transform: 'scale(1.2)' }, { transform: 'scale(0.92)' }, { transform: 'scale(1)' }],
      { duration: 320, easing: 'ease-out' });
    return;
  }

  if (t && t.ok) {
    snapshot();
    let id = d.id;
    if (d.kind === 'move') {
      const found = findBlock(d.id);
      const b = found.block;
      found.sheet.blocks = found.sheet.blocks.filter((x) => x.id !== d.id);
      b.col = t.col;
      b.row = t.row;
      t.sheet.blocks.push(b);
      normalizeNotes(found.sheet);
    } else {
      id = uid('b');
      t.sheet.blocks.push({ id, slot: d.slot, col: t.col, row: t.row, summary: '', stage: 0, memoTitle: '', body: '' });
    }
    // 메모 자리에 블록이 들어왔거나 메모가 시트 밖으로 나가면 그 메모는 블록 안으로
    normalizeNotes(t.sheet);
    d.wrap.remove();
    render();
    changed();
    land(id, d);
    return;
  }

  // 놓을 수 없는 곳: 원래 자리로 튕겨 돌아감
  if (d.kind === 'move') {
    d.wrap.remove();
    render();
    land(d.id, d, true);
  } else {
    flyAway(d, false);
  }
}

// ---------- 연출 ----------

// 끌던 위치에서 칸으로 착지 (FLIP). rejected면 착지 후 좌우로 흔들림
function land(id, d, rejected = false) {
  const el = document.querySelector(`.grid .block[data-id="${id}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const dx = d.x - r.left;
  const dy = d.y - r.top;
  const shadowUp = '0 14px 22px rgba(60,50,30,0.24), inset 0 -3px 0 rgba(0,0,0,0.08)';
  const shadowDown = '0 0 0 rgba(60,50,30,0), inset 0 -3px 0 rgba(0,0,0,0.08)';

  const fly = el.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(1.12) rotate(${d.rot}deg)`, boxShadow: shadowUp },
    { transform: 'translate(0, 0) scale(1.02)', boxShadow: shadowDown, offset: 0.55 },
    { transform: 'scale(1.1, 0.9)', offset: 0.72 },
    { transform: 'scale(0.97, 1.03)', offset: 0.87 },
    { transform: 'none' },
  ], { duration: rejected ? 460 : 380, easing: 'cubic-bezier(.25, .8, .35, 1)' });

  fly.finished.then(() => {
    if (rejected) {
      el.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' },
          { transform: 'translateX(-3px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }],
        { duration: 280, easing: 'ease-out' }
      );
    } else {
      // 착지 순간 시트가 살짝 눌림
      el.closest('.grid').animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(0)' }],
        { duration: 170, easing: 'ease-out' }
      );
    }
  }).catch(() => {});
}

// 트레이로 빨려 들어감 (삭제) 또는 트레이 슬롯으로 돌아감 (취소)
function flyAway(d, isDelete) {
  const target = isDelete
    ? $('tray').querySelector('.trash')
    : $('tray').querySelector(`.slot[data-slot="${d.slot}"]`);
  const r = target.getBoundingClientRect();
  const tx = r.left + r.width / 2 - L.cell / 2;
  const ty = r.top + r.height / 2 - L.cell / 2;
  const inner = d.wrap.firstElementChild;
  inner.style.transition = 'none';
  const a = d.wrap.animate([
    { transform: `translate3d(${d.x}px, ${d.y}px, 0)` },
    { transform: `translate3d(${tx}px, ${ty}px, 0)` },
  ], { duration: 260, easing: 'cubic-bezier(.5, 0, .7, .4)', fill: 'forwards' });
  inner.animate([
    { transform: `scale(1.12) rotate(${d.rot}deg)`, opacity: 1 },
    { transform: `scale(${isDelete ? 0.2 : 0.8}) rotate(${isDelete ? 90 : 0}deg)`, opacity: isDelete ? 0 : 0.6 },
  ], { duration: 260, easing: 'ease-in', fill: 'forwards' });
  a.finished.then(() => d.wrap.remove()).catch(() => d.wrap.remove());
}

function wiggle(el) {
  el.animate([
    { transform: 'translate(-50%, 0) rotate(0)' },
    { transform: 'translate(-50%, 0) rotate(-2deg)' },
    { transform: 'translate(-50%, 0) rotate(2deg)' },
    { transform: 'translate(-50%, 0) rotate(-1deg)' },
    { transform: 'translate(-50%, 0) rotate(0)' },
  ], { duration: 300, delay: 220, easing: 'ease-out' });
}

// ---------- 입력 연결 ----------
$('timeline').addEventListener('pointerdown', (e) => {
  if (!state.editing || drag) return;
  const el = e.target.closest('.grid .block');
  if (!el) return;
  e.preventDefault();
  const { block } = findBlock(el.dataset.id);
  startDrag(e, { el, kind: 'move', id: block.id, slot: block.slot, text: block.summary || '' });
});

$('tray').addEventListener('pointerdown', (e) => {
  if (!state.editing || drag) return;
  const el = e.target.closest('.slot');
  if (!el) return;
  e.preventDefault();
  startDrag(e, { el, kind: 'new', slot: Number(el.dataset.slot), text: '' });
});

document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.block, .tray')) e.preventDefault();
});

// 블록 편집 모드와 글 편집 모드는 동시에 켜지지 않음
function setMode(mode) {
  state.editing = mode === 'edit';
  state.texting = mode === 'text';
  $('btn-edit').classList.toggle('on', state.editing);
  $('btn-edit').textContent = state.editing ? '완료' : '편집';
  $('btn-text').classList.toggle('on', state.texting);
  $('btn-text').textContent = state.texting ? '완료' : '글';
  $('btn-undo').hidden = !(state.editing || state.texting);
  document.body.classList.toggle('editing', state.editing);
  document.body.classList.toggle('texting', state.texting);
}
$('btn-edit').addEventListener('click', () => setMode(state.editing ? null : 'edit'));
$('btn-text').addEventListener('click', () => setMode(state.texting ? null : 'text'));
$('btn-undo').addEventListener('click', undo);

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-soon]')) toast('이후 단계에서 만들 기능입니다');
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (!drag) render(); }, 120);
});

// ---------- 시작 ----------
async function start() {
  try {
    state.doc = await loadDoc();
  } catch {
    state.loadFailed = true;
    toast('저장된 데이터를 읽지 못했습니다');
  }
  if (!state.doc) {
    state.doc = sampleDoc();
    flush();
  }
  prepareDoc(state.doc);
  renderTray();
  render();
  updateUndo();

  const app = {
    state, color, toast, findBlock, findSheet, render, renderTray, changed, snapshot, sheetLabel, esc, uid, PRESETS,
    COLS, ROWS, DIRS, inGrid, cellToXY, xyToCell, mix, layout: () => L,
    flush, prepareDoc, resetAll, updateUndo, VERSION,
  };
  initSettings(app);
  initText(app);
  initSheetInfo(app);
  initSearch(app);
  const memo = initMemo(app);
  initPop({ ...app, openMemo: memo.open });
  initPalette(app);
}
start();

// 브라우저에 데이터를 지우지 말라고 요청 (Safari는 거절할 수 있음, 그래서 백업을 함께 씀)
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
