// 프로토타입: 블록 쌓기(Phase 2)와 터뜨리기(Phase 3) 조작감 검증 (데이터 저장 없음)
import { initPop } from './pop.js';

const $ = (id) => document.getElementById(id);

// 화면 맨 아래에 표시. 수정을 올릴 때마다 올려서 반영 여부를 확인
const VERSION = 'r6';

// ---------- 상태 ----------
const SLOTS = ['#F2CCC3', '#C79C90', '#C0D4EE', '#F6DCAE'];
const COLS = 5;
const ROWS = 3;

let nextId = 100;
const uid = () => `b${nextId++}`;

const state = {
  editing: false,
  popOff: false,
  stageTest: false, // 테스트용: 탭해서 완성도 지정
  sheets: [
    { id: 's1', from: 1, to: 17, blocks: [
      { id: 'b1', slot: 0, col: 0, row: 1, title: '첫 만남', stage: 2 },
      { id: 'b2', slot: 2, col: 2, row: 1, title: '복선', stage: 2 },
    ] },
    { id: 's2', from: 18, blocks: [
      { id: 'b3', slot: 1, col: 1, row: 1, title: '배신' },
      { id: 'b4', slot: 0, col: 3, row: 1, title: '재회', stage: 2 },
    ] },
    { id: 's3', from: 19, to: 30, blocks: [
      { id: 'b5', slot: 3, col: 0, row: 1, title: '수련' },
      { id: 'b6', slot: 2, col: 2, row: 1, title: '회수' },
      { id: 'b7', slot: 0, col: 4, row: 1, title: '고백', stage: 2 },
    ] },
    { id: 's4', from: 31, to: 35, blocks: [
      { id: 'b8', slot: 2, col: 1, row: 1, title: '진실', stage: 1 },
    ] },
    { id: 's5', from: 36, to: 50, blocks: [] },
  ],
};

// 되돌리기: 변경 직전 상태를 최대 20개 보관 (앱을 닫으면 사라짐)
const history = [];
function snapshot() {
  history.push(JSON.stringify(state.sheets));
  if (history.length > 20) history.shift();
  updateUndo();
}
function undo() {
  if (!history.length) return;
  state.sheets = JSON.parse(history.pop());
  render();
  updateUndo();
  toast('되돌렸습니다');
}
function updateUndo() {
  $('btn-undo').disabled = history.length === 0;
}

const findSheet = (id) => state.sheets.find((s) => s.id === id);
function findBlock(id) {
  for (const s of state.sheets) {
    const b = s.blocks.find((x) => x.id === id);
    if (b) return { sheet: s, block: b };
  }
  return null;
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

function render() {
  L = layout();
  document.documentElement.style.setProperty('--cell', `${L.cell}px`);
  document.body.classList.toggle('desktop', L.desk);
  document.body.classList.toggle('editing', state.editing);
  document.body.classList.toggle('stage-test', state.stageTest);

  const w = (L.desk ? ROWS : COLS) * L.step - L.gap;
  const h = (L.desk ? COLS : ROWS) * L.step - L.gap;

  $('timeline').innerHTML = state.sheets.map((s) => `
    <section class="sheet" data-sheet="${s.id}">
      <div class="label">${sheetLabel(s)}</div>
      <div class="grid" style="width:${w}px;height:${h}px">
        <div class="ghost"></div>
        ${s.blocks.map((b) => {
          const [x, y] = cellToXY(b.col, b.row, L);
          return `<div class="block" data-id="${b.id}" data-stage="${b.stage || 0}" style="--c:${SLOTS[b.slot]};left:${x}px;top:${y}px">${b.title}</div>`;
        }).join('')}
      </div>
    </section>`).join('') + `<button class="add-sheet" id="add-sheet">+ 시트 추가</button>
    <button class="stage-test-btn" id="stage-test">${state.stageTest ? '완성도 지정 끝내기' : '완성도 지정 (테스트용)'}</button>
    <p class="version">프로토타입 ${VERSION}</p>`;

  $('add-sheet').addEventListener('click', addSheet);
  $('stage-test').addEventListener('click', () => {
    state.stageTest = !state.stageTest;
    if (state.stageTest) toast('블록을 탭하면 설계 → 검토 → 완성 순으로 바뀝니다');
    render();
  });
}

function renderTray() {
  $('tray').innerHTML = `
    ${SLOTS.map((c, i) => `<div class="block slot" data-slot="${i}" style="--c:${c}"></div>`).join('')}
    <button class="add" data-soon aria-label="색 변경">+</button>
    <div class="trash">삭제</div>`;
}

function addSheet() {
  snapshot();
  const last = state.sheets[state.sheets.length - 1];
  const from = last ? (last.to || last.from) + 1 : 1;
  state.sheets.push({ id: `s${nextId++}`, from, blocks: [] });
  render();
  const el = document.querySelector(`[data-sheet="${state.sheets[state.sheets.length - 1].id}"]`);
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
}

// ---------- 토스트 ----------
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
}

