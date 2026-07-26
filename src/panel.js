import {PANEL_WIDTH, PANEL_HEIGHT, PANEL_FONT_SIZE, PANEL_TITLE_FONT_SIZE, PANEL_BG_COLOR, PANEL_BORDER_COLOR, W, H, FONT_WIDTH} from './constants.js?v=15';
import {drawRect, drawLine} from './gfx.js?v=15';

const PANEL_X = (W - PANEL_WIDTH) / 2;
const PANEL_Y = (H - PANEL_HEIGHT) / 2;

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

export function drawPanelTitle(ctx, text) {
  const x = PANEL_X + PANEL_WIDTH / 2;
  const y = PANEL_Y + 20;
  ctx.font = `${PANEL_TITLE_FONT_SIZE}px ibm-vga`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'black';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = 'white';
  ctx.fillText(text, x, y);
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
