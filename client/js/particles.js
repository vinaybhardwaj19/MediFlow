/**
 * particles.js — Cinematic Medical Particle Network
 * ==================================================
 * Renders an interactive particle system on a <canvas> behind the hero.
 * Particles form a connected neural-network graph with glowing edges.
 * Mouse proximity causes particles to gravitate and glow brighter.
 * Medical-themed: subtle cross shapes, heartbeat pulse waves.
 */

const PARTICLE_CONFIG = {
  count       : 80,
  maxSpeed    : 0.4,
  connectionDist: 150,
  mouseRadius : 200,
  colors      : ['#6366f1', '#0ea5e9', '#a78bfa', '#38bdf8', '#818cf8'],
  crossCount  : 6,   // number of medical cross particles
  pulseSpeed  : 0.02,
};

class Particle {
  constructor(canvas, isCross = false) {
    this.canvas = canvas;
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.vx = (Math.random() - 0.5) * PARTICLE_CONFIG.maxSpeed;
    this.vy = (Math.random() - 0.5) * PARTICLE_CONFIG.maxSpeed;
    this.radius = isCross ? 4 : Math.random() * 2.5 + 1;
    this.color = PARTICLE_CONFIG.colors[Math.floor(Math.random() * PARTICLE_CONFIG.colors.length)];
    this.alpha = Math.random() * 0.5 + 0.3;
    this.isCross = isCross;
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.baseRadius = this.radius;
  }

  update(mouse) {
    // Drift
    this.x += this.vx;
    this.y += this.vy;

    // Pulse
    this.pulsePhase += PARTICLE_CONFIG.pulseSpeed;
    this.radius = this.baseRadius + Math.sin(this.pulsePhase) * 0.5;

    // Mouse attraction
    if (mouse.x !== null && mouse.y !== null) {
      const dx = mouse.x - this.x;
      const dy = mouse.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PARTICLE_CONFIG.mouseRadius) {
        const force = (PARTICLE_CONFIG.mouseRadius - dist) / PARTICLE_CONFIG.mouseRadius * 0.008;
        this.vx += dx * force;
        this.vy += dy * force;
        this.alpha = Math.min(1, this.alpha + 0.02);
      } else {
        this.alpha = Math.max(0.3, this.alpha - 0.005);
      }
    }

    // Speed limit
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > PARTICLE_CONFIG.maxSpeed * 2) {
      this.vx *= 0.98;
      this.vy *= 0.98;
    }

    // Wrap around edges
    if (this.x < -10) this.x = this.canvas.width + 10;
    if (this.x > this.canvas.width + 10) this.x = -10;
    if (this.y < -10) this.y = this.canvas.height + 10;
    if (this.y > this.canvas.height + 10) this.y = -10;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;

    if (this.isCross) {
      // Medical cross shape
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 12;
      const s = this.radius * 2;
      ctx.fillRect(this.x - s / 6, this.y - s / 2, s / 3, s);
      ctx.fillRect(this.x - s / 2, this.y - s / 6, s, s / 3);
    } else {
      // Glowing circle
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 8;
      ctx.fill();
    }

    ctx.restore();
  }
}

class HeartbeatWave {
  constructor(canvas) {
    this.canvas = canvas;
    this.offset = 0;
    this.y = canvas.height * (0.3 + Math.random() * 0.4);
    this.alpha = 0.06 + Math.random() * 0.04;
    this.speed = 0.5 + Math.random() * 0.3;
    this.amplitude = 15 + Math.random() * 10;
    this.color = PARTICLE_CONFIG.colors[Math.floor(Math.random() * PARTICLE_CONFIG.colors.length)];
  }

  update() {
    this.offset += this.speed;
    if (this.offset > this.canvas.width) this.offset = 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let x = 0; x < this.canvas.width; x += 2) {
      const phase = (x + this.offset) * 0.02;
      // ECG-like wave pattern
      let y = this.y;
      const cycle = (x + this.offset) % 200;
      if (cycle > 80 && cycle < 90) {
        y -= this.amplitude * 0.3;
      } else if (cycle > 90 && cycle < 100) {
        y += this.amplitude;
      } else if (cycle > 100 && cycle < 110) {
        y -= this.amplitude * 1.8;
      } else if (cycle > 110 && cycle < 120) {
        y += this.amplitude * 0.5;
      } else if (cycle > 120 && cycle < 135) {
        y -= this.amplitude * 0.15;
      } else {
        y += Math.sin(phase) * 1.5;
      }

      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

export class ParticleNetwork {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.waves = [];
    this.mouse = { x: null, y: null };
    this.rafId = null;
    this.isRunning = false;

    this._resize();
    this._createParticles();
    this._createWaves();
    this._bindEvents();
  }

  _resize() {
    const parent = this.canvas.parentElement;
    this.canvas.width = parent?.offsetWidth || window.innerWidth;
    this.canvas.height = parent?.offsetHeight || window.innerHeight;
  }

  _createParticles() {
    this.particles = [];
    for (let i = 0; i < PARTICLE_CONFIG.count; i++) {
      const isCross = i < PARTICLE_CONFIG.crossCount;
      this.particles.push(new Particle(this.canvas, isCross));
    }
  }

  _createWaves() {
    this.waves = [];
    for (let i = 0; i < 3; i++) {
      this.waves.push(new HeartbeatWave(this.canvas));
    }
  }

  _bindEvents() {
    this.canvas.addEventListener('mousemove', e => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    });
    this.canvas.addEventListener('mouseleave', () => {
      this.mouse.x = null;
      this.mouse.y = null;
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this._resize();
        this._createWaves();
      }, 200);
    });
  }

  _drawConnections() {
    const { ctx, particles } = this;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < PARTICLE_CONFIG.connectionDist) {
          const alpha = (1 - dist / PARTICLE_CONFIG.connectionDist) * 0.15;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = particles[i].color;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  _loop() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background heartbeat waves
    this.waves.forEach(w => { w.update(); w.draw(ctx); });

    // Particle connections
    this._drawConnections();

    // Particles
    this.particles.forEach(p => {
      p.update(this.mouse);
      p.draw(ctx);
    });

    if (this.isRunning) {
      this.rafId = requestAnimationFrame(() => this._loop());
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._loop();
  }

  stop() {
    this.isRunning = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  destroy() {
    this.stop();
    this.particles = [];
    this.waves = [];
  }
}
