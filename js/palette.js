// 색 슬롯 패널: 슬롯 4개의 색 변경과 프리셋 초기화 (삭제는 없음)
export function initPalette(app) {
  const { state, render, renderTray, changed, snapshot, esc, PRESETS } = app;
  const $ = (id) => document.getElementById(id);
  const panel = $('palette');
  let snapped = false; // 패널을 연 동안 되돌리기 기록은 한 번만

  function rows() {
    $('palette-rows').innerHTML = state.doc.slots.map((s, i) => `
      <div class="prow">
        <label class="pchip" style="--c:${s.color}">
          <input type="color" value="${s.color}" data-i="${i}" aria-label="슬롯 ${i + 1} 색">
        </label>
        <span class="pmean">${s.meaning ? esc(s.meaning) : '<i>의미 없음</i>'}</span>
        <button class="preset" data-reset="${i}" ${s.color.toUpperCase() === PRESETS[i] ? 'disabled' : ''}>초기화</button>
      </div>`).join('');
  }

  function open() {
    snapped = false;
    rows();
    panel.hidden = false;
    panel.animate([{ transform: 'translate(-50%, 16px)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1 }],
      { duration: 200, easing: 'ease-out' });
  }

  function close() {
    panel.hidden = true;
  }

  function setColor(i, value) {
    if (!snapped) {
      snapshot();
      snapped = true;
    }
    state.doc.slots[i].color = value.toUpperCase();
    render();
    renderTray();
    changed();
  }

  $('tray').addEventListener('click', (e) => {
    if (e.target.closest('#btn-palette')) open();
  });
  $('palette-close').addEventListener('click', close);
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !e.target.closest('#palette, #btn-palette')) close();
  });

  $('palette-rows').addEventListener('input', (e) => {
    if (e.target.type !== 'color') return;
    const i = Number(e.target.dataset.i);
    setColor(i, e.target.value);
    e.target.parentElement.style.setProperty('--c', e.target.value);
    const reset = $('palette-rows').querySelector(`[data-reset="${i}"]`);
    reset.disabled = e.target.value.toUpperCase() === PRESETS[i];
  });

  $('palette-rows').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-reset]');
    if (!btn) return;
    setColor(Number(btn.dataset.reset), PRESETS[Number(btn.dataset.reset)]);
    rows();
  });
}
