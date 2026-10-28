// 콤보: 다른 색을 연달아 터뜨리면 쌓이고, 같은 색을 터뜨리거나 1초 이상 쉬면 끊김
import { GOLD } from './fx.js';

const REST_MS = 1000;

export function createCombo(fx) {
  const el = document.getElementById('combo');
  const num = el.querySelector('.combo-num');
  const blocksEl = el.querySelector('.combo-blocks');
  let alive = false;   // 직전 터뜨리기 이후 1초가 아직 안 지남
  let lastSlot = null;
  let count = 0;
  let blocks = 0;      // 이번 콤보 동안 터뜨린 블록 수 (시작 터뜨리기 포함)
  let restTimer = null;
  let hiding = false;  // 사라지는 중에 새 콤보가 오면 처음부터 다시 등장

  function rest() {
    clearTimeout(restTimer);
    restTimer = setTimeout(breakCombo, REST_MS);
  }

  function breakCombo() {
    clearTimeout(restTimer);
    alive = false;
    lastSlot = null;
    if (count > 0) hide();
    count = 0;
    blocks = 0;
  }

  function show(prev) {
    const first = el.hidden || hiding;
    if (first) {
      el.getAnimations().forEach((a) => a.cancel());
      hiding = false;
    }
    el.hidden = false;
    // 콤보가 높을수록 글자가 조금씩 커짐
    el.style.setProperty('--grow', 1 + Math.min(count, 10) * 0.05);
    blocksEl.textContent = `${blocks} Block`;

    if (first) {
      num.textContent = num.dataset.text = count;
      el.animate([
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.18)', opacity: 1, offset: 0.55 },
        { transform: 'translate(-50%, -50%) scale(0.95)', offset: 0.8 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      ], { duration: 380, easing: 'ease-out', fill: 'forwards' });
    } else {
      // 이전 숫자는 위로 튀어 날아가고, 새 숫자가 크게 떨어지듯 들어와 출렁임
      const old = num.cloneNode(true);
      old.classList.add('combo-old');
      num.parentElement.appendChild(old);
      old.animate([
        { transform: 'translate(-50%, 0) scale(1)', opacity: 1 },
        { transform: 'translate(-50%, -38px) scale(0.7) rotate(-12deg)', opacity: 0 },
      ], { duration: 300, easing: 'ease-out' }).finished.then(() => old.remove());
      num.textContent = num.dataset.text = count;
      num.animate([
        { transform: 'translateY(24px) scale(1.9) rotate(8deg)', opacity: 0 },
        { transform: 'translateY(-4px) scale(0.82) rotate(-3deg)', opacity: 1, offset: 0.45 },
        { transform: 'translateY(0) scale(1.08) rotate(1deg)', offset: 0.7 },
        { transform: 'none' },
      ], { duration: 420, easing: 'ease-out' });
      // 글자 전체가 툭 치이는 느낌
      el.animate([
        { transform: 'translate(-50%, -50%) scale(1)' },
        { transform: 'translate(-50%, -50%) scale(1.12, 0.9)', offset: 0.3 },
        { transform: 'translate(-50%, -50%) scale(0.96, 1.04)', offset: 0.6 },
        { transform: 'translate(-50%, -50%) scale(1)' },
      ], { duration: 360, easing: 'ease-out', composite: 'replace' });
      blocksEl.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(0.95)', offset: 0.6 }, { transform: 'scale(1)' }],
        { duration: 300, delay: 60, easing: 'ease-out' });
    }

    const r = num.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    fx.ring(cx, cy, GOLD, 60 + Math.min(count, 10) * 6, 3, 26, 0.7);
    fx.sparkle(cx, cy, 8 + Math.min(count, 10), { spread: 1.3, glow: 8 });

    // 10콤보 단위를 넘을 때마다 (여러 칸씩 올라도 놓치지 않게): 콤보 글자 중심에서 큰 금색 원과 반짝이가 퍼짐
    if (Math.floor(count / 10) > Math.floor(prev / 10)) {
      const far = Math.max(window.innerWidth, window.innerHeight);
      fx.ring(cx, cy, GOLD, far * 0.5, 5, 55, 0.75);
      fx.ring(cx, cy, GOLD, far * 0.3, 3, 48, 0.55, 10);
      fx.sparkle(cx, cy, 44, { spread: 2.8, glow: 9, life: [60, 100] });
      el.animate([
        { transform: 'translate(-50%, -50%) scale(1)' },
        { transform: 'translate(-50%, -50%) scale(1.3)', offset: 0.35 },
        { transform: 'translate(-50%, -50%) scale(0.94)', offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(1)' },
      ], { duration: 520, delay: 120, easing: 'ease-out' });
    }
  }

  function hide() {
    el.getAnimations().forEach((a) => a.cancel());
    hiding = true;
    el.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: 'translate(-50%, -70%) scale(0.85)', opacity: 0 },
    ], { duration: 320, easing: 'ease-in', fill: 'forwards' }).finished.then(() => {
      if (!hiding) return;
      hiding = false;
      el.hidden = true;
    }).catch(() => {});
  }

  return {
    // 긋기를 시작하면 쉬는 시간 측정을 멈춤
    swipeStart() {
      clearTimeout(restTimer);
    },
    // 터뜨리지 못하고 끝난 긋기: 그때부터 다시 1초를 셈
    swipeEnd() {
      if (alive) rest();
    },
    // linked: 이번에 터뜨린 블록 수 (콤보 숫자는 터뜨릴 때마다 1씩, 블록 수는 따로 누적)
    pop(slot, linked) {
      if (alive && slot !== lastSlot) {
        const prev = count;
        count++;
        blocks += linked;
        show(prev);
      } else {
        if (count > 0) breakCombo(); // 같은 색: 콤보 끊김, 이번 터뜨리기부터 새로 시작
        blocks = linked;
      }
      alive = true;
      lastSlot = slot;
      rest();
    },
  };
}
