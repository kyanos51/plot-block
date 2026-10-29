// 세부 메모 화면: 같은 색 블록의 메모를 시트 배치 순서대로 세로로 나열
// 태그란에 #제목을 넣으면 그 제목의 메모(다른 색 포함)로 바로 가는 태그 버튼이 생김.
// 본문에 #제목을 써도 입력을 마치면 태그란으로 옮겨지고 본문에서는 사라짐
const STAGES = ['설계', '검토', '완성'];

export const normTag = (t) => String(t || '').replace(/\s+/g, '').toLowerCase();

// 글에서 #이름을 빼냄 (# 다음 공백 전까지, 끝의 문장부호는 뺌). 태그만 있던 줄은 지움
export function extractTags(text) {
  const names = [];
  const lines = String(text || '').split('\n').map((line) => {
    if (!line.includes('#')) return line;
    const rest = line.replace(/#([^\s#]+)/g, (m, raw) => {
      const name = raw.replace(/[.,!?;:)\]'"]+$/, '');
      if (name) names.push(name);
      return '';
    }).replace(/\s{2,}/g, ' ').trim();
    return rest || null;
  }).filter((line) => line !== null);
  return { names, rest: lines.join('\n') };
}

export function addTags(block, names) {
  block.tags = block.tags || [];
  for (const n of names) if (!block.tags.some((t) => normTag(t) === normTag(n))) block.tags.push(n);
}

