import {H, PROJECTILE_ITERATIONS_PER_FRAME, PROJECTILE_ITERATION_PROGRESS, PROJECTILE_MAX_SOUND_FREQUENCY, PROJECTILE_MIN_SOUND_FREQUENCY, PROJECTILE_POWER_REDUCTION_FACTOR, PROJECTILE_WIND_REDUCTION_FACTOR, WEAPON_TYPES, PLAYER_TANK_Y_FOOTPRINT} from './constants.js?v=6';
import {checkLineWith, drawLineVirtual} from './gfx.js?v=6';
import {createParticles, isTank, isTankShield, spawnNapalm, tracerMode} from './main.js?v=6';
import {deg2rad, parable, rad2deg, wrap} from './math.js?v=6';
import {audio, createOsc} from './sound.js?v=6';
import {isTerrain, landHeight} from './terrain.js?v=6';
import {EXPLOSION_TYPES} from './weapons.js?v=6';


export const PROJECTILE_TYPES = {
  normal: {
    create(spec, player, weapon, ox, oy, a, p, wind) {
      const osc = createOsc('sine');
      osc.start();

      return [{
        type: 'normal',
        player, weapon,
        x:ox, y:oy, ox, oy, a, p,
        t: 0, osc, wind,
        trail: [],
      }];
    },
    stop(projectile) {
      projectile.osc.stop(0);
    },
    update(projectile, terrain, projectiles, trajectories, explosions, dt) {
      const prevProjectile = {...projectile};
      const {weapon, player, wind} = projectile;
      const weaponType = WEAPON_TYPES[weapon.type];
      let exploded = false;
      const iterations = Math.max(1, Math.round(PROJECTILE_ITERATIONS_PER_FRAME * dt * 60));

      for (let i=0; i<iterations; i++) {
        const {ox, oy, a, p, t} = projectile;

        const [x, y] = parable(
          t, ox, oy, deg2rad(180+a),
          p / PROJECTILE_POWER_REDUCTION_FACTOR,
          wind / PROJECTILE_WIND_REDUCTION_FACTOR,
        );
        projectile.x = x;
        projectile.y = y;
        projectile.t += PROJECTILE_ITERATION_PROGRESS;

        const f = (
          (1 - (1 / H * y)) *
          (PROJECTILE_MAX_SOUND_FREQUENCY - PROJECTILE_MIN_SOUND_FREQUENCY) +
          PROJECTILE_MIN_SOUND_FREQUENCY
        );
        projectile.osc.frequency.setValueAtTime(f, audio.currentTime);

        // FIXME: Better detection of player's own shield
        const shieldHit = isTankShield(x, y);
        if (shieldHit && shieldHit.player !== projectile.player) {
          if (shieldHit.shieldType.projectileEffect === 'nullify') {
            exploded = true;
            break;
          } else if (shieldHit.shieldType.projectileEffect === 'spring') {
            const cx = shieldHit.player.x;
            const cy = shieldHit.player.y + PLAYER_TANK_Y_FOOTPRINT;
            const nx = x - cx;
            const ny = y - cy;
            const len = Math.sqrt(nx * nx + ny * ny);
            const ux = nx / len;
            const uy = ny / len;
            const rad = deg2rad(projectile.a);
            const vx = -Math.cos(rad);
            const vy = -Math.sin(rad);
            const dot = vx * ux + vy * uy;
            const rx = vx - 2 * dot * ux;
            const ry = vy - 2 * dot * uy;
            const theta = Math.atan2(ry, rx);
            projectile.a = wrap(0, Math.round(180 - rad2deg(theta)), 180);
            projectile.ox = projectile.x;
            projectile.oy = projectile.y - 1;
            projectile.t = 0;
            break;
          }
        }

        if (
          y > H ||
          isTank(x, y) ||
          isTerrain(terrain, x, y)
        ) {
          const explosionSpec = weaponType.explosion;
          if (explosionSpec.type === 'napalm') {
            spawnNapalm(x, y, explosionSpec.particles, player);
          } else {
            const explosionType = EXPLOSION_TYPES[explosionSpec.type];
            explosions.push({...explosionType.create(explosionSpec, x, y), source: player});
          }
          // @ts-ignore: canvas color hack
          createParticles(x, y, p, terrain.color);
          exploded = true;
          break;
        }
      }

      projectile.trail.push({x: prevProjectile.x, y: prevProjectile.y});
      if (projectile.trail.length > 10) projectile.trail.shift();

      if (tracerMode || weapon.type === 'tracer') {
        let trajectory = drawLineVirtual(
          prevProjectile.x, prevProjectile.y,
          projectile.x, projectile.y, player.c,
        );

        trajectory
          .slice(0, trajectory.length-1)
          .map(x => ({...x, a:255}))
          .forEach(x => trajectories.push(x));
      }

      return !exploded;
    },
  },

  roller: {
    create(spec, player, weapon, ox, oy, a, p, wind) {
      const osc = createOsc('sine');
      osc.start();

      return [{
        type: 'roller',
        player, weapon,
        x:ox, y:oy, ox, oy, a, p,
        t: 0, osc, wind,
        state: 'flying',
        d: 0,
        trail: [],
      }];
    },
    stop(projectile) {
      projectile.osc.stop(0);
    },
    update(projectile, terrain, projectiles, trajectories, explosions, dt) {
      const prevProjectile = {...projectile};
      const {state, weapon, player, wind} = projectile;
      const weaponType = WEAPON_TYPES[weapon.type];
      let finished = false;

      if (state === 'flying') {
        const {ox, oy, a, p, t} = projectile;
        const iterations = Math.max(1, Math.round(PROJECTILE_ITERATIONS_PER_FRAME * dt * 60));
        for (let i=0; i<iterations; i++) {
          let [x, y] = parable(
            t, ox, oy, deg2rad(180+a),
            p / PROJECTILE_POWER_REDUCTION_FACTOR,
            wind / PROJECTILE_WIND_REDUCTION_FACTOR,
          );

          if (isTerrain(terrain, x, y)) {
            let prevPoint;
            checkLineWith(
              prevProjectile.x, prevProjectile.y, x, y,
              (x, y) => {
                if (prevPoint && isTerrain(terrain, prevPoint.x, prevPoint.y) && !isTerrain(terrain, x, y)) {
                  projectile.x = x;
                  projectile.y = y;
                } else if (prevPoint && !isTerrain(terrain, prevPoint.x, prevPoint.y) && isTerrain(terrain, x, y)) {
                  projectile.x = prevPoint.x;
                  projectile.y = prevPoint.y;
                }
                prevPoint = {x, y};
              }
            );
          } else {
            projectile.t += PROJECTILE_ITERATION_PROGRESS;
            projectile.x = x;
            projectile.y = y;
          }

          x = projectile.x;
          y = projectile.y;

          // FIXME: Better detection of player's own shield
          const shieldHit = isTankShield(x, y);
          if (shieldHit && shieldHit.player !== projectile.player) {
            if (shieldHit.shieldType.projectileEffect === 'nullify') {
              finished = true;
              break;
            } else if (shieldHit.shieldType.projectileEffect === 'spring') {
              const cx = shieldHit.player.x;
              const cy = shieldHit.player.y + PLAYER_TANK_Y_FOOTPRINT;
              const nx = x - cx;
              const ny = y - cy;
              const len = Math.sqrt(nx * nx + ny * ny);
              const ux = nx / len;
              const uy = ny / len;
              const rad = deg2rad(projectile.a);
              const vx = -Math.cos(rad);
              const vy = -Math.sin(rad);
              const dot = vx * ux + vy * uy;
              const rx = vx - 2 * dot * ux;
              const ry = vy - 2 * dot * uy;
              const theta = Math.atan2(ry, rx);
              projectile.a = wrap(0, Math.round(180 - rad2deg(theta)), 180);
              projectile.ox = projectile.x;
              projectile.oy = projectile.y - 10;
              projectile.t = 0;
              break;
            }
          }

          if (y > H || isTank(x, y)) {
            projectile.state = 'explode';
            break;
          } else {
            const hitLeft = isTerrain(terrain, x-1, y) || isTerrain(terrain, x-1, y+1);
            const hitRight = isTerrain(terrain, x+1, y) || isTerrain(terrain, x+1, y+1);
            const hitBottom = isTerrain(terrain, x, y+1);
            if (hitLeft || hitRight || hitBottom) {
              projectile.state = 'rolling';
              projectile.d = (
                hitLeft? 1 :
                hitRight? -1 :
                Math.sign(projectile.x - prevProjectile.x)
              );
              break;
            }
          }
        }
      }

      else if (state === 'rolling') {
        const {x, y, d} = projectile;
        const rollSpeed = Math.max(1, Math.round(dt * 60));
        const nextY = landHeight(terrain, x + d * rollSpeed);

        if (nextY < y || y > H || isTank(x, y)) {
          projectile.state = 'explode';
        } else {
          projectile.x += d * rollSpeed;
          projectile.y = nextY;
        }
      }

      else if (state === 'explode') {
        const {x, y, p} = projectile;
        const explosionSpec = weaponType.explosion;
        if (explosionSpec.type === 'napalm') {
          spawnNapalm(x, y, explosionSpec.particles, player);
        } else {
          const explosionType = EXPLOSION_TYPES[explosionSpec.type];
          explosions.push({...explosionType.create(explosionSpec, x, y), source: player});
        }
        // @ts-ignore: canvas color hack
        createParticles(x, y, p, terrain.color);
        finished = true;
      }

      const f = (
        (1 - (1 / H * projectile.y)) *
        (PROJECTILE_MAX_SOUND_FREQUENCY - PROJECTILE_MIN_SOUND_FREQUENCY) +
        PROJECTILE_MIN_SOUND_FREQUENCY
      );
      projectile.osc.frequency.setValueAtTime(f, audio.currentTime);

      projectile.trail.push({x: prevProjectile.x, y: prevProjectile.y});
      if (projectile.trail.length > 10) projectile.trail.shift();

      if (tracerMode || weapon.type === 'tracer') {
        let trajectory = drawLineVirtual(
          prevProjectile.x, prevProjectile.y,
          projectile.x, projectile.y, player.c,
        );

        trajectory
          .slice(0, trajectory.length-1)
          .map(x => ({...x, a:255}))
          .forEach(x => trajectories.push(x));
      }

      return !finished;
    },
  },

  mirv: {
    create(spec, player, weapon, ox, oy, a, p, wind) {
      const {n, s} = spec;
      const projectiles = [];
      const normalType = PROJECTILE_TYPES.normal;

      for (let i=0; i<n; i++) {
        projectiles.push(
          normalType.create(
            {}, player, weapon, ox, oy, a, p, wind-s*i
          )[0]
        );
      }

      return projectiles;
    },
    stop() {},
    update() {},
  },

  leapfrog: {
    create(spec, player, weapon, ox, oy, a, p, wind) {
      const {n, s} = spec;

      return [{
        type:'leapfrog',
        n, s, payload:null,
        player, weapon, ox, oy, a, p, wind,
      }];
    },
    stop() {},
    update(projectile, terrain, projectiles, trajectories, explosions, dt) {
      const {player, weapon, ox, oy, a, p, wind, n, s} = projectile;
      const projectileType = PROJECTILE_TYPES.normal;

      // FIXME: Ugly
      if (!projectile.payload) {
        projectile.n--;
        projectile.payload = projectileType.create(
          {}, player, weapon, ox, oy, a, p, wind,
        )[0];
      }

      const alive = projectileType.update(
        projectile.payload, terrain, projectiles, trajectories, explosions, dt
      );

      if (!alive) {
        projectileType.stop(projectile.payload)
        if (n <= 0) return;

        projectile.n--;
        projectile.payload = projectileType.create(
          {}, player, weapon, projectile.payload.x, projectile.payload.y-2, a, p-s*n, wind, // FIXME: Y Hack
        )[0];
      }

      return true;
    },
  },
}
