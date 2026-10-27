// 파티클 연출 (캔버스 한 장을 화면 전체에 깔고, 파티클이 있을 때만 그림)
const GOLD = '#FFD36E';

export function createFx(canvas) {
  const ctx = canvas.getContext('2d');
  let parts = [];
  let running = false;
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function add(p) {
    parts.push({ life: 0, rot: 0, vr: 0, g: 0, drag: 0.98, ...p });
    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  function loop() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    parts = parts.filter((p) => p.life < p.max);
    for (const p of parts) {
      p.life++;
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      draw(p);
    }
    if (parts.length) requestAnimationFrame(loop);
    else {
      running = false;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  function draw(p) {
    const t = p.life / p.max;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.type === 'chip' || p.type === 'confetti') {
      ctx.rotate(p.rot);
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = p.color;
      const s = p.size * (p.type === 'chip' ? 1 - t * 0.4 : 1);
      ctx.beginPath();
      ctx.roundRect(-s / 2, -s / 2 * (p.type === 'confetti' ? 0.5 : 1), s, s * (p.type === 'confetti' ? 0.5 : 1), s * 0.2);
      ctx.fill();
    } else if (p.type === 'spark') {
      const twinkle = 0.6 + 0.4 * Math.sin(p.life * 0.6 + p.seed);
      ctx.globalAlpha = (1 - t) * twinkle;
      ctx.fillStyle = p.color || GOLD;
      ctx.shadowColor = p.color || GOLD;
      ctx.shadowBlur = 8;
      star(p.size * (1 - t * 0.5));
    } else if (p.type === 'ring') {
      const r = p.r0 + (p.r1 - p.r0) * (1 - (1 - t) ** 3);
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function star(s) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? s * 0.38 : s;
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }

  const rand = (a, b) => a + Math.random() * (b - a);

  return {
    // 블록 조각이 사방으로 튐. power는 연결 개수에 따라 커짐
    burst(x, y, color, power) {
      const n = 8 + power * 3;
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(2, 4 + power * 1.2);
        add({
          type: 'chip', x, y, color,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, g: 0.22,
          size: rand(5, 10), vr: rand(-0.3, 0.3), max: Math.round(rand(34, 52)),
        });
      }
      add({ type: 'ring', x, y, color, r0: 10, r1: 34 + power * 6, width: 5, vx: 0, vy: 0, max: 22 });
    },
    sparkle(x, y, count, spread = 1, color = GOLD) {
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(1, 5) * spread;
        add({
          type: 'spark', x, y, color, seed: rand(0, 6),
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, g: 0.05, drag: 0.95,
          size: rand(4, 8), max: Math.round(rand(40, 70)),
        });
      }
    },
    ring(x, y, color, r1, width = 6, max = 34) {
      add({ type: 'ring', x, y, color, r0: 6, r1, width, vx: 0, vy: 0, max });
    },
    confetti(colors, count) {
      for (let i = 0; i < count; i++) {
        add({
          type: 'confetti',
          x: rand(0, window.innerWidth), y: rand(-80, -10),
          color: colors[i % colors.length],
          vx: rand(-1.5, 1.5), vy: rand(2, 5), g: 0.06, drag: 0.995,
          size: rand(8, 13), vr: rand(-0.25, 0.25), max: Math.round(rand(110, 160)),
        });
      }
    },
    GOLD,
  };
}
