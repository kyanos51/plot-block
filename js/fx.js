// 파티클 연출: 별과 밤하늘 컨셉 (캔버스 한 장을 화면 전체에 깔고, 파티클이 있을 때만 그림)
// 파스텔 화면에서 튀지 않도록 채도를 낮춘 금색·남색과 낮은 불투명도를 사용
export const GOLD = '#E3C07E';      // 차분한 금색
export const STARLIGHT = '#FFF4DA'; // 옅은 별빛
export const NAVY = '#3A4670';      // 어두운 남색

export function createFx(canvas) {
  const ctx = canvas.getContext('2d');
  let parts = [];
  let running = false;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function add(p) {
    parts.push({ life: 0, rot: 0, vr: 0, g: 0, drag: 0.98, alpha: 1, delay: 0, ...p });
    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  function loop() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    parts = parts.filter((p) => p.life < p.max + p.delay);
    for (const p of parts) {
      p.life++;
      if (p.life <= p.delay) continue;
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      draw(p, (p.life - p.delay) / p.max);
    }
    if (parts.length) requestAnimationFrame(loop);
    else {
      running = false;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  function draw(p, t) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.type === 'star') {
      // 블록 색 별 조각: 천천히 떠오르듯 퍼졌다가 사라짐
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.alpha * (1 - t * t);
      ctx.fillStyle = p.color;
      star5(p.size * (1 - t * 0.35));
    } else if (p.type === 'spark') {
      // 반짝이: 4갈래 별, 깜빡임
      const twinkle = 0.55 + 0.45 * Math.sin(p.life * 0.45 + p.seed);
      ctx.globalAlpha = p.alpha * Math.sin(Math.PI * Math.min(1, t * 1.2)) * twinkle;
      ctx.fillStyle = p.color;
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.glow;
      }
      star4(p.size * (1 - t * 0.4));
    } else if (p.type === 'line') {
      // 별자리 선: 앞 블록에서 다음 블록으로 그어진 뒤 서서히 사라짐
      const grow = Math.min(1, t / 0.22);
      ctx.globalAlpha = p.alpha * (t < 0.6 ? 1 : (1 - t) / 0.4);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(p.dx * grow, p.dy * grow);
      ctx.stroke();
    } else if (p.type === 'streak') {
      // 별똥별: 머리는 별, 꼬리는 점점 투명해짐
      const len = 9;
      const grad = ctx.createLinearGradient(0, 0, -p.vx * len, -p.vy * len);
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, 'rgba(227, 192, 126, 0)');
      ctx.globalAlpha = p.alpha * Math.sin(Math.PI * t);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-p.vx * len, -p.vy * len);
      ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      star4(5);
    } else if (p.type === 'ring') {
      const r = p.r0 + (p.r1 - p.r0) * (1 - (1 - t) ** 3);
      ctx.globalAlpha = p.alpha * (1 - t);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function star5(s) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.45 : s;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }

  function star4(s) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? s * 0.28 : s;
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }

  const rand = (a, b) => a + Math.random() * (b - a);

  return {
    // 블록이 별 조각으로 흩어짐. power는 연결 개수에 따라 커짐
    // opts.sparkColor: 함께 흩어지는 작은 반짝이 색 (기본은 옅은 별빛)
    burst(x, y, color, power, opts = {}) {
      const { sparkColor = STARLIGHT } = opts;
      const n = 7 + power * 2;
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(1.5, 3 + power * 0.8);
        add({
          type: 'star', x, y, color,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.8, g: 0.06, drag: 0.96,
          size: rand(4, 7.5), vr: rand(-0.12, 0.12), max: Math.round(rand(40, 60)),
        });
      }
      // 옅은 별빛 몇 개
      this.sparkle(x, y, 3 + power, { color: sparkColor, spread: 0.8, glow: sparkColor === STARLIGHT ? 6 : 0 });
      add({ type: 'ring', x, y, color, r0: 10, r1: 30 + power * 5, width: 4, alpha: 0.8, vx: 0, vy: 0, max: 24 });
    },
    sparkle(x, y, count, opts = {}) {
      const { color = GOLD, spread = 1, glow = 6, size = [3.5, 7], life = [40, 70], drag = 0.95, alpha = 1, delay = 0 } = opts;
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(0.6, 3.2) * spread;
        add({
          type: 'spark', x, y, color, glow, alpha, seed: rand(0, 6),
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4, g: 0.01, drag,
          size: rand(size[0], size[1]), max: Math.round(rand(life[0], life[1])),
          delay: Math.round(rand(0, delay)),
        });
      }
    },
    ring(x, y, color, r1, width = 5, max = 34, alpha = 0.85, delay = 0) {
      add({ type: 'ring', x, y, color, r0: 6, r1, width, alpha, vx: 0, vy: 0, max, delay });
    },
    // 별자리: 점들을 순서대로 선으로 잇고, 각 점에 큰 반짝이
    constellation(points, color = GOLD) {
      points.forEach((p, i) => {
        add({ type: 'spark', x: p.x, y: p.y, color, glow: 10, alpha: 1, seed: i, vx: 0, vy: 0, drag: 1,
          size: 10, max: 95, delay: i * 5 });
        const q = points[i + 1];
        if (q) add({ type: 'line', x: p.x, y: p.y, dx: q.x - p.x, dy: q.y - p.y, color, alpha: 0.85, vx: 0, vy: 0, drag: 1, max: 90, delay: i * 5 });
      });
    },
    // 화면 곳곳에서 별이 반짝임
    shower(count, colors) {
      for (let i = 0; i < count; i++) {
        const c = colors[i % colors.length];
        add({ type: 'spark', x: rand(16, window.innerWidth - 16), y: rand(60, window.innerHeight - 40),
          color: c, glow: c === GOLD ? 8 : 0, alpha: c === GOLD ? 1 : 0.8, seed: rand(0, 6),
          vx: 0, vy: rand(-0.3, -0.1), drag: 1, size: rand(3, 7), max: Math.round(rand(50, 80)), delay: Math.round(rand(0, 55)) });
      }
    },
    // 별똥별: 화면 위쪽에서 비스듬히 떨어짐
    streak(delay, color = GOLD) {
      const x = rand(window.innerWidth * 0.1, window.innerWidth * 0.8);
      const y = rand(40, window.innerHeight * 0.35);
      const v = rand(7, 10);
      add({ type: 'streak', x, y, color, alpha: 1, vx: v * 0.8, vy: v * 0.6, drag: 1, max: 34, delay });
    },
  };
}
