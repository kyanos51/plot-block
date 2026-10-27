// 세부 메모 화면: 같은 색 블록의 메모를 시트 배치 순서대로 세로로 나열
const STAGES = ['설계', '검토', '완성'];

export function initMemo(app) {
  const { state, color, findBlock, changed, sheetLabel, esc, toast } = app;
  const $ = (id) => document.getElementById(id);
  const layer = $('memo');
  const list = $('memo-list');
  let slot = null;

  // 시트 순서, 시트 안에서는 위→아래, 왼쪽→오른쪽
  function ordered(s) {
    const out = [];
    for (const sheet of state.doc.sheets) {
      sheet.blocks
        .filter((b) => b.slot === s)
        .sort((a, b) => a.row - b.row || a.col - b.col)
        .forEach((block) => out.push({ sheet, block }));
    }
    return out;
  }

  function card({ sheet, block }) {
    return `
      <article class="memo-card" data-id="${block.id}">
        <div class="memo-card-top">
          <span class="memo-ep">${sheetLabel(sheet)}</span>
          ${block.summary ? `<span class="memo-sum">${esc(block.summary)}</span>` : ''}
        </div>
        <input class="memo-title" placeholder="제목" value="${esc(block.memoTitle || '')}">
        <textarea class="memo-body" placeholder="메모" rows="3">${esc(block.body || '')}</textarea>
        <div class="memo-stage">
          ${STAGES.map((t, i) => `<button data-stage="${i}" class="${(block.stage || 0) === i ? 'on' : ''}">${t}</button>`).join('')}
        </div>
      </article>`;
  }

  function grow(ta) {
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }

  function open(blockId) {
    const found = findBlock(blockId);
    if (!found) return;
    slot = found.block.slot;
    const s = state.doc.slots[slot];

    layer.style.setProperty('--c', color(slot));
    $('memo-meaning').value = s.meaning || '';
    list.innerHTML = ordered(slot).map(card).join('');
    layer.hidden = false;
    document.documentElement.classList.add('memo-open');
    // 길게 누른 손가락을 뗄 때 그 자리의 입력칸이 눌려 키보드가 뜨지 않도록 잠깐 터치를 막음
    layer.style.pointerEvents = 'none';
    const release = () => setTimeout(() => { layer.style.pointerEvents = ''; }, 250);
    window.addEventListener('pointerup', release, { once: true });
    setTimeout(release, 900);
    list.querySelectorAll('.memo-body').forEach(grow);

    // 누른 블록의 메모에 포커스 (키보드는 띄우지 않고 위치만 맞춤)
    const target = list.querySelector(`[data-id="${blockId}"]`);
    list.scrollTop = Math.max(0, target.offsetTop - list.offsetTop - 12);
    layer.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
      { duration: 280, easing: 'cubic-bezier(.2, .9, .3, 1)' });
    target.animate(
      [{ boxShadow: `0 0 0 3px ${color(slot)}` }, { boxShadow: `0 0 0 3px ${color(slot)}`, offset: 0.6 }, { boxShadow: '0 0 0 0 transparent' }],
      { duration: 1400, delay: 200 }
    );
  }

  function close() {
    if (layer.hidden) return;
    document.activeElement && document.activeElement.blur();
    layer.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }],
      { duration: 220, easing: 'ease-in' }).finished.then(() => {
      layer.hidden = true;
      document.documentElement.classList.remove('memo-open');
    });
  }

  list.addEventListener('input', (e) => {
    const el = e.target.closest('[data-id]');
    if (!el) return;
    const { block } = findBlock(el.dataset.id);
    if (e.target.classList.contains('memo-title')) block.memoTitle = e.target.value;
    if (e.target.classList.contains('memo-body')) {
      block.body = e.target.value;
      grow(e.target);
    }
    changed();
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.memo-stage button');
    if (!btn) return;
    const el = btn.closest('[data-id]');
    const { block } = findBlock(el.dataset.id);
    block.stage = Number(btn.dataset.stage);
    el.querySelectorAll('.memo-stage button').forEach((b) => b.classList.toggle('on', b === btn));
    changed();
  });

  // 색 의미: 같은 색의 모든 메모가 공유
  $('memo-meaning').addEventListener('input', (e) => {
    state.doc.slots[slot].meaning = e.target.value;
    changed();
  });

  // 같은 색 메모를 모든 화수에 걸쳐 한 번에 복사
  $('memo-copy').addEventListener('click', async () => {
    const text = ordered(slot).map(({ sheet, block }) => {
      const head = `[${sheetLabel(sheet)}] ${block.memoTitle || ''}`.trim();
      return block.body ? `${head}\n${block.body}` : head;
    }).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      toast('이 색의 메모를 모두 복사했습니다');
    } catch {
      toast('복사하지 못했습니다');
    }
  });

  $('memo-back').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  return { open, close };
}