// ---------- 끌기 ----------
let drag = null;

function startDrag(e, opts) {
  const { el, kind, slot, title, id } = opts;
  const r = el.getBoundingClientRect();
  const size = L.cell;

  // 손가락 아래 지점을 유지. 트레이에서 꺼낼 때는 블록 중앙을 잡은 것으로 처리
  const offX = kind === 'move' ? e.clientX - r.left : size / 2;
  const offY = kind === 'move' ? e.clientY - r.top : size / 2;

  const wrap = document.createElement('div');
  wrap.className = 'drag picking';
  wrap.innerHTML = `<div class="block" style="--c:${SLOTS[slot]};width:${size}px;height:${size}px">${title}</div>`;
  $('drag-layer').appendChild(wrap);
  const x = kind === 'move' ? r.left : e.clientX - offX;
  const y = kind === 'move' ? r.top : e.clientY - offY;
  wrap.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  // 다음 프레임에 들어 올림 (커지는 전환이 보이도록)
  requestAnimationFrame(() => wrap.classList.remove('picking'));

  if (kind === 'move') el.classList.add('hidden');

  drag = {
    kind, id, slot, title, el, wrap, offX, offY, x, y,
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
      target = { sheet, grid, col, row, ok: canPlace(sheet, col, row) };
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
  if (prev && prev.grid) prev.grid.querySelector('.ghost').classList.remove('show', 'bad');
  if (!key) return;
  const ghost = target.grid.querySelector('.ghost');
  const [gx, gy] = cellToXY(target.col, target.row, L);
  ghost.style.left = `${gx}px`;
  ghost.style.top = `${gy}px`;
  ghost.style.setProperty('--c', SLOTS[drag.slot]);
  ghost.classList.add('show');
  ghost.classList.toggle('bad', !target.ok);
  ghost.animate(
    [{ transform: 'scale(0.78)' }, { transform: 'scale(1.06)', offset: 0.6 }, { transform: 'scale(1)' }],
    { duration: 180, easing: 'ease-out' }
  );
}

function canPlace(sheet, col, row) {
  const self = drag.kind === 'move' ? drag.id : null;
  if (sheet.blocks.some((b) => b.id !== self && b.col === col && b.row === row)) return false;
  return true;
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
      wiggle($('tray'));
    } else {
      flyAway(d, false);
    }
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
    } else {
      id = uid();
      t.sheet.blocks.push({ id, slot: d.slot, col: t.col, row: t.row, title: '', stage: 0 });
    }
    d.wrap.remove();
    render();
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
  startDrag(e, { el, kind: 'move', id: block.id, slot: block.slot, title: block.title });
});

$('tray').addEventListener('pointerdown', (e) => {
  if (!state.editing || drag) return;
  const el = e.target.closest('.slot');
  if (!el) return;
  e.preventDefault();
  startDrag(e, { el, kind: 'new', slot: Number(el.dataset.slot), title: '' });
});

// 테스트용 완성도 지정: 탭할 때마다 설계(0) → 검토(1) → 완성(2)
$('timeline').addEventListener('click', (e) => {
  if (!state.stageTest || state.editing) return;
  const el = e.target.closest('.grid .block');
  if (!el) return;
  const { block } = findBlock(el.dataset.id);
  block.stage = ((block.stage || 0) + 1) % 3;
  toast(['설계', '검토', '완성'][block.stage]);
  render();
});

document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.block, .tray')) e.preventDefault();
});

$('btn-edit').addEventListener('click', () => {
  state.editing = !state.editing;
  $('btn-edit').classList.toggle('on', state.editing);
  $('btn-edit').textContent = state.editing ? '완료' : '편집';
  $('btn-undo').hidden = !state.editing;
  document.body.classList.toggle('editing', state.editing);
});
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
renderTray();
render();
updateUndo();
initPop({ state, SLOTS, toast, findBlock });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
