import {SKY_COLORS} from './constants.js?v=5';
import {drawRect} from './gfx.js?v=5';
import {gradient} from './math.js?v=5';
import {sample} from './utils.js?v=5';

export function generateSky(ctx) {
  const {width, height} = ctx.canvas;
  const {from, to} = sample(SKY_COLORS);

  for (let y=0; y<height; y++) {
    const f = y / height;
    const r = gradient(from[0], to[0], f);
    const g = gradient(from[1], to[1], f);
    const b = gradient(from[2], to[2], f);
    drawRect(ctx, 0, y, width, 1, `rgb(${r},${g},${b})`);
  }
}
