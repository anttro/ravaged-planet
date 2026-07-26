import {PANEL_WIDTH, PANEL_HEIGHT, PANEL_FONT_SIZE, PANEL_TITLE_FONT_SIZE, PANEL_BG_COLOR, PANEL_BORDER_COLOR, W, H, FONT_WIDTH} from './constants.js?v=15';
import {drawRect, drawLine} from './gfx.js?v=15';

export const PANEL_X = (W - PANEL_WIDTH) / 2;
const PANEL_Y = (H - PANEL_HEIGHT) / 2;

export function drawButton(ctx, x, y, w, h, label, active) {
  drawRect(ctx, x, y, w, h, active ? '#558' : '#444');
  ctx.globalAlpha = 0.35;
  drawRect(ctx, x, y, w, 1, '#fff');
  drawRect(ctx, x, y, 1, h, '#fff');
  drawRect(ctx, x, y + h - 1, w, 1, '#000');
  drawRect(ctx, x + w - 1, y, 1, h, '#000');
  ctx.globalAlpha = 1.0;
  ctx.font = `${PANEL_FONT_SIZE}px ibm-bios`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'black';
  ctx.fillText(label, x + w/2 + 1, y + h/2 + 1);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x + w/2, y + h/2);
}

export function checkHit(cx, cy, x, y, w, h) {
  return cx >= x && cx <= x + w && cy >= y && cy <= y + h;
}

export function drawPanelBg(ctx) {
  ctx.fillStyle = PANEL_BG_COLOR;
  ctx.fillRect(PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT);

  ctx.strokeStyle = PANEL_BORDER_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(PANEL_X + 1, PANEL_Y + 1, PANEL_WIDTH - 2, PANEL_HEIGHT - 2);

  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  ctx.strokeRect(PANEL_X + 3, PANEL_Y + 3, PANEL_WIDTH - 6, PANEL_HEIGHT - 6);
}

export function drawBevelBar(ctx, x, y, w, h, color) {
  if (w <= 0) return;
  drawRect(ctx, x, y, w, h, color);
  ctx.globalAlpha = 0.35;
  drawRect(ctx, x, y, w, 1, '#fff');
  drawRect(ctx, x, y, 1, h, '#fff');
  drawRect(ctx, x, y + h - 1, w, 1, '#000');
  drawRect(ctx, x + w - 1, y, 1, h, '#000');
  ctx.globalAlpha = 1.0;
}

export function drawPanelTitle(ctx, text, barColor) {
  const cx = PANEL_X + PANEL_WIDTH / 2;
  const y = PANEL_Y + 20;
  const gap = 8;
  const margin = 20;

  ctx.font = `${PANEL_TITLE_FONT_SIZE}px ibm-vga`;
  const textWidth = ctx.measureText(text).width;
  const barH = PANEL_TITLE_FONT_SIZE;

  const leftEnd = cx - textWidth / 2 - gap;
  const rightStart = cx + textWidth / 2 + gap;

  if (barColor) {
    drawBevelBar(ctx, PANEL_X + margin, y, leftEnd - (PANEL_X + margin), barH, barColor);
    drawBevelBar(ctx, rightStart, y, (PANEL_X + PANEL_WIDTH - margin) - rightStart, barH, barColor);
  }

  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'black';
  ctx.fillText(text, cx + 1, y + 1);
  ctx.fillStyle = 'white';
  ctx.fillText(text, cx, y);
}

const fireSparks = [];
const flameTongues = [];
const tongueHotspots = [];
for (let i = 0; i < 3; i++) {
  tongueHotspots.push({ x: Math.random(), speed: (Math.random() - 0.5) * 0.002 });
}

