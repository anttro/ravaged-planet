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
let firePixels = null;
let fireImgData = null;
let firePalette = null;
let fireFrame = 0;

function buildFirePalette() {
  firePalette = [];
  for (let i = 0; i < 256; i++) {
    let r = i < 64 ? (i * 4) : 255;
    let g = i < 64 ? 0 : (i < 128 ? (i - 64) * 4 : 255);
    let b = i < 192 ? 0 : (i - 192) * 4;
    firePalette.push({r, g, b});
  }
}

function drawFireBar(ctx, x, y, w, h, time) {
  if (w <= 0 || h <= 0) return;

  // Lazy init heat buffer + image data + palette
  if (!firePixels || firePixels.length !== w * h) {
    firePixels = new Uint8Array(w * h);
    fireImgData = ctx.createImageData(w, h);
    firePalette = null;
  }
  if (!firePalette) buildFirePalette();

  // Slow the animation: update the heat buffer every other frame
  if (fireFrame % 2 === 0) {
    // Step A: seed the bottom row with random heat (fuel source)
    const lastRowStart = (h - 1) * w;
    for (let xc = 0; xc < w; xc++) {
      firePixels[lastRowStart + xc] = Math.random() > 0.15 ? 255 : 0;
    }

    // Step B: propagate fire upward and cool it down
    for (let yc = 0; yc < h - 1; yc++) {
      for (let xc = 0; xc < w; xc++) {
        const idx = yc * w + xc;
        const b  = firePixels[idx + w];
        const bl = xc > 0 ? firePixels[idx + w - 1] : b;
        const br = xc < w - 1 ? firePixels[idx + w + 1] : b;
        const b2 = yc < h - 2 ? firePixels[idx + (w * 2)] : b;
        firePixels[idx] = Math.floor((b + bl + br + b2) / 4.8) | 0;
      }
    }
  }
  fireFrame++;

  // Step C: map heat to colors and blit
  const data = fireImgData.data;
  for (let i = 0; i < firePixels.length; i++) {
    const heat = firePixels[i];
    const di = i * 4;
    const c = firePalette[heat];
    const t = Math.min(1, heat / 24);
    data[di] = 102 + (c.r - 102) * t;
    data[di + 1] = 102 + (c.g - 102) * t;
    data[di + 2] = 102 + (c.b - 102) * t;
    data[di + 3] = 255;
  }
  ctx.putImageData(fireImgData, x, y);

  // Sparks from flame tips (topmost hot cell per column)
  for (let xc = 0; xc < w; xc++) {
    let tipRow = -1;
    for (let yc = 0; yc < h; yc++) {
      if (firePixels[yc * w + xc] > 60) { tipRow = yc; break; }
    }
    if (tipRow >= 0 && Math.random() < 0.025) {
      fireSparks.push({
        x: x + xc,
        y: y + tipRow,
        vx: (Math.random() - 0.5) * 0.15,
        vy: -(0.2 + Math.random() * 0.3),
        life: 0.5 + Math.random() * 0.5,
        size: 2,
      });
    }
  }

  // Spark particles
  for (let i = fireSparks.length - 1; i >= 0; i--) {
    const sp = fireSparks[i];
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.life -= 0.06;
    if (sp.life <= 0 || sp.y < y - 5 || sp.x < x - 5 || sp.x > x + w + 5) {
      fireSparks.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = Math.max(0, sp.life) * 0.8;
    drawRect(ctx, Math.round(sp.x), Math.round(sp.y), sp.size, sp.size, `rgb(255,200,100)`);
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
