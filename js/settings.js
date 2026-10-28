// 설정·백업: 백업 파일 내려받기/불러오기, 백업 알림, 블록 외곽선, 바깥 메모 글자 크기
const NAG_DAYS = 7;   // 마지막 백업 후 이만큼 지나면 알림
const DAY = 24 * 60 * 60 * 1000;

export function initSettings(app) {
  const { state, render, renderTray, changed, flush, snapshot, toast, prepareDoc, resetAll, VERSION } = app;
  const $ = (id) => document.getElementById(id);
  const panel = $('settings');

  // ---------- 설정 창 ----------
  function open() {
    sync();
    panel.hidden = false;
  }
  function close() {
    panel.hidden = true;
  }
  function sync() {
    const st = state.doc.settings;
    $('set-edge').checked = !!st.edge;
    panel.querySelectorAll('[data-fs]').forEach((b) => b.classList.toggle('on', Number(b.dataset.fs) === st.noteFs));
    const at = state.doc.meta.lastBackupAt;
    $('set-last').textContent = at ? `마지막 백업: ${fmt(new Date(at))}` : '아직 백업한 적이 없습니다';
    $('set-version').textContent = `프로토타입 ${VERSION}`;
  }

  $('btn-more').addEventListener('click', () => (panel.hidden ? open() : close()));
  $('set-done').addEventListener('click', close);

  $('set-edge').addEventListener('change', (e) => {
    state.doc.settings.edge = e.target.checked;
    render();
    changed();
  });
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fs]');
    if (!b) return;
    state.doc.settings.noteFs = Number(b.dataset.fs);
    render();
    changed();
    sync();
  });
  $('set-reset').addEventListener('click', async () => {
    if (await resetAll()) sync();
  });

  // ---------- 백업 내려받기 ----------
  const pad = (n) => String(n).padStart(2, '0');
  function fmt(d) {
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function backup() {
    const now = new Date();
    const name = `plot-block-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
    const data = JSON.stringify({ app: 'plot-block', format: 1, exportedAt: now.toISOString(), doc: state.doc }, null, 2);
    const file = new File([data], name, { type: 'application/json' });

    try {
      // iPhone: 공유 창에서 '파일에 저장'을 고를 수 있음
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: '플롯 블록 백업' });
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return toast('백업을 취소했습니다');
      return toast('백업 파일을 만들지 못했습니다');
    }
    state.doc.meta.lastBackupAt = now.getTime();
    delete state.doc.meta.nagSnoozeUntil;
    flush();
    sync();
    hideNag();
    toast('백업 파일을 만들었습니다');
  }
  $('set-backup').addEventListener('click', backup);

  // ---------- 백업 불러오기 ----------
  $('set-restore').addEventListener('click', () => $('set-file').click());
  $('set-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let doc;
    try {
      const parsed = JSON.parse(await f.text());
      doc = parsed && parsed.app === 'plot-block' ? parsed.doc : null;
      const ok = doc && Array.isArray(doc.sheets) && Array.isArray(doc.slots) && doc.slots.length === 4 &&
        doc.sheets.every((s) => typeof s.from === 'number' && Array.isArray(s.blocks));
      if (!ok) throw new Error('bad');
    } catch {
      return toast('플롯 블록 백업 파일이 아닙니다');
    }
    const n = doc.sheets.reduce((sum, s) => sum + s.blocks.length, 0);
    if (!confirm(`지금 내용을 이 백업 파일 내용(시트 ${doc.sheets.length}개, 블록 ${n}개)으로 바꿉니다. 바로 되돌리기로 이전 상태를 복구할 수 있습니다. 계속할까요?`)) return;
    snapshot();
    // 백업 시각 기록은 지금 기기의 것을 유지
    const meta = state.doc.meta;
    state.doc = prepareDoc(doc);
    state.doc.meta = meta;
    renderTray();
    render();
    flush();
    sync();
    toast('백업 파일에서 복구했습니다');
  });

  // ---------- 백업 알림 ----------
  const nag = $('backup-nag');
  function hideNag() {
    nag.hidden = true;
  }
  function checkNag() {
    const { meta, sheets } = state.doc;
    const hasContent = sheets.some((s) => s.blocks.length);
    const now = Date.now();
    if (!hasContent || (meta.nagSnoozeUntil && now < meta.nagSnoozeUntil)) return;
    const since = meta.lastBackupAt ? now - meta.lastBackupAt : Infinity;
    if (since < NAG_DAYS * DAY) return;
    $('nag-text').textContent = meta.lastBackupAt
      ? `마지막 백업 후 ${Math.floor(since / DAY)}일이 지났습니다`
      : '아직 백업 파일이 없습니다';
    nag.hidden = false;
  }
  $('nag-backup').addEventListener('click', backup);
  $('nag-later').addEventListener('click', () => {
    state.doc.meta.nagSnoozeUntil = Date.now() + DAY; // 하루 뒤에 다시 알림
    changed();
    hideNag();
  });
  checkNag();
}