function drawFireBar(ctx, x, y, w, h, time) {
  if (w <= 0) return;

  const hash = (v) => { v = (v ^ 61) ^ (v >>> 16); v = v + (v << 3); v = v ^ (v >>> 4); return (v * 0x27d4eb2d) | 0; };
  const seed = (sx) => ((hash(sx) & 0xffff) / 0xffff) * Math.PI * 2;

  // Pre-compute raw flame heights per column
  const raw = new Float32Array(w);
  const drift = Math.sin(time * 0.4) * 4 + Math.sin(time * 0.7 + 1.2) * 2;
  for (let i = 0; i < w; i++) {
    const sx = x + i;
    const dsx = sx + drift;
    const s = seed(sx);
    const wave = Math.sin(time * 2.2 + dsx * 0.025 + s) * 0.28
               + Math.sin(time * 3.1 + dsx * 0.04 + s * 0.7) * 0.18
               + Math.sin(time * 1.5 + dsx * 0.012 + s * 1.3) * 0.14;
    const wander = Math.sin(sx * 0.08 + time * 0.5 + s * 2) * 0.03;
    raw[i] = 0.45 + wave + wander;
  }

  // Smooth with sliding window average (±5px)
  const smooth = new Float32Array(w);
  const windowR = 5;
  for (let i = 0; i < w; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - windowR); j <= Math.min(w - 1, i + windowR); j++) {
      sum += raw[j];
      count++;
    }
    smooth[i] = Math.max(0.1, sum / count);
  }

  // Blend 80/20 smooth + raw for final heights
  const finalH = new Float32Array(w);
  for (let i = 0; i < w; i++) {
    finalH[i] = smooth[i] * 0.8 + raw[i] * 0.2;
  }

  // Modulate finalH by hotspot proximity (scarce base flame)
  for (let i = 0; i < w; i++) {
    const colNorm = i / w;
    let maxProx = 0;
    for (const hs of tongueHotspots) {
      const dist = Math.abs(colNorm - hs.x);
      const prox = 1 - Math.min(1, dist / 0.25);
      if (prox > maxProx) maxProx = prox;
    }
    finalH[i] *= 0.2 + 0.8 * maxProx;
  }

  // 1st pass: main flame body
  for (let i = 0; i < w; i++) {
    const sx = x + i;
    const bendBase = Math.sin(sx * 0.15 + time * 0.7 + seed(sx + 5000));
    const fh = Math.max(1, Math.floor(h * finalH[i]));
    const topY = y + h - fh;

    ctx.globalAlpha = 0.4;
    drawRect(ctx, sx, topY - 2, 1, 4, `rgb(255,120,0)`);

    for (let j = 0; j < fh; j++) {
      const t = j / fh;
      const g = Math.floor(255 - t * 225);
      const b = Math.floor(Math.max(0, 40 - t * 40));
      ctx.globalAlpha = 1 - t * 0.3;
      const bend = bendBase * (1 - t) * 1.5;
      const bx = Math.round(sx + bend);
      drawRect(ctx, bx, topY + j, 1, 1, `rgb(255,${g},${b})`);
    }
  }

  // 2nd pass: glow overlay (built on blended heights, slightly shorter)
  for (let i = 0; i < w; i++) {
    const sx = x + i;
    const s = seed(sx + 1000);
    const extra = Math.sin(time * 2.5 + sx * 0.03 + s) * 0.12;
    const glowH = Math.max(1, Math.floor(h * (finalH[i] * 0.7 + extra)));
    const glowY = y + h - glowH;
    ctx.globalAlpha = 0.25;
    drawRect(ctx, sx - 1, glowY - 1, 3, glowH + 2, `rgb(255,80,0)`);
  }

  // 3rd pass: soft haze (shorter, wider strips)
  for (let i = 0; i < w; i++) {
    const sx = x + i;
    const s = seed(sx + 2000);
    const haze = Math.sin(time * 1.8 + sx * 0.02 + 4.0 + s) * 0.12 + 0.1;
    const hazeH = Math.max(1, Math.floor(h * haze));
    ctx.globalAlpha = 0.12;
    drawRect(ctx, sx - 2, y + h - hazeH, 5, hazeH, `rgb(255,160,0)`);
  }

  // 4th pass: 2nd flame overlay (different phase, broad)
  for (let i = 0; i < w; i++) {
    const sx = x + i;
    const s = seed(sx + 3000);
    const extra = Math.sin(time * 1.9 + sx * 0.02 + s * 1.3) * 0.15
                + Math.sin(time * 2.8 + sx * 0.035 + s * 0.5) * 0.1;
    const flameH = Math.max(1, Math.floor(h * (finalH[i] * 0.55 + extra)));
    const flameY = y + h - flameH;
    ctx.globalAlpha = 0.15;
    drawRect(ctx, sx - 2, flameY - 1, 5, flameH + 2, `rgb(255,100,0)`);
  }

  // 5th pass: hotspot-based flame tongues (cluster, flicker, fade)
  for (const hs of tongueHotspots) {
    hs.x += hs.speed + Math.sin(time * 0.3 + hs.speed * 100) * 0.001;
    if (hs.x < 0) { hs.x = 0; hs.speed *= -1; }
    if (hs.x > 1) { hs.x = 1; hs.speed *= -1; }
  }

  const spawnChance = 0.025;
  if (Math.random() < spawnChance) {
    const hs = tongueHotspots[Math.floor(Math.random() * tongueHotspots.length)];
    flameTongues.push({
      x: x + (hs.x + (Math.random() - 0.5) * 0.05) * w,
      phase: 0,
      maxH: 0.5 + Math.random() * 0.3,
      speed: 0.008 + Math.random() * 0.007,
      width: 5 + Math.random() * 5,
      seed: Math.random() * 100,
    });
  }

  for (let i = flameTongues.length - 1; i >= 0; i--) {
    const t = flameTongues[i];
    t.phase += t.speed;
    if (t.phase >= 1) { flameTongues.splice(i, 1); continue; }

    const heightFactor = Math.sin(t.phase * Math.PI);
    const flicker = 0.85 + Math.sin(time * 15 + t.x * 3 + t.seed) * 0.15;
    const totalH = h * t.maxH * heightFactor * flicker;
    if (totalH < 1) continue;

    const halfW = Math.floor(t.width / 2);
    const bend = Math.sin(t.x * 0.15 + time * 0.7 + t.seed) * 1.5;

    for (let dx = -halfW; dx <= halfW; dx++) {
      const colX = Math.round(t.x + dx + bend);
      if (colX < x || colX >= x + w) continue;
      const dist = Math.abs(dx) / halfW;
      const localH = Math.max(1, Math.floor(totalH * (1 - dist * 0.4)));
      const localTop = y + h - localH;
      const colAlpha = (1 - dist) * 0.35 * heightFactor;
      for (let j = 0; j < localH; j++) {
        const p = j / localH;
        const g = Math.floor(200 - p * 180);
        const b = Math.floor(Math.max(0, 30 - p * 30));
        ctx.globalAlpha = colAlpha * (1 - p * 0.4);
        drawRect(ctx, colX, localTop + j, 1, 1, `rgb(255,${g},${b})`);
      }
    }
  }

  // 6th pass: spark particles
  if (Math.random() < 0.4) {
    fireSparks.push({
      x: x + Math.random() * w,
      y: y + h * (0.3 + Math.random() * 0.5),
      vx: (Math.random() - 0.5) * 0.8,
      vy: -(1 + Math.random() * 1.5),
      life: 1.0,
    });
  }

  for (let i = fireSparks.length - 1; i >= 0; i--) {
    const sp = fireSparks[i];
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.life -= 0.06;
    if (sp.life <= 0 || sp.y < y - 5 || sp.x < x - 5 || sp.x > x + w + 5) {
      fireSparks.splice(i, 1);
      continue;
    }
    const alpha = sp.life * 0.8;
    const size = sp.life > 0.5 ? 2 : 1;
    ctx.globalAlpha = alpha;
    const bright = sp.life > 0.6 ? '255,255,200' : '255,180,50';
    drawRect(ctx, Math.round(sp.x), Math.round(sp.y), size, size, `rgb(${bright})`);
  }

  ctx.globalAlpha = 1.0;
}

