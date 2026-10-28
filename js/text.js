// 글 편집 모드: 블록을 탭해 요약 메모를 쓰고, 메모를 끌어 같은 시트의 빈칸이나 블록 안으로 옮김
const MOVE_SLOP = 8;

export function initText(app) {
  const { state, findBlock, findSheet, render, changed, snapshot, layout, cellToXY, xyToCell, COLS, ROWS } = app;
  const $ = (id) => document.getElementById(id);
  const panel = $('text-editor');
  const input = $('text-input');
  let editing = null; // { block, snapped }
  let t = null;       // 진행 중인 터치

  // ---------- 탭: 요약 메모 편집 ----------
  function open(blockId) {
    const { block } = findBlock(blockId);
    editing = { block, snapped: false };
    input.value = block.summary || '';
    $('text-inside').hidden = !block.notePos;
    panel.hidden = false;
    input.focus();
  }

  function close() {
    if (!editing) return;
    panel.hidden = true;
    input.blur();
    editing = null;
  }

  function change(fn) {
    if (!editing.snapped) {
      snapshot();
      editing.snapped = true;
    }
    fn(editing.block);
    render();
    changed();
  }

  input.addEventListener('input', () => change((b) => { b.summary = input.value.trim() ? input.value : ''; }));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(); });
  $('text-done').addEventListener('click', close);
  $('text-clear').addEventListener('click', () => {
    input.value = '';
    change((b) => { b.summary = ''; b.notePos = null; });
    $('text-inside').hidden = true;
    input.focus();
  });
  $('text-inside').addEventListener('click', () => {
    change((b) => { b.notePos = null; });
    $('text-inside').hidden = true;
  });

  // ---------- 끌기: 요약 메모 위치 옮기기 ----------
  $('timeline').addEventListener('pointerdown', (e) => {
    if (!state.texting || t) return;
    const el = e.target.closest('.grid .block, .note');
    if (!el) return;
    e.preventDefault();
    const id = el.dataset.id || el.dataset.note;
    t = { id, x: e.clientX, y: e.clientY, dragging: false };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  });

  function startDrag() {
    const { block, sheet } = findBlock(t.id);
    if (!block.summary) return false; // 쓸 메모가 없으면 끌 것도 없음
    t.dragging = true;
    t.block = block;
    t.sheet = sheet;
    t.grid = document.querySelector(`[data-sheet="${sheet.id}"] .grid`);
    const chip = document.createElement('div');
    chip.className = 'note-drag';
    chip.textContent = block.summary;
    document.body.appendChild(chip);
    t.chip = chip;
    document.addEventListener('touchmove', blockScroll, { passive: false });
    return true;
  }

  function onMove(e) {
    if (!t) return;
    if (!t.dragging) {
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) < MOVE_SLOP) return;
      if (!startDrag()) return onCancel();
    }
    t.chip.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -120%)`;
    t.target = target(e.clientX, e.clientY);
    showGhost(t.target);
  }

  // 놓을 수 있는 곳: 같은 시트의 빈칸, 또는 자기 블록 위(안으로 되돌림)
  function target(x, y) {
    const L = layout();
    const r = t.grid.getBoundingClientRect();
    const lx = x - r.left - L.cell / 2;
    const ly = y - r.top - L.cell / 2;
    const pad = L.step * 0.5;
    if (lx < -pad || ly < -pad || lx > r.width - L.cell + pad || ly > r.height - L.cell + pad) return null;
    let { col, row } = xyToCell(lx, ly, L);
    col = Math.max(0, Math.min(COLS - 1, col));
    row = Math.max(0, Math.min(ROWS - 1, row));
    const own = t.block.col === col && t.block.row === row;
    const blocked = t.sheet.blocks.some((b) =>
      b !== t.block && ((b.col === col && b.row === row) || (b.notePos && b.notePos.col === col && b.notePos.row === row)));
    return { col, row, inside: own, ok: own || !blocked };
  }

  function showGhost(tg) {
    const ghost = t.grid.querySelector('.ghost');
    ghost.classList.remove('show', 'bad', 'recolor', 'note-spot');
    if (!tg) return;
    const [gx, gy] = cellToXY(tg.col, tg.row, layout());
    ghost.style.left = `${gx}px`;
    ghost.style.top = `${gy}px`;
    ghost.classList.add('show', tg.ok ? 'note-spot' : 'bad');
  }

  function onUp() {
    if (!t) return;
    const { dragging, target: tg, block, id } = t;
    cleanup();
    if (!dragging) return open(id);
    if (!tg || !tg.ok) return;
    snapshot();
    block.notePos = tg.inside ? null : { col: tg.col, row: tg.row };
    render();
    changed();
  }

  function onCancel() {
    cleanup();
  }

  function cleanup() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('touchmove', blockScroll);
    if (t && t.chip) t.chip.remove();
    if (t && t.grid) t.grid.querySelector('.ghost').classList.remove('show', 'bad', 'note-spot');
    t = null;
  }

  function blockScroll(e) {
    e.preventDefault();
  }

  // 글 모드를 끄면 편집 창도 닫음
  $('btn-text').addEventListener('click', () => { if (!state.texting) close(); });
  $('btn-edit').addEventListener('click', close);

  return { close, findSheet };
}
