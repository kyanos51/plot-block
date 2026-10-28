// 화수 검색: 그 화수가 들어 있는 시트로 바로 이동 (구간 중간이면 시트 시작점)
export function initSearch(app) {
  const { state, sheetLabel, toast, layout } = app;
  const input = document.getElementById('search');

  function find(n) {
    const sheets = state.doc.sheets;
    const hit = sheets.find((s) => n >= s.from && n <= (s.to || s.from));
    if (hit) return { sheet: hit, exact: true };
    // 없으면 n보다 앞에서 가장 가까운 시트, 그것도 없으면 첫 시트
    const before = sheets.filter((s) => s.from <= n).pop();
    return { sheet: before || sheets[0], exact: false };
  }

  let timer = null;
  let last = { n: 0, at: 0 };

  // auto: 입력을 멈춰서 자동 이동한 경우. 키보드는 닫지 않음 (두 자리 이상 이어서 입력할 수 있게)
  function go(auto = false) {
    clearTimeout(timer);
    const n = parseInt(input.value, 10);
    if (!n) return;
    if (last.n === n && Date.now() - last.at < 1500) return; // 같은 검색을 연달아 하지 않음
    last = { n, at: Date.now() };
    const { sheet, exact } = find(n);
    if (!sheet) return;
    if (!auto) input.blur();
    const el = document.querySelector(`[data-sheet="${sheet.id}"]`);
    if (layout().desk) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    } else {
      // 상단 바에 가리지 않도록 그만큼 덜 내려감
      const bar = document.querySelector('.appbar').getBoundingClientRect().height;
      window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - bar - 4, behavior: 'smooth' });
    }
    const label = el.querySelector('.label');
    label.animate([{ backgroundColor: 'rgba(227, 192, 126, 0.55)' }, { backgroundColor: 'rgba(227, 192, 126, 0)' }],
      { duration: 1200, delay: 300, easing: 'ease-out' });
    if (!exact) toast(`${n}화가 들어 있는 시트가 없어 ${sheetLabel(sheet)}로 이동했습니다`);
  }

  // iPhone 숫자 키패드에는 이동 키가 없어서, 입력을 멈추면 0.7초 뒤 자동으로 이동
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => go(true), 700);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  input.setAttribute('enterkeyhint', 'go');
}
