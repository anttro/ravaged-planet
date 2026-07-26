import {PLAYER_TANK_BOUNDING_RADIUS, PLAYER_TANK_Y_FOOTPRINT, SHIELD_TYPES} from './constants.js?v=15';
import {drawCircle, plot} from './gfx.js?v=15';
import {clamp, cycle, distance, randomInt} from './math.js?v=15';
import {audio, createOsc} from './sound.js?v=15';
import {clipTerrain} from './terrain.js?v=15';

export function drawExplosion(ctx, x, y, r) {
  const step = Math.max(1, Math.floor(r / 12));
  for (let i = r; i > 0; i -= step) {
    const t = 1 - (i / r);
    const base = 60 + Math.floor(t * 195);
    const flicker = Math.floor(Math.sin(r * 0.3 + i * 0.7) * 35);
    const red = clamp(0, base + flicker, 255);
    const green = clamp(0, Math.floor(flicker * 0.3 + t * 25), 50);
    drawCircle(ctx, x, y, i, `rgb(${red}, ${green}, 0)`);
  }
}

export function drawDirt(ctx, x, y, r, c) {
  drawCircle(ctx, x, y, r, c);
}

export function drawLavaExplosion(ctx, x, y, r) {
  drawCircle(ctx, x, y, r, 'rgb(60, 0, 0)');
  const count = Math.floor(r * 1.2);
  for (let i = 0; i < count; i++) {
    const dist = Math.random() * r;
    const angle = Math.random() * Math.PI * 2;
    const sx = x + Math.cos(angle) * dist;
    const sy = y + Math.sin(angle) * dist;
    const spotR = Math.max(1, Math.random() * (2 + r * 0.03));
    const heat = 1 - dist / r;
    const red = 180 + Math.floor(Math.random() * 75);
    const green = Math.floor(Math.random() * heat * 150);
    drawCircle(ctx, sx, sy, spotR, `rgb(${red}, ${green}, 0)`);
  }
}