export function initMemo(app) {
  const { state, color, findBlock, changed, sheetLabel, esc, toast, mix } = app;
  const $ = (id) => document.getElementById(id);
  const layer = $('memo');
  const list = $('memo-list');
  let slot = null;
  const trail = []; // 태그로 이동해 온 경로 (뒤로 가기용 블록 id)

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

  // ---------- 태그 ----------
  const norm = normTag;

  // 제목이 같은 메모를 찾고, 없으면 요약 메모가 같은 블록 (띄어쓰기·대소문자 무시, 자기 자신 제외)
  function resolve(name, selfId) {
    const all = state.doc.sheets.flatMap((sheet) => sheet.blocks.map((block) => ({ sheet, block })));
    const key = norm(name);
    return all.find(({ block }) => block.id !== selfId && norm(block.memoTitle) === key)
      || all.find(({ block }) => block.id !== selfId && norm(block.summary) === key);
  }

  // 태그 버튼: 이름을 누르면 이동, ×를 누르면 태그 삭제
  function tagsHTML(block) {
    return (block.tags || []).map((name, i) => {
      const hit = resolve(name, block.id);
      const x = `<button class="memo-tag-x" data-untag="${i}" aria-label="태그 지우기">×</button>`;
      if (!hit) return `<span class="memo-tag none"><span class="memo-tag-go">#${esc(name)}</span>${x}</span>`;
      const c = color(hit.block.slot);
      return `<span class="memo-tag" style="--tint:${mix(c, 0.7)};--edge:${mix(c, -0.15, 0.6)}">
        <button class="memo-tag-go" data-go="${hit.block.id}">#${esc(name)}<small>${sheetLabel(hit.sheet)}</small></button>${x}</span>`;
    }).join('');
  }

  function refreshTags() {
    list.querySelectorAll('.memo-card').forEach((el) => {
      const { block } = findBlock(el.dataset.id);
      el.querySelector('.memo-tag-list').innerHTML = tagsHTML(block);
    });
  }

  // 태그란 입력 확정: #은 있어도 없어도 됨. 쉼표나 #으로 여러 개 (제목의 띄어쓰기는 그대로 둠)
  function commitTagInput(input) {
    const names = input.value.split(/[,#]+/).map((t) => t.trim()).filter(Boolean);
    input.value = '';
    if (!names.length) return;
    const { block } = findBlock(input.closest('[data-id]').dataset.id);
    addTags(block, names);
    refreshTags();
    changed();
  }

  // 본문에 쓴 #태그는 입력을 마치면 태그란으로 옮김
  function moveBodyTags(ta) {
    const { names, rest } = extractTags(ta.value);
    if (!names.length) return;
    const { block } = findBlock(ta.closest('[data-id]').dataset.id);
    block.body = rest;
    ta.value = rest;
    grow(ta);
    addTags(block, names);
    refreshTags();
    changed();
  }
  let tagTimer = null;
  const refreshSoon = () => {
    clearTimeout(tagTimer);
    tagTimer = setTimeout(refreshTags, 250);
  };

  function card({ sheet, block }) {
    return `
      <article class="memo-card" data-id="${block.id}">
        <div class="memo-card-top">
          <span class="memo-ep">${sheetLabel(sheet)}</span>
          ${block.summary ? `<span class="memo-sum">${esc(block.summary)}</span>` : ''}
        </div>
        <input class="memo-title" placeholder="제목" value="${esc(block.memoTitle || '')}">
        <textarea class="memo-body" placeholder="메모" rows="3">${esc(block.body || '')}</textarea>
        <div class="memo-tags">
          <div class="memo-tag-list">${tagsHTML(block)}</div>
          <input class="memo-tag-input" placeholder="#태그 (다른 메모의 제목)" enterkeyhint="done">
        </div>
        <div class="memo-stage">
          ${STAGES.map((t, i) => `<button data-stage="${i}" class="${(block.stage || 0) === i ? 'on' : ''}">${t}</button>`).join('')}
        </div>
      </article>`;
  }

  function grow(ta) {
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }

  // 그 블록의 색 메모 목록을 채우고 그 메모에 맞춰 스크롤
  function fill(blockId) {
    const found = findBlock(blockId);
    if (!found) return null;
    slot = found.block.slot;
    layer.style.setProperty('--c', color(slot));
    $('memo-meaning').value = state.doc.slots[slot].meaning || '';
    list.innerHTML = ordered(slot).map(card).join('');
    list.querySelectorAll('.memo-body').forEach(grow);
    $('memo-back').textContent = trail.length ? '‹ 뒤로' : '‹ 시트';
    return focus(blockId);
  }

  function focus(blockId) {
    const target = list.querySelector(`[data-id="${blockId}"]`);
    list.scrollTop = Math.max(0, target.offsetTop - list.offsetTop - 12);
    target.animate(
      [{ boxShadow: `0 0 0 3px ${color(slot)}` }, { boxShadow: `0 0 0 3px ${color(slot)}`, offset: 0.6 }, { boxShadow: '0 0 0 0 transparent' }],
      { duration: 1400, delay: 200 }
    );
    return target;
  }

  // 태그로 이동: 같은 색이면 그 카드로 스크롤, 다른 색이면 그 색의 목록으로 바꿈
  function go(fromId, toId) {
    document.activeElement && document.activeElement.blur();
    trail.push(fromId);
    const to = findBlock(toId);
    if (to.block.slot === slot) {
      $('memo-back').textContent = '‹ 뒤로';
      focus(toId);
      return;
    }
    fill(toId);
    list.animate([{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  }

  function back() {
    if (!trail.length) return close();
    const id = trail.pop();
    if (!findBlock(id)) return back();
    if (findBlock(id).block.slot === slot) {
      $('memo-back').textContent = trail.length ? '‹ 뒤로' : '‹ 시트';
      focus(id);
      return;
    }
    fill(id);
    list.animate([{ opacity: 0, transform: 'translateX(-24px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  }

  function open(blockId) {
    trail.length = 0;
    if (!fill(blockId)) return;
    layer.hidden = false;
    document.documentElement.classList.add('memo-open');
    // 길게 누른 손가락을 뗄 때 그 자리의 입력칸이 눌려 키보드가 뜨지 않도록 잠깐 터치를 막음
    layer.style.pointerEvents = 'none';
    const release = () => setTimeout(() => { layer.style.pointerEvents = ''; }, 250);
    window.addEventListener('pointerup', release, { once: true });
    setTimeout(release, 900);
    // 키보드는 띄우지 않고 위치만 맞춤 (fill에서 처리)
    layer.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
      { duration: 280, easing: 'cubic-bezier(.2, .9, .3, 1)' });
  }

  function close() {
    if (layer.hidden) return;
    trail.length = 0;
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
    if (e.target.classList.contains('memo-tag-input')) {
      if (/,$/.test(e.target.value)) commitTagInput(e.target);
      return;
    }
    const { block } = findBlock(el.dataset.id);
    if (e.target.classList.contains('memo-title')) block.memoTitle = e.target.value;
    if (e.target.classList.contains('memo-body')) {
      block.body = e.target.value;
      grow(e.target);
    }
    refreshSoon(); // 제목이 바뀌면 다른 카드의 태그 연결도 바뀔 수 있음
    changed();
  });

  list.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('memo-tag-input')) {
      e.preventDefault();
      commitTagInput(e.target);
    }
  });
  list.addEventListener('focusout', (e) => {
    if (e.target.classList.contains('memo-tag-input')) commitTagInput(e.target);
    if (e.target.classList.contains('memo-body')) moveBodyTags(e.target);
  });

  list.addEventListener('click', (e) => {
    const tag = e.target.closest('[data-go]');
    if (tag) return go(tag.closest('[data-id]').dataset.id, tag.dataset.go);
    const x = e.target.closest('[data-untag]');
    if (x) {
      const { block } = findBlock(x.closest('[data-id]').dataset.id);
      block.tags.splice(Number(x.dataset.untag), 1);
      refreshTags();
      changed();
      return;
    }
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
      const tags = (block.tags || []).length ? `\n${block.tags.map((t) => `#${t}`).join(' ')}` : '';
      return (block.body ? `${head}\n${block.body}` : head) + tags;
    }).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      toast('이 색의 메모를 모두 복사했습니다');
    } catch {
      toast('복사하지 못했습니다');
    }
  });

  $('memo-back').addEventListener('click', back);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  return { open, close };
}
