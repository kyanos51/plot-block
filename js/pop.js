// Phase 3: 터뜨리기 (같은 색 블록을 그어서 잇고, 놓으면 터짐)
import { createFx, GOLD, NAVY } from './fx.js';
import { createCombo } from './combo.js';

const MAX_CHAIN = 5;
const LONG_PRESS_MS = 500;
const MOVE_SLOP = 8; // 이만큼 움직이면 길게 누르기 대신 긋기로 판단
const CHARGE_DELAY = 120; // 이 시간이 지나야 길게 누르기 표시 시작 (짧은 터치·긋기에는 안 보이게)

export function initPop(app) {
  const { state, color, toast, findBlock, openMemo } = app;
  const $ = (id) => document.getElementById(id);
  const fx = createFx($('fx'));
  const svg = $('link-svg');

  let g = null;       // 진행 중인 긋기
  const combo = createCombo(fx);
  const popping = new Set(); // 터지는 중인 블록 id: 다시 잇거나 누를 수 없음

  // ---------- 긋기 시작 ----------
  $('timeline').addEventListener('pointerdown', (e) => {
    if (state.editing || g) return;
    const el = e.target.closest('.grid .block');
    if (!el || popping.has(el.dataset.id)) return;

    const { block } = findBlock(el.dataset.id);
    g = {
      start: { x: e.clientX, y: e.clientY },
      startEl: el,
      slot: block.slot,
      swiping: false,
      failed: false,
      chain: [],
      last: { x: e.clientX, y: e.clientY },
      timer: setTimeout(onLongPress, LONG_PRESS_MS),
      chargeTimer: setTimeout(startCharge, CHARGE_DELAY),
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  });

  // ---------- 길게 누르기 ----------
  // 누르는 동안: 블록이 눌려 들어가고 테두리가 전체적으로 천천히 드러남. 다 차면 바로 메모 화면으로
  function startCharge() {
    if (!g || g.swiping) return;
    const el = g.startEl;
    const r = el.getBoundingClientRect();
    const pad = 5;
    const ring = document.createElement('div');
    ring.className = 'press-ring';
    ring.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;--ring:${shade(color(g.slot), -0.15)}`;
    document.body.appendChild(ring);
    const dur = LONG_PRESS_MS - CHARGE_DELAY;
    // 가장 진할 때도 불투명도 50%까지만 (파스텔 화면에서 쨍하지 않게)
    ring.animate([{ opacity: 0 }, { opacity: 0.5 }], { duration: dur, easing: 'ease-out', fill: 'forwards' });
    g.ring = ring;
    g.press = el.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.92)' }], { duration: dur, easing: 'ease-out', fill: 'forwards' });
  }

  function stopCharge(springBack) {
    if (!g) return;
    clearTimeout(g.chargeTimer);
    if (g.ring) g.ring.remove();
    if (g.press) {
      g.press.cancel();
      if (springBack) g.startEl.animate([{ transform: 'scale(0.93)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
    }
    g.ring = g.press = null;
  }

  function onLongPress() {
    if (!g || g.swiping) return;
    const id = g.startEl.dataset.id;
    end(); // 블록이 눌린 상태에서 원래 크기로 돌아옴
    openMemo(id);
  }

  function beginSwipe() {
    clearTimeout(g.timer);
    stopCharge(false);
    g.swiping = true;
    // 긋는 동안은 시트를 움직이지 않으므로 블록 위치를 한 번만 계산
    combo.swipeStart();
    g.blocks = [...document.querySelectorAll('.grid .block')].filter((el) => !popping.has(el.dataset.id)).map((el) => {
      const r = el.getBoundingClientRect();
      const { block } = findBlock(el.dataset.id);
      return { el, block, r, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
    document.addEventListener('touchmove', blockScroll, { passive: false });
    const first = g.blocks.find((b) => b.el === g.startEl);
    link(first);
    drawLine();
  }

  // ---------- 긋는 중 ----------
  function onMove(e) {
    if (!g) return;
    const p = { x: e.clientX, y: e.clientY };
    if (!g.swiping) {
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) < MOVE_SLOP) return;
      if (state.popOff) return end(); // 터뜨리기 꺼짐: 스크롤에 양보
      beginSwipe();
    }
    if (g.failed) return;

    // 빠르게 그어도 중간 블록을 건너뛰지 않도록 6px 간격으로 검사
    const dist = Math.hypot(p.x - g.last.x, p.y - g.last.y);
    const steps = Math.max(1, Math.ceil(dist / 6));
    for (let i = 1; i <= steps; i++) {
      const x = g.last.x + ((p.x - g.last.x) * i) / steps;
      const y = g.last.y + ((p.y - g.last.y) * i) / steps;
      const hit = g.blocks.find((b) => x > b.r.left + 3 && x < b.r.right - 3 && y > b.r.top + 3 && y < b.r.bottom - 3);
      if (!hit) continue;
      if (hit.block.slot !== g.slot) {
        g.last = { x, y };
        return resist(hit);
      }
      if (!g.chain.includes(hit) && g.chain.length < MAX_CHAIN) link(hit);
    }
    g.last = p;
    drawLine();
  }

  function link(b) {
    g.chain.push(b);
    b.el.classList.add('linked');
    b.el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1.08)' }],
      { duration: 200, easing: 'cubic-bezier(.3, 1.6, .5, 1)', fill: 'forwards' });
    const n = g.chain.length;
    $('chain-count').textContent = n >= MAX_CHAIN ? `${n} MAX` : `${n}`;
  }

  function drawLine(stroke) {
    const pts = g.chain.map((b) => `${b.cx},${b.cy}`);
    if (!g.failed) pts.push(`${g.last.x},${g.last.y}`);
    svg.innerHTML = `
      <polyline points="${pts.join(' ')}" fill="none" stroke="${stroke || shade(color(g.slot), -0.18)}"
        stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="#fff" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>
      ${g.chain.map((b) => `<circle cx="${b.cx}" cy="${b.cy}" r="7" fill="#fff" opacity="0.9"/>`).join('')}`;
    const c = $('chain-count');
    c.style.transform = `translate(${g.last.x + 18}px, ${g.last.y - 38}px)`;
    c.classList.add('show');
  }

  // 다른 색 블록에 닿음: 저항하며 무효
  function resist(hit) {
    g.failed = true;
    drawLine('#D9827E');
    hit.el.animate(
      [{ transform: 'translate(0,0)' }, { transform: 'translate(-6px,0) rotate(-4deg)' }, { transform: 'translate(6px,0) rotate(4deg)' },
        { transform: 'translate(-4px,0)' }, { transform: 'translate(2px,0)' }, { transform: 'none' }],
      { duration: 340, easing: 'ease-out' }
    );
    hit.el.animate([{ boxShadow: 'inset 0 0 0 3px #D9827E' }, { boxShadow: 'inset 0 0 0 0 #D9827E' }], { duration: 500 });
    for (const b of g.chain) unlink(b, true);
    $('chain-count').textContent = '✕';
    fadeLine(380, 120);
  }

  function unlink(b, shake) {
    b.el.classList.remove('linked');
    b.el.getAnimations().forEach((a) => a.cancel());
    if (shake) {
      b.el.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(0.92)' }, { transform: 'scale(1)' }],
        { duration: 260, easing: 'ease-out' });
    }
  }

  // ---------- 손을 뗌 ----------
  function onUp() {
    if (!g) return;
    const { swiping, failed, chain } = g;
    if (swiping && !failed && chain.length >= 2) {
      const c = chain.slice();
      end(true);
      pop(c);
      return;
    }
    if (swiping && !failed) for (const b of chain) unlink(b, true);
    if (swiping) combo.swipeEnd();
    end();
  }

  function onCancel() {
    if (g && g.swiping) {
      for (const b of g.chain) unlink(b, false);
      combo.swipeEnd();
    }
    end();
  }

  function end(keepLine = false) {
    if (!g) return;
    clearTimeout(g.timer);
    stopCharge(!g.swiping);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('touchmove', blockScroll);
    if (!g.failed && !keepLine) svg.innerHTML = '';
    $('chain-count').classList.remove('show');
    g = null;
  }

  function blockScroll(e) {
    e.preventDefault();
  }

  // ---------- 터짐 ----------
  // 등급: 기본 / A(완성 블록 1개 이상) / B(전부 완성)
  // 지금 그려진 선을 따로 떼어 서서히 지움 (그동안 바로 다음 긋기를 할 수 있게)
  function fadeLine(duration, delay = 0) {
    const ghost = svg.cloneNode(true);
    ghost.removeAttribute('id');
    document.body.appendChild(ghost);
    svg.innerHTML = '';
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration, delay, fill: 'forwards' })
      .finished.then(() => ghost.remove());
  }

  function pop(chain) {
    const n = chain.length;
    chain.forEach((b) => popping.add(b.block.id));
    combo.pop(chain[0].block.slot);
    const done = chain.filter((b) => b.block.stage === 2).length;
    const tier = done === n ? 'B' : done > 0 ? 'A' : 'base';
    const blockColor = color(chain[0].block.slot);
    const GAP_MS = 85;

    fadeLine(160 + n * GAP_MS);

    chain.forEach((b, i) => {
      setTimeout(() => {
        b.el.getAnimations().forEach((a) => a.cancel());
        b.el.classList.remove('linked');
        b.el.animate([
          { transform: 'scale(1.08)', opacity: 1 },
          { transform: 'scale(0.82)', opacity: 1, offset: 0.35 },
          { transform: 'scale(1.35)', opacity: 0 },
        ], { duration: 190, easing: 'ease-in', fill: 'forwards' });
        setTimeout(() => {
          // 전부 완성: 블록 색 대신 금색 별 조각과 남색 반짝이로만 흩어짐
          if (tier === 'B') fx.burst(b.cx, b.cy, GOLD, n, { sparkColor: NAVY });
          else fx.burst(b.cx, b.cy, blockColor, n);
          if (tier !== 'base') fx.sparkle(b.cx, b.cy, tier === 'B' ? 8 : 5, { glow: 8 });
          if (b.block.stage === 2) fx.ring(b.cx, b.cy, GOLD, 44, 3.5, 26);
          // 마지막 블록에서 금색 원과 반짝이가 퍼짐 (연결 개수·단계 공통)
          if (i === n - 1) {
            fx.ring(b.cx, b.cy, GOLD, 80 + n * 14, 4.5, 40, 0.75);
            fx.sparkle(b.cx, b.cy, 12 + n * 3, { spread: 1.4, glow: 8 });
          }
        }, 120);
      }, i * GAP_MS);
    });

    const allPopped = (n - 1) * GAP_MS + 200;
    setTimeout(() => {
      shake(tier === 'B' ? 6 : 2 + n * 1.2, tier === 'B' ? 480 : 320);
      const cx = chain.reduce((s, b) => s + b.cx, 0) / n;
      const cy = chain.reduce((s, b) => s + b.cy, 0) / n;
      if (tier === 'A') {
        fx.ring(cx, cy, GOLD, 130 + n * 18, 5, 42);
        fx.sparkle(cx, cy, 16 + n * 4, { spread: 1.5, glow: 8 });
      }
      if (tier === 'B') {
        // 밤하늘 (금색·남색만 사용): 블록들을 잇는 별자리, 두 겹의 금색 원,
        // 금색·남색 반짝이, 화면 곳곳의 별, 별똥별
        const far = Math.max(window.innerWidth, window.innerHeight);
        fx.constellation(chain.map((b) => ({ x: b.cx, y: b.cy })));
        fx.ring(cx, cy, GOLD, far * 0.55, 5, 60, 0.6);
        fx.ring(cx, cy, GOLD, far * 0.35, 3, 55, 0.45, 14);
        fx.sparkle(cx, cy, 40, { spread: 2.4, glow: 9, life: [60, 100] });
        fx.sparkle(cx, cy, 50, { color: NAVY, spread: 2.8, glow: 0, size: [3, 6.5], life: [80, 130], drag: 0.975, alpha: 0.85, delay: 20 });
        fx.shower(44, [GOLD, NAVY]);
        [10, 32, 58].forEach((d) => fx.streak(d));
      }
    }, allPopped);

    // 원래 자리로 복귀
    const back = allPopped + (tier === 'B' ? 1700 : tier === 'A' ? 750 : 520);
    chain.forEach((b, i) => {
      setTimeout(() => {
        b.el.getAnimations().forEach((a) => a.cancel());
        b.el.animate([
          { transform: 'scale(0)', opacity: 0 },
          { transform: 'scale(1.15)', opacity: 1, offset: 0.6 },
          { transform: 'scale(0.96)', offset: 0.8 },
          { transform: 'scale(1)', opacity: 1 },
        ], { duration: 360, easing: 'ease-out' });
        popping.delete(b.block.id);
      }, back + i * 60);
    });
  }

  function shake(amp, duration) {
    const frames = [];
    for (let i = 0; i <= 8; i++) {
      const k = (1 - i / 8) * amp;
      frames.push({ transform: i === 8 ? 'none' : `translate(${(Math.random() * 2 - 1) * k}px, ${(Math.random() * 2 - 1) * k}px)` });
    }
    $('timeline').animate(frames, { duration, easing: 'linear' });
  }

  // ---------- 터뜨리기 끄기 ----------
  $('btn-pop').addEventListener('click', () => {
    state.popOff = !state.popOff;
    document.body.classList.toggle('pop-off', state.popOff);
    $('btn-pop').classList.toggle('off', state.popOff);
    toast(state.popOff ? '터뜨리기 꺼짐: 블록 위에서도 스크롤됩니다' : '터뜨리기 켜짐');
  });
}

// 색을 밝게(+) 또는 어둡게(-)
function shade(hex, amt, alpha = 1) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = f(n >> 16), gg = f((n >> 8) & 255), b = f(n & 255);
  return `rgba(${r}, ${gg}, ${b}, ${alpha})`;
}
