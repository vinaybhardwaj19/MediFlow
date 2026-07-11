/**
 * charts.js — Animated Canvas Charts for Dashboard Analytics
 * Pure Canvas-based, zero dependencies. Animated donut, line, bar charts.
 */

// ── Animated Donut Chart ─────────────────────────────────────────────────────
export class DonutChart {
  constructor(canvasId, data, opts = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.data = data; // [{label, value, color}]
    this.opts = { radius: opts.radius || 80, lineWidth: opts.lineWidth || 22, animDuration: opts.animDuration || 1200, centerText: opts.centerText || '' };
    this.progress = 0;
    this.startTime = null;
  }

  draw() {
    const { canvas, ctx, data, opts } = this;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    const cx = w / 2, cy = h / 2;
    const total = data.reduce((s, d) => s + d.value, 0);

    ctx.clearRect(0, 0, w, h);

    // Background ring
    ctx.beginPath();
    ctx.arc(cx, cy, opts.radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = opts.lineWidth;
    ctx.stroke();

    // Data arcs
    let startAngle = -Math.PI / 2;
    data.forEach(d => {
      const sweep = (d.value / total) * Math.PI * 2 * this.progress;
      ctx.beginPath();
      ctx.arc(cx, cy, opts.radius, startAngle, startAngle + sweep);
      ctx.strokeStyle = d.color;
      ctx.lineWidth = opts.lineWidth;
      ctx.lineCap = 'round';
      ctx.shadowColor = d.color;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      startAngle += (d.value / total) * Math.PI * 2 * this.progress;
    });

    // Center text
    if (opts.centerText) {
      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'bold 22px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.centerText, cx, cy - 8);
      ctx.font = '12px Inter, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Total Cases', cx, cy + 14);
    }

    // Legend
    let ly = h - data.length * 18;
    ctx.font = '11px Inter, sans-serif';
    data.forEach(d => {
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(cx - 55, ly + 5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText(`${d.label} (${d.value})`, cx - 45, ly + 9);
      ly += 18;
    });
  }

  animate() {
    this.startTime = performance.now();
    const loop = (now) => {
      const elapsed = now - this.startTime;
      this.progress = Math.min(1, elapsed / this.opts.animDuration);
      // Ease out cubic
      this.progress = 1 - Math.pow(1 - this.progress, 3);
      this.draw();
      if (this.progress < 1) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// ── Animated Bar Chart ───────────────────────────────────────────────────────
export class BarChart {
  constructor(canvasId, data, opts = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.data = data; // [{label, value, color}]
    this.opts = { barWidth: opts.barWidth || 32, gap: opts.gap || 16, animDuration: opts.animDuration || 1000 };
    this.progress = 0;
  }

  draw() {
    const { canvas, ctx, data, opts } = this;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    const maxVal = Math.max(...data.map(d => d.value));
    const chartH = h - 40;
    const totalWidth = data.length * (opts.barWidth + opts.gap);
    const startX = (w - totalWidth) / 2;

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = 10 + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(w - 20, y); ctx.stroke();
    }

    data.forEach((d, i) => {
      const x = startX + i * (opts.barWidth + opts.gap);
      const barH = (d.value / maxVal) * (chartH - 20) * this.progress;
      const y = chartH - barH + 10;

      // Bar with gradient
      const grad = ctx.createLinearGradient(x, y, x, chartH + 10);
      grad.addColorStop(0, d.color);
      grad.addColorStop(1, d.color + '40');
      ctx.fillStyle = grad;
      ctx.shadowColor = d.color;
      ctx.shadowBlur = 6;

      // Rounded top
      const r = 4;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + opts.barWidth - r, y);
      ctx.quadraticCurveTo(x + opts.barWidth, y, x + opts.barWidth, y + r);
      ctx.lineTo(x + opts.barWidth, chartH + 10);
      ctx.lineTo(x, chartH + 10);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Value on top
      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'bold 11px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(d.value * this.progress), x + opts.barWidth / 2, y - 6);

      // Label below
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(d.label, x + opts.barWidth / 2, chartH + 26);
    });
  }

  animate() {
    const start = performance.now();
    const loop = (now) => {
      const elapsed = now - start;
      this.progress = Math.min(1, elapsed / this.opts.animDuration);
      this.progress = 1 - Math.pow(1 - this.progress, 3);
      this.draw();
      if (this.progress < 1) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// ── Animated Line Chart ──────────────────────────────────────────────────────
export class LineChart {
  constructor(canvasId, datasets, opts = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.datasets = datasets; // [{label, data:[], color}]
    this.opts = { labels: opts.labels || [], animDuration: opts.animDuration || 1500 };
    this.progress = 0;
  }

  draw() {
    const { canvas, ctx, datasets, opts } = this;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    const pad = { t: 15, r: 20, b: 30, l: 35 };
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;

    ctx.clearRect(0, 0, w, h);

    // Find range
    let allVals = datasets.flatMap(d => d.data);
    const minV = Math.min(...allVals) * 0.9;
    const maxV = Math.max(...allVals) * 1.1;
    const numPts = Math.max(...datasets.map(d => d.data.length));

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.font = '9px Inter, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      const val = maxV - ((maxV - minV) / 4) * i;
      ctx.fillText(Math.round(val), pad.l - 5, y + 3);
    }

    // X labels
    ctx.textAlign = 'center';
    opts.labels.forEach((l, i) => {
      const x = pad.l + (cw / (opts.labels.length - 1)) * i;
      ctx.fillText(l, x, h - 8);
    });

    // Lines
    const pointsToDraw = Math.ceil(numPts * this.progress);
    datasets.forEach(ds => {
      ctx.beginPath();
      ctx.strokeStyle = ds.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = ds.color;
      ctx.shadowBlur = 4;
      ctx.lineJoin = 'round';

      for (let i = 0; i < pointsToDraw && i < ds.data.length; i++) {
        const x = pad.l + (cw / (ds.data.length - 1)) * i;
        const y = pad.t + ch - ((ds.data[i] - minV) / (maxV - minV)) * ch;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Fill area
      if (pointsToDraw > 0) {
        const lastI = Math.min(pointsToDraw - 1, ds.data.length - 1);
        const lastX = pad.l + (cw / (ds.data.length - 1)) * lastI;
        ctx.lineTo(lastX, pad.t + ch);
        ctx.lineTo(pad.l, pad.t + ch);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
        grad.addColorStop(0, ds.color + '25');
        grad.addColorStop(1, ds.color + '02');
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Dots
      for (let i = 0; i < pointsToDraw && i < ds.data.length; i++) {
        const x = pad.l + (cw / (ds.data.length - 1)) * i;
        const y = pad.t + ch - ((ds.data[i] - minV) / (maxV - minV)) * ch;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = ds.color;
        ctx.fill();
      }
    });
  }

  animate() {
    const start = performance.now();
    const loop = (now) => {
      const elapsed = now - start;
      this.progress = Math.min(1, elapsed / this.opts.animDuration);
      this.progress = 1 - Math.pow(1 - this.progress, 3);
      this.draw();
      if (this.progress < 1) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// ── Stat Counter Animation ───────────────────────────────────────────────────
export function animateCounter(elementId, target, duration = 2000, prefix = '', suffix = '') {
  const el = document.getElementById(elementId);
  if (!el) return;
  const start = performance.now();
  const loop = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const current = Math.round(target * eased);
    el.textContent = prefix + current.toLocaleString() + suffix;
    if (p < 1) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ── Initialize Dashboard Charts (call from app.js) ───────────────────────────
export function initDashboardCharts() {
  // Specialty distribution donut
  const donut = new DonutChart('chart-specialty-donut', [
    { label: 'Cardiology', value: 234, color: '#f43f5e' },
    { label: 'Neurology', value: 186, color: '#6366f1' },
    { label: 'Pulmonology', value: 142, color: '#0ea5e9' },
    { label: 'General', value: 312, color: '#10b981' },
    { label: 'Orthopedics', value: 97, color: '#f59e0b' },
    { label: 'Other', value: 165, color: '#8b5cf6' },
  ], { centerText: '1,136', radius: 70 });

  // Weekly appointments bar
  const bar = new BarChart('chart-weekly-bar', [
    { label: 'Mon', value: 45, color: '#6366f1' },
    { label: 'Tue', value: 62, color: '#0ea5e9' },
    { label: 'Wed', value: 38, color: '#8b5cf6' },
    { label: 'Thu', value: 71, color: '#f43f5e' },
    { label: 'Fri', value: 55, color: '#10b981' },
    { label: 'Sat', value: 28, color: '#f59e0b' },
    { label: 'Sun', value: 15, color: '#94a3b8' },
  ]);

  // Vitals trend line
  const line = new LineChart('chart-vitals-line', [
    { label: 'Heart Rate', data: [72,75,71,78,82,76,73,70,74,77,72,75], color: '#f43f5e' },
    { label: 'SpO₂', data: [98,97,98,96,97,98,99,97,98,97,98,97], color: '#0ea5e9' },
  ], { labels: ['6AM','7','8','9','10','11','12PM','1','2','3','4','5PM'] });

  // Animate hero stats
  animateCounter('hero-stat-patients', 12847, 2500);
  animateCounter('hero-stat-doctors', 156, 2000);
  animateCounter('hero-stat-triage', 98, 1800, '', '%');
  animateCounter('hero-stat-response', 187, 2000, '<', 'ms');

  // Use IntersectionObserver to trigger chart animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.id;
        if (id === 'chart-specialty-donut') donut?.animate();
        else if (id === 'chart-weekly-bar') bar?.animate();
        else if (id === 'chart-vitals-line') line?.animate();
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.3 });

  ['chart-specialty-donut', 'chart-weekly-bar', 'chart-vitals-line'].forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}
