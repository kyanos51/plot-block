'use strict';

// ---------- 공통 ----------
const $ = (id) => document.getElementById(id);
const CELL = 52;
const GAP = 6;
const STEP = CELL + GAP;
const results = {};

// 진동: 표준 API가 있으면 사용, 없으면 iOS 스위치 체크박스 우회 (미검증)
const haptic = {
  standard() {
    if (navigator.vibrate) navigator.vibrate(12);
  },
  // A: 숨긴 스위치, B: 화면 밖에 둔 스위치 (display:none이 막는 경우 대비)
  iosSwitch(variant = 'A') {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    if (variant === 'A') label.style.display = 'none';
    else label.style.cssText = 'position:fixed;left:-100px;top:0;opacity:0;pointer-events:none;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    (variant === 'A' ? document.head : document.body).appendChild(label);
    label.click();
    label.remove();
  },
  tick() {
    if (navigator.vibrate) this.standard();
    else this.iosSwitch();
  },
};

// O/X 판정 버튼
document.querySelectorAll('.card[data-test]').forEach((card) => {
  const box = card.querySelector('.judge');
  ['O', 'X'].forEach((v) => {
    const b = document.createElement('button');
    b.textContent = v === 'O' ? 'O 정상' : 'X 문제 있음';
    b.dataset.v = v;
    b.addEventListener('click', () => {
      box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      results[card.dataset.test] = v;
    });
    box.appendChild(b);
  });
});

// 길게 누를 때 기본 메뉴 차단
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.block, .sheet, .scrollinner')) e.preventDefault();
});

// ---------- 1. 설치·저장 상태 ----------
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
$('standalone').textContent = isStandalone ? '예' : '아니오 (브라우저)';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('plot-block-test', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function countLaunch() {
  try {
    const db = await openDB();
    const store = (mode) => db.transaction('kv', mode).objectStore('kv');
    const prev = await new Promise((res) => {
      const r = store('readonly').get('launches');
      r.onsuccess = () => res(r.result || 0);
      r.onerror = () => res(0);
    });
    const next = prev + 1;
    store('readwrite').put(next, 'launches');
    $('launches').textContent = `${next}회`;
  } catch (err) {
    $('launches').textContent = `저장 실패 (${err && err.name})`;
  }
}
countLaunch();

(async () => {
  if (!navigator.storage || !navigator.storage.persist) {
    $('persist').textContent = '미지원';
    return;
  }
  const already = await navigator.storage.persisted();
  const granted = already || (await navigator.storage.persist());
  $('persist').textContent = granted ? '허용됨' : '거부됨';
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('../sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => ($('sw').textContent = '완료'))
    .catch((err) => ($('sw').textContent = `실패 (${err && err.name})`));
} else {
  $('sw').textContent = '미지원';
}

// ---------- 2. 진동 ----------
$('vibrate-support').textContent = navigator.vibrate ? '지원' : '미지원';
$('btn-vibrate').addEventListener('click', () => haptic.standard());
$('btn-switch').addEventListener('click', () => haptic.iosSwitch('A'));
$('btn-switch-b').addEventListener('click', () => haptic.iosSwitch('B'));

// ---------- 3. 블록 끌기·스냅 ----------
(() => {
  const sheet = $('drag-sheet');
  const COLS = 5;
  const ROWS = 3;
  const ghost = document.createElement('div');
  ghost.className = 'ghost';
  sheet.appendChild(ghost);

  const blocks = [
    { c: '#FFD6A5', col: 1, row: 1 },
    { c: '#B2DFDB', col: 3, row: 1 },
  ];

  const place = (el, x, y) => (el.style.transform = `translate(${x}px, ${y}px)`);
  const occupied = (col, row, self) => blocks.some((b) => b !== self && b.col === col && b.row === row);

  // 프레임 측정
  let frames = 0;
  let worst = 0;
  let last = 0;
  let measuring = false;
  const loop = (t) => {
    if (!measuring) return;
    if (last) worst = Math.max(worst, t - last);
    last = t;
    frames++;
    requestAnimationFrame(loop);
  };

  blocks.forEach((b) => {
    const el = document.createElement('div');
    el.className = 'block settle';
    el.style.setProperty('--c', b.c);
    place(el, b.col * STEP, b.row * STEP);
    sheet.appendChild(el);
    b.el = el;

    let start = null;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      const rect = sheet.getBoundingClientRect();
      start = {
        dx: e.clientX - rect.left - b.col * STEP,
        dy: e.clientY - rect.top - b.row * STEP,
        cell: `${b.col},${b.row}`,
        t0: performance.now(),
      };
      el.classList.remove('settle');
      el.classList.add('lifted');
      el.style.transform += ' scale(1.08)';
      haptic.tick();
      frames = 0; worst = 0; last = 0; measuring = true;
      requestAnimationFrame(loop);
    });

    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      const rect = sheet.getBoundingClientRect();
      const x = e.clientX - rect.left - start.dx;
      const y = e.clientY - rect.top - start.dy;
      el.style.transform = `translate(${x}px, ${y}px) scale(1.08)`;

      const col = Math.max(0, Math.min(COLS - 1, Math.round(x / STEP)));
      const row = Math.max(0, Math.min(ROWS - 1, Math.round(y / STEP)));
      ghost.style.transform = `translate(${col * STEP}px, ${row * STEP}px)`;
      ghost.classList.add('show');
      ghost.classList.toggle('bad', occupied(col, row, b));
      const key = `${col},${row}`;
      if (key !== start.cell) {
        start.cell = key;
        haptic.tick(); // 칸을 지날 때 진동 (pointermove 안에서도 나는지 확인)
      }
      start.col = col;
      start.row = row;
    });

    const drop = () => {
      if (!start) return;
      measuring = false;
      const secs = (performance.now() - start.t0) / 1000;
      if (secs > 0.3) {
        $('fps').textContent = `평균 ${Math.round(frames / secs)}fps, 최장 끊김 ${Math.round(worst)}ms`;
      }
      if (start.col !== undefined && !occupied(start.col, start.row, b)) {
        b.col = start.col;
        b.row = start.row;
      }
      ghost.classList.remove('show');
      el.classList.add('settle');
      el.classList.remove('lifted');
      place(el, b.col * STEP, b.row * STEP);
      haptic.tick();
      start = null;
    };
    el.addEventListener('pointerup', drop);
    el.addEventListener('pointercancel', drop);
  });
})();

