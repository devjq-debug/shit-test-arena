const scene = document.getElementById('home-render-scene');
const canvas = document.getElementById('home-scene-canvas');
const ctx = canvas?.getContext('2d', { alpha: true });

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const state = {
  active: false,
  reduced: prefersReducedMotion?.matches || document.body.classList.contains('reduced-fx'),
  width: 0,
  height: 0,
  ratio: 1,
  start: performance.now(),
  mouseX: 0,
  mouseY: 0,
  targetX: 0,
  targetY: 0,
  sparks: [],
  silhouettes: [],
  smoke: []
};

function isMobile() {
  return window.matchMedia?.('(max-width: 768px)').matches || window.innerWidth < 768;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function resize() {
  if (!canvas || !ctx) return;
  state.ratio = Math.min(window.devicePixelRatio || 1, 2);
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  canvas.width = Math.floor(state.width * state.ratio);
  canvas.height = Math.floor(state.height * state.ratio);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(state.ratio, 0, 0, state.ratio, 0, 0);
  seedScene();
}

function seedScene() {
  const mobile = isMobile();
  const sparkCount = state.reduced ? 12 : mobile ? 22 : 46;
  const crowdCount = mobile ? 38 : 86;
  const smokeCount = state.reduced ? 6 : mobile ? 12 : 24;

  state.sparks = Array.from({ length: sparkCount }, (_, index) => ({
    x: rand(0, state.width),
    y: rand(state.height * 0.2, state.height * 0.98),
    z: rand(0.35, 1.4),
    r: rand(0.6, mobile ? 1.8 : 2.5),
    speed: rand(4, 18),
    drift: rand(-8, 8),
    hue: index % 3 === 0 ? '#ff2a85' : index % 3 === 1 ? '#ff7a18' : '#ffffff'
  }));

  state.silhouettes = Array.from({ length: crowdCount }, (_, index) => ({
    x: (index / Math.max(1, crowdCount - 1)) * state.width + rand(-18, 18),
    y: rand(state.height * 0.76, state.height * 1.02),
    h: rand(mobile ? 18 : 28, mobile ? 60 : 98),
    w: rand(mobile ? 5 : 8, mobile ? 16 : 25),
    phase: rand(0, Math.PI * 2),
    phone: Math.random() > (mobile ? 0.82 : 0.74)
  }));

  state.smoke = Array.from({ length: smokeCount }, (_, index) => ({
    x: rand(-state.width * 0.1, state.width * 1.1),
    y: rand(state.height * 0.34, state.height * 0.88),
    r: rand(mobile ? 80 : 120, mobile ? 220 : 360),
    speed: rand(0.006, 0.025) * (index % 2 ? 1 : -1),
    lift: rand(0.004, 0.018),
    phase: rand(0, Math.PI * 2),
    tint: index % 3
  }));
}

function setHomeActive() {
  const active = !document.getElementById('screen-ui-1')?.classList.contains('hidden');
  state.active = active;
  document.body.classList.toggle('home-scene-active', active);
  if (active) requestAnimationFrame(render);
}

function drawBackground(time) {
  const w = state.width;
  const h = state.height;
  const push = Math.min(1, (time - state.start) / 1800);
  const cam = 1 + push * 0.018 + Math.sin(time * 0.00017) * 0.006;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(cam, cam);
  ctx.translate(-w / 2, -h / 2);

  const bg = ctx.createRadialGradient(w * 0.52, h * 0.52, 0, w * 0.52, h * 0.52, Math.max(w, h) * 0.78);
  bg.addColorStop(0, '#351016');
  bg.addColorStop(0.42, '#130b10');
  bg.addColorStop(1, '#030305');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255, 26, 117, .18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i += 1) {
    const y = h * 0.18 + i * h * 0.045 + Math.sin(time * 0.0006 + i) * 7;
    ctx.beginPath();
    ctx.moveTo(-40, y);
    ctx.bezierCurveTo(w * 0.24, y - 32, w * 0.72, y + 34, w + 40, y - 18);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSmoke(time) {
  const w = state.width;
  const h = state.height;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  state.smoke.forEach((cloud, index) => {
    const x = cloud.x + Math.sin(time * cloud.speed + cloud.phase) * w * 0.08;
    const y = cloud.y - ((time * cloud.lift + index * 17) % (h * 0.16)) + Math.cos(time * cloud.speed * 1.7 + cloud.phase) * 22;
    const pulse = 0.82 + Math.sin(time * 0.0011 + cloud.phase) * 0.16;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, cloud.r * pulse);
    const tint = cloud.tint === 0 ? '255,26,117' : cloud.tint === 1 ? '249,115,22' : '180,210,255';
    gradient.addColorStop(0, `rgba(${tint}, .16)`);
    gradient.addColorStop(0.38, `rgba(${tint}, .07)`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(x, y, cloud.r * pulse, cloud.r * 0.38 * pulse, Math.sin(time * 0.0003 + index), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawSpotlights(time) {
  const w = state.width;
  const h = state.height;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const count = isMobile() ? 4 : 7;
  for (let i = 0; i < count; i += 1) {
    const originX = (i / Math.max(1, count - 1)) * w;
    const sweep = Math.sin(time * (0.00028 + i * 0.00003) + i * 1.7);
    const targetX = w * 0.5 + sweep * w * 0.38;
    const targetY = h * (0.58 + Math.cos(time * 0.00021 + i) * 0.08);
    const beam = ctx.createLinearGradient(originX, -20, targetX, targetY);
    const color = i % 2 ? '255,26,117' : '255,245,225';
    beam.addColorStop(0, `rgba(${color}, .24)`);
    beam.addColorStop(0.6, `rgba(${color}, .07)`);
    beam.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(originX - 18, -20);
    ctx.lineTo(originX + 18, -20);
    ctx.lineTo(targetX + 120, targetY);
    ctx.lineTo(targetX - 120, targetY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawAudience(time) {
  const h = state.height;
  ctx.save();
  state.silhouettes.forEach((person, index) => {
    const bob = Math.sin(time * 0.002 + person.phase) * (person.phone ? 8 : 4);
    const x = person.x + Math.sin(time * 0.001 + person.phase) * 5;
    const y = person.y + bob;
    ctx.fillStyle = index % 5 === 0 ? 'rgba(18, 6, 14, .92)' : 'rgba(3, 3, 5, .92)';
    ctx.beginPath();
    ctx.roundRect(x - person.w / 2, y - person.h, person.w, person.h, person.w * 0.55);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - person.h - person.w * 0.24, person.w * 0.62, 0, Math.PI * 2);
    ctx.fill();
    if (person.phone) {
      const flash = Math.sin(time * 0.004 + person.phase) > 0.965;
      ctx.fillStyle = flash ? 'rgba(255,255,255,.9)' : 'rgba(255,26,117,.42)';
      ctx.fillRect(x + person.w * 0.8, y - person.h * 1.15, 4, 12);
      if (flash) {
        ctx.fillStyle = 'rgba(255,255,255,.15)';
        ctx.beginPath();
        ctx.arc(x + person.w, y - person.h * 1.12, 30, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  const floor = ctx.createLinearGradient(0, h * 0.68, 0, h);
  floor.addColorStop(0, 'rgba(255,26,117,.08)');
  floor.addColorStop(0.45, 'rgba(249,115,22,.13)');
  floor.addColorStop(1, 'rgba(0,0,0,.88)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, h * 0.64, state.width, h * 0.36);
  ctx.restore();
}

function drawSparks(time) {
  const h = state.height;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  state.sparks.forEach((spark, index) => {
    const y = (spark.y - ((time * 0.001 * spark.speed + index * 19) % (h * 0.92)));
    const x = spark.x + Math.sin(time * 0.001 + index) * spark.drift;
    ctx.fillStyle = spark.hue;
    ctx.globalAlpha = 0.28 + Math.sin(time * 0.002 + index) * 0.2;
    ctx.shadowBlur = 14;
    ctx.shadowColor = spark.hue;
    ctx.beginPath();
    ctx.arc(x, y < 0 ? y + h : y, spark.r * spark.z, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
  ctx.globalAlpha = 1;
}

function render(time) {
  if (!ctx || !state.active) return;
  if (state.reduced && time - state.start > 2500) return;
  ctx.clearRect(0, 0, state.width, state.height);
  drawBackground(time);
  if (!state.reduced) drawSpotlights(time);
  drawSmoke(time);
  drawAudience(time);
  if (!state.reduced) drawSparks(time);
  requestAnimationFrame(render);
}

function moveScene(event) {
  const x = ((event.clientX || state.width / 2) / Math.max(1, state.width) - 0.5) * 36;
  const y = ((event.clientY || state.height / 2) / Math.max(1, state.height) - 0.5) * 24;
  state.targetX = x;
  state.targetY = y;
}

function parallaxTick() {
  if (scene) {
    state.mouseX += (state.targetX - state.mouseX) * 0.06;
    state.mouseY += (state.targetY - state.mouseY) * 0.06;
    scene.style.setProperty('--px', `${state.mouseX.toFixed(2)}px`);
    scene.style.setProperty('--py', `${state.mouseY.toFixed(2)}px`);
  }
  requestAnimationFrame(parallaxTick);
}

window.addEventListener('resize', resize, { passive: true });
window.addEventListener('mousemove', moveScene, { passive: true });
window.addEventListener('arena-screen-change', setHomeActive);
prefersReducedMotion?.addEventListener?.('change', (event) => {
  state.reduced = event.matches || document.body.classList.contains('reduced-fx');
  resize();
});

const audioObserver = new MutationObserver(() => {
  state.reduced = prefersReducedMotion?.matches || document.body.classList.contains('reduced-fx');
});
audioObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

resize();
setHomeActive();
requestAnimationFrame(parallaxTick);