export function drawPanelTitleFancy(ctx, text, time) {
  const y = PANEL_Y + 20;
  const fontSize = PANEL_TITLE_FONT_SIZE * 2;
  const margin = 20;

  // Fire covers full title width (background)
  const fireW = PANEL_WIDTH - margin * 2;
  drawFireBar(ctx, PANEL_X + margin, y, fireW, fontSize, time);

  // Text on top (foreground)
  const cx = PANEL_X + PANEL_WIDTH / 2;
  ctx.font = `${fontSize}px ibm-vga`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  let dx = cx - ctx.measureText(text).width / 2;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const cw = ctx.measureText(char).width;
    const hue = Math.sin(time * 8 + i * 1.5) * 25 + 15;
    const lightness = 55 + Math.sin(time * 6 + i * 2) * 10;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(char, dx + 1, y + 1);
    ctx.fillStyle = `hsl(${hue}, 100%, ${lightness}%)`;
    ctx.fillText(char, dx, y);
    dx += cw;
  }
}

export function drawPanelText(ctx, text, x, y, color = 'white', align = 'left') {
  ctx.font = `${PANEL_FONT_SIZE}px ibm-bios`;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  ctx.fillStyle = 'black';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function drawPanelDivider(ctx, y) {
  const x1 = PANEL_X + 20;
  const x2 = PANEL_X + PANEL_WIDTH - 20;
  drawLine(ctx, x1, y, x2, y, '#999');
}

export function drawPanelMenu(ctx, items, selectedIndex, y) {
  for (let i = 0; i < items.length; i++) {
    const itemY = y + i * 20;
    const isSelected = i === selectedIndex;
    const prefix = isSelected ? '> ' : '  ';
    const color = isSelected ? 'yellow' : 'white';
    drawPanelText(ctx, prefix + items[i], PANEL_X + 40, itemY, color);
  }
}

export function getPanelBounds() {
  return {x: PANEL_X, y: PANEL_Y, w: PANEL_WIDTH, h: PANEL_HEIGHT};
}
