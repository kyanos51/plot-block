// 시트 정보: 화수 라벨을 탭하면 화수 구간과 시트 메모를 편집
export function initSheetInfo(app) {
  const { state, findSheet, render, changed, snapshot, toast } = app;
  const $ = (id) => document.getElementById(id);
  const panel = $('sheet-info');
  let cur = null; // { sheet, snapped }

  function open(id) {
    const sheet = findSheet(id);
    cur = { sheet, snapped: false };
    $('sheet-from').value = sheet.from;
    $('sheet-to').value = sheet.to && sheet.to !== sheet.from ? sheet.to : '';
    $('sheet-memo').value = sheet.memo || '';
    panel.hidden = false;
  }

  function touch() {
    if (!cur.snapped) {
      snapshot();
      cur.snapped = true;
    }
  }

  // 완료: 구간을 확인하고 시트를 시작 화수 순서로 정렬
  function done() {
    if (!cur) return;
    const from = parseInt($('sheet-from').value, 10);
    const toRaw = $('sheet-to').value.trim();
    const to = toRaw ? parseInt(toRaw, 10) : null;
    if (!from || from < 1) return toast('시작 화수를 1 이상으로 입력해 주세요');
    if (to !== null && (!to || to < from)) return toast('끝 화수는 시작 화수보다 크거나 같아야 합니다');

    const { sheet } = cur;
    const memo = $('sheet-memo').value;
    const newTo = to && to !== from ? to : undefined;
    if (sheet.from !== from || sheet.to !== newTo || (sheet.memo || '') !== memo) {
      touch();
      sheet.from = from;
      if (newTo) sheet.to = newTo; else delete sheet.to;
      sheet.memo = memo;
      state.doc.sheets.sort((a, b) => a.from - b.from);
      const end = (s) => s.to || s.from;
      const overlap = state.doc.sheets.some((s, i) => i > 0 && s.from <= end(state.doc.sheets[i - 1]));
      if (overlap) toast('화수 구간이 다른 시트와 겹칩니다');
      render();
      changed();
    }
    close();
  }

  function close() {
    panel.hidden = true;
    document.activeElement && document.activeElement.blur();
    cur = null;
  }

  $('timeline').addEventListener('click', (e) => {
    const label = e.target.closest('[data-label]');
    if (label) open(label.dataset.label);
  });
  $('sheet-done').addEventListener('click', done);
  $('sheet-delete').addEventListener('click', () => {
    const { sheet } = cur;
    const n = sheet.blocks.length;
    if (!confirm(n ? `이 시트와 블록 ${n}개를 삭제할까요? 되돌리기로 복구할 수 있습니다.` : '이 시트를 삭제할까요?')) return;
    touch();
    state.doc.sheets = state.doc.sheets.filter((s) => s !== sheet);
    render();
    changed();
    close();
    toast('시트를 삭제했습니다');
  });
}