// ---------- 4. 길게 누르기 ----------
(() => {
  const el = $('lp-block');
  let timer = null;
  let origin = null;
  let count = 0;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    el.classList.remove('pressing');
  };
  el.addEventListener('pointerdown', (e) => {
    origin = { x: e.clientX, y: e.clientY };
    el.classList.add('pressing');
    timer = setTimeout(() => {
      timer = null;
      el.classList.remove('pressing');
      el.classList.remove('fired');
      void el.offsetWidth; // 애니메이션 재시작
      el.classList.add('fired');
      haptic.tick();
      $('lp-count').textContent = ++count;
    }, 500);
  });
  el.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10) cancel();
  });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
})();

// ---------- 5. 긋기 vs 스크롤 ----------
(() => {
  const inner = $('swipe-inner');
  const svg = $('swipe-svg');
  const colors = ['#FFD6A5', '#B2DFDB', '#FFB7C5', '#C5CAE9'];
  for (let i = 0; i < 10; i++) {
    const el = document.createElement('div');
    el.className = 'block';
    el.style.setProperty('--c', colors[i % 4]);
    el.style.left = `${20 + ((i * 97) % 220)}px`;
    el.style.top = `${20 + i * 68}px`;
    inner.appendChild(el);

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      const rect = inner.getBoundingClientRect();
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', colors[i % 4]);
      line.setAttribute('stroke-width', '6');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-linejoin', 'round');
      svg.replaceChildren(line);
      const pts = [];
      const add = (ev) => {
        pts.push(`${ev.clientX - rect.left},${ev.clientY - rect.top}`);
        line.setAttribute('points', pts.join(' '));
      };
      add(e);
      const move = (ev) => add(ev);
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        setTimeout(() => svg.replaceChildren(), 600);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }
})();

// ---------- 결과 복사 ----------
$('btn-copy').addEventListener('click', async () => {
  const names = {
    install: '1.설치·저장',
    haptic: '2.진동',
    drag: '3.끌기·스냅',
    longpress: '4.길게누르기',
    swipe: '5.긋기/스크롤',
  };
  const lines = [
    '[Phase 0 테스트 결과]',
    `기기: ${navigator.userAgent}`,
    `홈화면 앱: ${$('standalone').textContent}`,
    `실행 횟수: ${$('launches').textContent}`,
    `영구 저장소: ${$('persist').textContent}`,
    `오프라인: ${$('sw').textContent}`,
    `프레임: ${$('fps').textContent}`,
    ...Object.entries(names).map(([k, n]) => `${n}: ${results[k] || '-'}`),
  ];
  const memo = $('memo').value.trim();
  if (memo) lines.push(`메모: ${memo}`);
  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    $('copy-msg').textContent = '복사했습니다. 대화창에 붙여 넣어 주세요.';
  } catch {
    $('memo').value = text;
    $('memo').select();
    $('copy-msg').textContent = '자동 복사가 안 돼서 위 칸에 넣었습니다. 직접 복사해 주세요.';
  }
});