export const EXPLOSION_TYPES = {
  tracer: {
    create(spec, x, y) {
      return {type:'tracer'};
    },
    update(explosion) {},
    draw(explosion, foreground) {},
    stop(explosion) {},
    clip(explosion, terrain) {},
    damage(explosion, player) {}
  },
  blast: {
    create(spec, x, y) {
      const {r} = spec;
      const osc = createOsc('sawtooth');
      osc.start();
      return {type:'blast', x, y, r, cr:0, osc};
    },
    update(explosion, dt) {
      return (explosion.cr += dt * 30) < explosion.r;
    },
    draw(explosion, foreground) {
      const {x, y, cr, osc} = explosion;
      const f = cycle(explosion.cr, 6) % 2 === 0 ? 55 : 110;
      osc.frequency.setValueAtTime(f, audio.currentTime);
      drawExplosion(foreground, x, y, cr);
    },
    stop(explosion) {
      const {osc} = explosion;
      osc.stop();
    },
    clip(explosion, terrain) {
      const {x, y, cr} = explosion;
      clipTerrain(terrain, (ctx) => drawExplosion(ctx, x, y, cr));
    },
    damage(explosion, player) {
      const {x, y, r} = explosion;
      const dist = distance(x, y, player.x, player.y+PLAYER_TANK_Y_FOOTPRINT);
      const overlap = clamp(0, dist - r, Infinity);
      const shieldType = player.shield ? SHIELD_TYPES[player.shield.type] : null;
      const radius = PLAYER_TANK_BOUNDING_RADIUS + (shieldType? shieldType.r : 0);
      if (overlap <= radius) {
        return Math.round(100 * (1 - overlap / (radius+1)));
      }
    }
  },
  lava: {
    create(spec, x, y) {
      const {r} = spec;
      const osc = createOsc('sawtooth');
      osc.start();
      return {type:'lava', x, y, r, cr:0, osc};
    },
    update(explosion, dt) {
      return (explosion.cr += dt * 30) < explosion.r;
    },
    draw(explosion, foreground) {
      const {x, y, cr, osc} = explosion;
      const f = cycle(explosion.cr, 6) % 2 === 0 ? 55 : 110;
      osc.frequency.setValueAtTime(f, audio.currentTime);
      drawLavaExplosion(foreground, x, y, cr);
    },
    stop(explosion) {
      const {osc} = explosion;
      osc.stop();
    },
    clip(explosion, terrain) {
      const {x, y, cr} = explosion;
      clipTerrain(terrain, (ctx) => drawCircle(ctx, x, y, cr, '#000'));
    },
    damage(explosion, player) {
      const {x, y, r} = explosion;
      const dist = distance(x, y, player.x, player.y+PLAYER_TANK_Y_FOOTPRINT);
      const overlap = clamp(0, dist - r, Infinity);
      const shieldType = player.shield ? SHIELD_TYPES[player.shield.type] : null;
      const radius = PLAYER_TANK_BOUNDING_RADIUS + (shieldType? shieldType.r : 0);
      if (overlap <= radius) {
        return Math.round(100 * (1 - overlap / (radius+1)));
      }
    }
  },
  dirt: {
    create(spec, x, y) {
      const {r} = spec;
      const osc = createOsc('triangle');
      osc.start();
      return {type:'dirt', x, y, r, cr:0, osc};
    },
    stop(explosion) {
      const {osc} = explosion;
      osc.stop();
    },
    update(explosion, dt) {
      return (explosion.cr += dt * 30) < explosion.r;
    },
    draw(explosion, foreground, terrain) {
      const {x, y, cr, osc} = explosion;
      const f = explosion.cr % 2 === 0 ? 220 + explosion.cr : 0;
      osc.frequency.setValueAtTime(f, audio.currentTime);
      osc.frequency.setValueAtTime(0, audio.currentTime+0.1);
      drawDirt(foreground, x, y, cr, terrain.color);
    },
    clip(explosion, terrain) {
      const {x, y, cr} = explosion;
      drawDirt(terrain, x, y, cr, terrain.color);
    },
    damage(explosion, player) {}
  },
  digBomb: {
    create(spec, x, y) {
      const {r} = spec;
      const osc = createOsc('triangle');
      osc.start();
      return {type:'digBomb', x, y, r, cr:0, osc};
    },
    stop(explosion) {
      const {osc} = explosion;
      osc.stop();
    },
    update(explosion, dt) {
      return (explosion.cr += dt * 30) < explosion.r;
    },
    draw(explosion, foreground, terrain) {
      const {x, y, cr, osc} = explosion;
      const f = explosion.cr % 2 === 0 ? 440 - explosion.cr : 0;
      osc.frequency.setValueAtTime(f, audio.currentTime);
      osc.frequency.setValueAtTime(0, audio.currentTime+0.1);
      drawDirt(foreground, x, y, cr, 'brown');
    },
    clip(explosion, terrain) {
      const {x, y, cr} = explosion;
      clipTerrain(terrain, (ctx) => drawDirt(ctx, x, y, cr));
    },
    damage(explosion, player) {}
  },
  dirtCone: {
    create(spec, x, y) {
      const {r} = spec;
      const pattern = [];
      const osc = createOsc('triangle');
      osc.start();
      return {type:'dirtCone', x, y, r, cr:0, osc, pattern};
    },
    stop(explosion) {
      const {osc} = explosion;
      osc.stop();
    },
    update(explosion, dt) {
      return (explosion.cr += dt * 60) < Math.min(explosion.r, explosion.y);
    },
    draw(explosion, foreground, terrain) {
      const {x, y, cr, osc, pattern} = explosion;

      const nextRow = Math.floor(cr);
      if (nextRow >= pattern.length) {
        let row = [];
        for (let cx=0; cx < 1+nextRow*2; cx++) {
          row.push(randomInt(0, 3) === 0);
        }
        pattern.push(row);
      }

      for (let cy=0; cy<pattern.length; cy++) {
        const row = pattern[cy];
        for (let cx=0; cx<row.length; cx++) {
          if (row[cx]) plot(foreground, x-cy+cx, y-cy, terrain.color);
        }
      }

      const f = explosion.cr % 2 === 0 ? 220 + explosion.cr : 0;
      osc.frequency.setValueAtTime(f, audio.currentTime);
      osc.frequency.setValueAtTime(0, audio.currentTime+0.1);
    },
    clip(explosion, terrain) {
      const {x, y, pattern} = explosion;

      for (let cy=0; cy<pattern.length; cy++) {
        const row = pattern[cy];
        for (let cx=0; cx<row.length; cx++) {
          if (row[cx]) plot(terrain, x-cy+cx, y-cy, terrain.color);
        }
      }
    },
    damage(explosion, player) {}
  },
  napalm: {
    create(spec) {
      return {type:'napalm', particles: spec.particles};
    },
    update() { return false; },
    draw() {},
    stop() {},
    clip() {},
    damage() {},
  },
}
