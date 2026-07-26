import {AI_TYPES} from './ai.js?v=6';
import {DEATH_SPECS, EXPLOSION_SHAKE_REDUCTION_FACTOR, H, MAX_EXPLOSION_SHAKE_FACTOR, MAX_WIND, PARTICLE_AMOUNT, PARTICLE_FADE_AMOUNT, PARTICLE_MAX_POWER_FACTOR, PARTICLE_MIN_LIFETIME, PARTICLE_MIN_POWER_FACTOR, PARTICLE_POWER_REDUCTION_FACTOR, PARTICLE_TIME_FACTOR, PARTICLE_WIND_REDUCTION_FACTOR, PLAYER_ANGLE_FAST_INCREMENT, PLAYER_ANGLE_INCREMENT, PLAYER_ANGLE_TICK_SOUND_INTERVAL, PLAYER_COLORS, PLAYER_ENERGY_POWER_MULTIPLIER, PLAYER_EXPLOSION_PARTICLE_POWER, PLAYER_FALL_DAMAGE_FACTOR, PLAYER_FALL_DAMAGE_HEIGHT, PLAYER_INITIAL_POWER, PLAYER_MAX_ENERGY, PLAYER_POWER_FAST_INCREMENT, PLAYER_POWER_INCREMENT, PLAYER_POWER_TICK_SOUND_INTERVAL, PLAYER_STARTING_TOOLS, PLAYER_STARTING_WEAPONS, PLAYER_TANK_BOUNDING_RADIUS, PLAYER_TANK_Y_FOOTPRINT, SHIELD_TYPES, TRAJECTORY_FADE_SPEED, TRAJECTORY_FLOAT_SPEED, W, WEAPON_TYPES, Z, STARTING_SCORE, SCORE_PER_KILL, SCORE_FOR_WIN, MARKET_ITEMS, NAPALM_SPAWN_RATE, FIRE_DURATION, FIRE_DAMAGE} from './constants.js?v=6';
import {createCanvas, drawLine, drawRect, drawSemiCircle, drawText, loop, plot, strokeCircle} from './gfx.js?v=6';
import {afterKeyDelay, key} from './input.js?v=6';
import {clamp, deg2rad, distance, parable, random, randomInt, vec, wrap} from './math.js?v=6';
import {PROJECTILE_TYPES} from './projectiles.js?v=6';
import {generateSky} from './sky.js?v=6';
import {playTickSound} from './sound.js?v=6';
import {clipTerrain, closestLand, collapseTerrain, generateTerrain, isTerrain, landHeight, startCollapseTerrain, collapseTerrainStep} from './terrain.js?v=6';
import {sample, shuffle} from './utils.js?v=6';
import {EXPLOSION_TYPES} from './weapons.js?v=6';
import {drawPanelBg, drawPanelTitle, drawPanelText, drawPanelDivider, drawPanelMenu, getPanelBounds} from './panel.js?v=6';


let state = 'start-game';
let players = [];
let currentPlayer = 0;
let projectiles = [];
let explosions = [];
let wind = 0;
let particles = [];
let screenShake = 0;
let trajectories = [];
let idle = false;
let dt = 0;
let collapseState = null;
let napalmParticles = [];
let fireCells = [];
let smokeParticles = [];
let napalmEmitter = null;
let winner;

let score = 0;
let round = 0;
let totalRounds = 1;
let selectedPlayers = 6;
let selectedTerrain = null;
let menuState = null;
let tracerMode = true;
export {tracerMode};

// Music
// const music = createAudioLoop('assets/battle.mp3');

// Init layers
const sky = createCanvas(W, H);
const traces = createCanvas(W, H);
const terrain = createCanvas(W, H, true);
const foreground = createCanvas(W, H);

// Composited layer
const framebuffer = createCanvas(W, H);
framebuffer.canvas.style.width = `${W * Z}px`;
framebuffer.canvas.style.height = `${H * Z}px`;
document.body.appendChild(framebuffer.canvas);

function init() {
  currentPlayer = 0;
  projectiles = [];
  explosions = [];
  particles = [];
  screenShake = 0;
  trajectories = [];
  idle = false;
  winner = null;
  wind = randomInt(-MAX_WIND, +MAX_WIND);

  initLevel();
  initPlayers();
}

function initNewGame() {
  score = STARTING_SCORE;
  round = 0;
  totalRounds = 1;
  selectedPlayers = 6;
  selectedTerrain = null;
  napalmParticles = [];
  fireCells = [];
  smokeParticles = [];
  napalmEmitter = null;
  menuState = {
    selected: 0,
    values: [1, 0, 0, 0],
  };
  state = 'start-menu';
}

function updateStartMenu() {
  const options = ['Players', 'Rounds', 'Terrain', 'Tracer'];
  const playerCounts = [2, 3, 4, 5, 6];
  const roundCounts = [1, 3, 5, 10];
  const terrains = ['Random', 'Mountain', 'Sand'];
  const tracerOptions = ['On', 'Off'];

  if (!menuState) {
    menuState = {
      selected: 0,
      values: [selectedPlayers, totalRounds, selectedTerrain || 0, tracerMode ? 0 : 1],
    };
  }

  if (key('ArrowUp')) {
    if (afterKeyDelay()) {
      menuState.selected = (menuState.selected - 1 + options.length) % options.length;
      playTickSound();
    }
  }
  else if (key('ArrowDown')) {
    if (afterKeyDelay()) {
      menuState.selected = (menuState.selected + 1) % options.length;
      playTickSound();
    }
  }
  else if (key('ArrowLeft')) {
    if (afterKeyDelay()) {
      const opt = menuState.selected;
      if (opt === 0) {
        menuState.values[0] = (menuState.values[0] - 2 + playerCounts.length) % playerCounts.length;
      } else if (opt === 1) {
        menuState.values[1] = (menuState.values[1] - 1 + roundCounts.length) % roundCounts.length;
      } else if (opt === 2) {
        menuState.values[2] = (menuState.values[2] - 1 + terrains.length) % terrains.length;
      } else if (opt === 3) {
        menuState.values[3] = menuState.values[3] === 0 ? 1 : 0;
      }
      playTickSound();
    }
  }
  else if (key('ArrowRight')) {
    if (afterKeyDelay()) {
      const opt = menuState.selected;
      if (opt === 0) {
        menuState.values[0] = (menuState.values[0] + 1) % playerCounts.length;
      } else if (opt === 1) {
        menuState.values[1] = (menuState.values[1] + 1) % roundCounts.length;
      } else if (opt === 2) {
        menuState.values[2] = (menuState.values[2] + 1) % terrains.length;
      } else if (opt === 3) {
        menuState.values[3] = menuState.values[3] === 0 ? 1 : 0;
      }
      playTickSound();
    }
  }
  else if (key('Enter')) {
    if (afterKeyDelay()) {
      selectedPlayers = playerCounts[menuState.values[0]];
      totalRounds = roundCounts[menuState.values[1]];
      selectedTerrain = menuState.values[2] === 0 ? null : terrains[menuState.values[2]].toLowerCase();
      tracerMode = menuState.values[3] === 0;
      menuState = null;
      score = STARTING_SCORE;
      initAllPlayerStats();
      state = 'market';
    }
  }
}

function initAllPlayerStats() {
  players = [];
  const playerCount = selectedPlayers;
  for (let i=0; i<playerCount; i++) {
    const [color, borderColor] = PLAYER_COLORS[i];
    players.push({
      name: `Player ${i+1}`,
      dead: false,
      x:0, y:0, a:0,
      c: color, cb: borderColor,
      p: PLAYER_INITIAL_POWER,
      tools: [],
      weapons: (() => {
        const w = PLAYER_STARTING_WEAPONS.map(x => ({...x}));
        if (tracerMode) w.push({type: 'tracer', ammo: Infinity});
        return w;
      })(),
      currentWeapon: 0,
      energy: PLAYER_MAX_ENERGY,
      shield: null,
      ai: i !== 0 ? sample(Object.keys(AI_TYPES)) : undefined,
      parachute: null,
      fallHeight: 0,
      score: 0,
      kills: 0,
      deaths: 0,
      shotsFired: 0,
      wins: 0,
      lastDamageSource: null,
    });
  }
}

function updateMarket() {
  const marketItems = Object.keys(MARKET_ITEMS).filter(item => !(tracerMode && item === 'tracer'));

  if (!menuState) {
    menuState = {
      selected: 0,
      scrollOffset: 0,
    };
    players.forEach(p => {
      if (p.ai) aiBuy(p);
    });
  }

  if (key('ArrowUp')) {
    if (afterKeyDelay()) {
      menuState.selected = (menuState.selected - 1 + marketItems.length) % marketItems.length;
      if (menuState.selected < menuState.scrollOffset) menuState.scrollOffset = menuState.selected;
      if (menuState.selected >= menuState.scrollOffset + 8) menuState.scrollOffset = menuState.selected - 7;
      playTickSound();
    }
  }
  else if (key('ArrowDown')) {
    if (afterKeyDelay()) {
      menuState.selected = (menuState.selected + 1) % marketItems.length;
      if (menuState.selected >= menuState.scrollOffset + 8) menuState.scrollOffset = menuState.selected - 7;
      if (menuState.selected < menuState.scrollOffset) menuState.scrollOffset = menuState.selected;
      playTickSound();
    }
  }
  else if (key('ArrowRight')) {
    if (afterKeyDelay()) {
      const item = marketItems[menuState.selected];
      const itemData = MARKET_ITEMS[item];
      const humanPlayer = players.find(p => !p.ai);
      if (!humanPlayer || score < itemData.price) return;
      if (item === 'babyMissile') return;
      if (item === 'parachute') {
        score -= itemData.price;
        let t = humanPlayer.tools.find(x => x.type === 'parachute');
        if (t) t.ammo += itemData.ammo;
        else humanPlayer.tools.push({type: 'parachute', ammo: itemData.ammo});
        playTickSound();
      } else if (item === 'shield') {
        if (humanPlayer.shield) return;
        score -= itemData.price;
        humanPlayer.shield = {type:'shield', energy:SHIELD_TYPES.shield.energy};
        playTickSound();
      } else if (WEAPON_TYPES[item]) {
        score -= itemData.price;
        let existingWeapon = humanPlayer.weapons.find(w => w.type === item);
        if (existingWeapon) {
          existingWeapon.ammo += itemData.ammo;
        } else {
          humanPlayer.weapons.push({type: item, ammo: itemData.ammo});
        }
        playTickSound();
      }
    }
  }
  else if (key('ArrowLeft')) {
    if (afterKeyDelay()) {
      const item = marketItems[menuState.selected];
      const itemData = MARKET_ITEMS[item];
      const humanPlayer = players.find(p => !p.ai);
      if (!humanPlayer) return;
      if (item === 'babyMissile') return;
      if (item === 'parachute') {
        const t = humanPlayer.tools.find(x => x.type === 'parachute');
        if (t && t.ammo > 0) {
          const refund = itemData.price / itemData.ammo;
          score += refund;
          t.ammo--;
          if (t.ammo <= 0) humanPlayer.tools = humanPlayer.tools.filter(x => x.type !== 'parachute');
          playTickSound();
        }
      } else if (item === 'shield') {
        if (humanPlayer.shield) {
          score += itemData.price;
          humanPlayer.shield = null;
          playTickSound();
        }
      } else {
        const weapon = humanPlayer.weapons.find(w => w.type === item);
        if (weapon && weapon.ammo > 0) {
          const refund = itemData.price / itemData.ammo;
          score += refund;
          weapon.ammo--;
          if (weapon.ammo <= 0) {
            humanPlayer.weapons = humanPlayer.weapons.filter(w => w.type !== item);
          }
          playTickSound();
        }
      }
    }
  }
  else if (key(' ')) {
    idle = true;
  }
  else if (key('Enter')) {
    if (afterKeyDelay()) {
      menuState = null;
      state = 'round-start';
    }
  }
  else {
    idle = true;
  }
}

function aiBuy(player) {
  player.score = STARTING_SCORE;
  const marketItems = Object.keys(MARKET_ITEMS).filter(x => x !== 'babyMissile' && !(tracerMode && x === 'tracer') && (WEAPON_TYPES[x] || x === 'parachute' || x === 'shield'));
  let attempts = 0;
  while (player.score > 0 && attempts < 20) {
    const item = sample(marketItems);
    const itemData = MARKET_ITEMS[item];
    if (player.score >= itemData.price) {
      player.score -= itemData.price;
      if (item === 'parachute') {
        let t = player.tools.find(x => x.type === 'parachute');
        if (t) t.ammo += itemData.ammo;
        else player.tools.push({type: 'parachute', ammo: itemData.ammo});
      } else if (item === 'shield') {
        if (!player.shield) player.shield = {type:'shield', energy:SHIELD_TYPES.shield.energy};
      } else {
        let existingWeapon = player.weapons.find(w => w.type === item);
        if (existingWeapon) {
          existingWeapon.ammo += itemData.ammo;
        } else {
          player.weapons.push({type: item, ammo: itemData.ammo});
        }
      }
    }
    attempts++;
  }
}

function initPlayers() {
  const playerCount = selectedPlayers;
  const existingPlayers = players.length === playerCount ? players : [];

  if (existingPlayers.length === playerCount) {
    for (let i=0; i<playerCount; i++) {
      const player = existingPlayers[i];
      player.dead = false;
      player.x = 0;
      player.y = 0;
      player.a = 0;
      player.p = PLAYER_INITIAL_POWER;
      player.currentWeapon = 0;
      player.energy = PLAYER_MAX_ENERGY;
      if (player.shield) player.shield.energy = SHIELD_TYPES[player.shield.type].energy;
      player.parachute = null;
      player.fallHeight = 0;
      player.kills = 0;
      player.deaths = 0;
      player.shotsFired = 0;
      player.lastDamageSource = null;
    }
    players = existingPlayers;
  } else {
    players = [];
    for (let i=0; i<playerCount; i++) {
      const [color, borderColor] = PLAYER_COLORS[i];
      players.push({
        name: `Player ${i+1}`,
        dead: false,
        x:0, y:0, a:0,
        c: color, cb: borderColor,
        p: PLAYER_INITIAL_POWER,
      tools: [],
      weapons: (() => {
        const w = PLAYER_STARTING_WEAPONS.map(x => ({...x}));
        if (tracerMode) w.push({type: 'tracer', ammo: Infinity});
        return w;
      })(),
        currentWeapon: 0,
        energy: PLAYER_MAX_ENERGY,
        shield: null,
        ai: i !== 0 ? sample(Object.keys(AI_TYPES)) : undefined,
        parachute: null,
        fallHeight: 0,
        score: 0,
        kills: 0,
        deaths: 0,
        shotsFired: 0,
        wins: 0,
        lastDamageSource: null,
      });
    }
  }

  players = shuffle(players);

  for (let i=0; i<players.length; i++) {
    const player = players[i];
    player.x = 50 + (W-100) / (players.length - 1) * i;
    player.y = landHeight(terrain, player.x) + 1;
    player.a = player.x > W/2 ? 45 : 180-45;
    clipTerrain(terrain, (ctx) => drawRect(ctx, player.x-4, 0, 8, player.y, ctx.color));
  }
}

function initLevel() {
  generateSky(sky);
  generateTerrain(terrain);
}

function update() {
  idle = false;

  updateParticles();
  updateNapalm(dt);

  if (state === 'start-game') {
    initNewGame();
  }

  else if (state === 'start-menu') {
    updateStartMenu();
  }

  else if (state === 'market') {
    updateMarket();
  }

  else if (state === 'round-start') {
    round++;
    init();
    state = 'start-turn';
  }

  else if (state === 'start-turn') {
    state = 'aim';
  }

  else if (state === 'aim') {
    const player = players[currentPlayer];
    const {x, y, a, p, weapons, energy} = player;
    const maxPower = energy * PLAYER_ENERGY_POWER_MULTIPLIER;
    player.p = clamp(0, player.p, maxPower);
    const isPrecise = key('Alt');
    const isFast = key('Shift');
    const isReverse = key('Shift');
    let shoot;

    if (player.ai) {
      let ai = AI_TYPES[player.ai];
      const plan = ai.decide(player);
      player.a = wrap(0, plan.a, 180);
      player.p = clamp(0, plan.p, maxPower);
      player.currentWeapon = clamp(0, plan.currentWeapon, weapons.length-1);
      shoot = true;
    }

    else if (key('ArrowLeft')) {
      if (isPrecise && !afterKeyDelay()) return;
      let incr = isFast ? PLAYER_ANGLE_FAST_INCREMENT : PLAYER_ANGLE_INCREMENT;
      player.a = wrap(0, a -incr, 180);
      if (isPrecise || isFast || a % PLAYER_ANGLE_TICK_SOUND_INTERVAL === 0) playTickSound();

    } else if (key('ArrowRight')) {
      if (isPrecise && !afterKeyDelay()) return;
      let incr = isFast ? PLAYER_ANGLE_FAST_INCREMENT : PLAYER_ANGLE_INCREMENT;
      player.a = wrap(0, a +incr, 180);
      if (isPrecise || isFast || a % PLAYER_ANGLE_TICK_SOUND_INTERVAL === 0) playTickSound();

    } else if (key('ArrowUp')) {
      if (isPrecise && !afterKeyDelay()) return;
      let incr = isFast ? PLAYER_POWER_FAST_INCREMENT : PLAYER_POWER_INCREMENT;
      player.p = clamp(0, p +incr, maxPower);
      if (p < maxPower && (isPrecise || isFast || p % PLAYER_POWER_TICK_SOUND_INTERVAL === 0)) playTickSound();

    } else if (key('ArrowDown')) {
      if (isPrecise && !afterKeyDelay()) return;
      let incr = isFast ? PLAYER_POWER_FAST_INCREMENT : PLAYER_POWER_INCREMENT;
      player.p = clamp(0, p -incr, maxPower);
      if (p > 0 && (isPrecise || isFast || p % PLAYER_POWER_TICK_SOUND_INTERVAL === 0)) playTickSound();

    } else if (key('Tab')) {
      if (!afterKeyDelay()) return;
      const dir = isReverse ? -1 : 1;
      player.currentWeapon = wrap(0, player.currentWeapon+dir, player.weapons.length-1);
      playTickSound();

    } else if (key(' ')) {
      if (!afterKeyDelay()) return;
      shoot = {a, p};

    } else {
      idle = true;
    }

    if (shoot) {
      const {a, p, weapons, currentWeapon} = player;
      const [px, py] = vec(x, y-3, a+180, 5);

      const weapon = weapons[currentWeapon];
      const {projectile} = WEAPON_TYPES[weapon.type];
      const projectileType = PROJECTILE_TYPES[projectile.type];
      weapon.ammo -= 1;
      player.shotsFired++;

      projectileType.create(projectile, player, weapon, px, py, a, p, wind)
        .forEach(x => projectiles.push(x));

      state = 'shoot';
    }
  }

  else if (state === 'shoot') {
    for (let i=projectiles.length-1; i>=0; i--) {
      const projectile = projectiles[i];
      const projectileType = PROJECTILE_TYPES[projectile.type];
      if (projectileType.update(projectile, terrain, projectiles, trajectories, explosions, dt)) continue;
      projectileType.stop(projectile);
      projectiles.splice(i, 1);
    }
    if (projectiles.length === 0) {
      state = 'explosions';
    }
  }

  else if (state === 'explosions') {
    for (let i=explosions.length-1; i>=0; i--) {
      const explosion = explosions[i];
      const explosionType = EXPLOSION_TYPES[explosion.type];
      screenShake = (
        clamp(0, explosion.r, MAX_EXPLOSION_SHAKE_FACTOR) /
        EXPLOSION_SHAKE_REDUCTION_FACTOR
      );

      if (explosionType.update(explosion, dt)) continue;
      screenShake = 0;
      explosionType.clip(explosion, terrain);
      explosionType.stop(explosion);

      for (let player of players) if (!player.dead) {
        let damage = explosionType.damage(explosion, player);
        let remainingDamage = damage;
        if (!damage) continue;

        if (explosion.source) player.lastDamageSource = explosion.source;

        if (player.shield) {
          remainingDamage = clamp(0, damage-player.shield.energy, Infinity);
          player.shield.energy = clamp(0, player.shield.energy-damage, Infinity);
        }

        player.energy -= remainingDamage;
      }
      explosions.splice(i, 1);
    }
    if (explosions.length === 0 && !napalmEmitter && fireCells.length === 0 && napalmParticles.length === 0) {
      state = 'land-collapse';
    }
  }

  else if (state === 'land-collapse') {
    if (!collapseState) collapseState = startCollapseTerrain(terrain);
    if (collapseTerrainStep(terrain, collapseState)) {
      collapseState = null;
      state = 'land-players';
    }
  }

  else if (state === 'land-players') {
    let stable = true;
    for (let player of players) {
      if (player.dead) continue;
      const y = closestLand(terrain, player.x, player.y);
      if (player.y !== y) {
        stable = false;
        player.y++;
        if (player.fallHeight++ >= PLAYER_FALL_DAMAGE_HEIGHT) {
          if (player.energy > 0 && player.parachute) continue;
          const parachute = player.tools.find(x => x.type === 'parachute');
          if (player.energy > 0 && parachute && parachute.ammo > 0) {
            player.parachute = parachute;
            parachute.ammo--;
            continue;
          }
          player.energy -= PLAYER_FALL_DAMAGE_FACTOR;
        }
      } else {
        player.parachute = null;
      }
    }
    if (stable) state = 'destroy-players';
  }

  else if (state === 'destroy-players') {
    const dyingPlayer = players.find(x => x.energy<=0 && !x.dead);
    if (!dyingPlayer) {state = 'end-turn'; return}

    const {x, y, c} = dyingPlayer;
    const explosionSpec = sample(DEATH_SPECS);
    const explosionType = EXPLOSION_TYPES[explosionSpec.type];
    explosions.push(explosionType.create(explosionSpec, x, y));
    createParticles(x, y, PLAYER_EXPLOSION_PARTICLE_POWER, c);
    dyingPlayer.dead = true;
    dyingPlayer.deaths++;
    if (dyingPlayer.lastDamageSource && dyingPlayer.lastDamageSource !== dyingPlayer) {
      dyingPlayer.lastDamageSource.kills++;
    }
    state = 'explosions';
  }

  else if (state === 'end-turn') {
    const alivePlayers = players.filter(x => !x.dead);

    if (alivePlayers.length === 0) {
      return state = 'round-end';
    } else if (alivePlayers.length === 1) {
      winner = alivePlayers[0];
      winner.wins++;
      return state = 'round-end';
    }

    for (let player of players) {
      player.weapons = player.weapons.filter(x => x.ammo > 0);
      player.tools = player.tools.filter(x => x.ammo > 0);
      player.currentWeapon = wrap(0, player.currentWeapon, player.weapons.length-1);
      if (player.shield && player.shield.energy <= 0) player.shield = null;
      player.fallHeight = 0;
    }

    for (let p=0; p<players.length; p++) {
      const i = wrap(0, currentPlayer+p+1, players.length-1);
      if (!players[i].dead) {currentPlayer = i; break}
    }

    fadeTrajectories();
    state = 'start-turn';
  }

  else if (state === 'round-end') {
    if (!menuState) {
      menuState = {scoreAwarded: false};
      for (let player of players) {
        player.score += player.kills * SCORE_PER_KILL;
      }
      if (winner) {
        winner.score += SCORE_FOR_WIN;
      }
      const humanPlayer = players.find(p => !p.ai);
      if (humanPlayer) {
        score += humanPlayer.kills * SCORE_PER_KILL;
        if (winner === humanPlayer) score += SCORE_FOR_WIN;
      }
      menuState.scoreAwarded = true;
    }
    if (key('Enter')) {
      if (afterKeyDelay()) {
        menuState = null;
        if (round < totalRounds) {
          state = 'market';
        } else {
          state = 'game-over';
        }
      }
    }
    idle = true;
  }

  else if (state === 'game-over') {
    if (key('Enter')) {
      if (afterKeyDelay()) {
        state = 'start-game';
      }
    }
    idle = true;
  }

  else {
    throw new Error(`Invalid state, ${state}`);
  }
}

export function createParticles(x, y, p, c) {
  for (let i = 0; i < PARTICLE_AMOUNT; i++) {
    particles.push({
      t: 0,
      ox: x, x: x,
      oy: y, y: y,
      a: randomInt(0, 359),
      p: p * random(PARTICLE_MIN_POWER_FACTOR, PARTICLE_MAX_POWER_FACTOR),
      // @ts-ignore: canvas color hack
      c, alpha: 255,
    });
  }
}

function updateParticles() {
  for (let i=particles.length-1; i>=0; i--) {
    const particle = particles[i];

    if (
      particle.y > H ||
      particle.alpha <= 0 ||
      particle.t > PARTICLE_MIN_LIFETIME && isTerrain(terrain, particle.x, particle.y)
    ) {
      particles.splice(i, 1);
      continue;
    }

    const {ox, oy, t, a, p} = particle;

    const [tx, ty] = parable(
      t / PARTICLE_TIME_FACTOR,
      ox, oy, deg2rad(180+a),
      p / PARTICLE_POWER_REDUCTION_FACTOR,
      wind / PARTICLE_WIND_REDUCTION_FACTOR,
    );

    particle.t++;
    particle.x = tx;
    particle.y = ty;
    particle.alpha -= PARTICLE_FADE_AMOUNT;
  }
}

export function spawnNapalm(x, y, totalParticles, source) {
  napalmEmitter = {x, y: y - 1, total: totalParticles, emitted: 0, totalEmitted: 0, source};
}

function tryEmitParticle(x, y, source) {
  const p = {x, y, dir: 0, hasDir: false, alive: true, source};

  const below = isTerrain(terrain, p.x, p.y + 1);
  if (!below) return p;

  const fire = hasFireAt(p.x, p.y);
  if (!fire) return p;

  const canFlowDL = !isTerrain(terrain, p.x - 1, p.y + 1);
  const canFlowDR = !isTerrain(terrain, p.x + 1, p.y + 1);
  const canSpillL = !isTerrain(terrain, p.x - 1, p.y);
  const canSpillR = !isTerrain(terrain, p.x + 1, p.y);

  if (canFlowDL || canFlowDR || canSpillL || canSpillR) return p;

  const blocking = napalmParticles.find(np => np.alive && np.x === p.x && np.y === p.y);
  if (blocking) {
    for (let y = p.y; y >= 0; y--) {
      const np = napalmParticles.find(n => n.alive && n.x === p.x && n.y === y);
      if (np) np.y--;
      else break;
    }
    return p;
  }

  return null;
}

function updateNapalm(dt) {
  if (napalmEmitter) {
    napalmEmitter.emitted += dt * NAPALM_SPAWN_RATE;
    while (napalmEmitter.emitted >= 1 && napalmEmitter.totalEmitted < napalmEmitter.total) {
      napalmEmitter.emitted--;
      napalmEmitter.totalEmitted++;
      const p = tryEmitParticle(napalmEmitter.x, napalmEmitter.y, napalmEmitter.source);
      if (p) napalmParticles.push(p);
    }
    if (napalmEmitter.totalEmitted >= napalmEmitter.total) napalmEmitter = null;
  }

  for (let p of napalmParticles) updateParticle(p);
  napalmParticles = napalmParticles.filter(p => p.alive);

  for (let f of fireCells) f.timeLeft -= dt;
  fireCells = fireCells.filter(f => f.timeLeft > 0);

  for (let f of fireCells) {
    if (Math.random() < dt * 6) smokeParticles.push({
      x: f.x + (Math.random() > 0.5 ? 1 : -1) * Math.random(),
      y: f.y,
      vx: (Math.random() - 0.5) * 5,
      vy: -(8 + Math.random() * 12),
      alpha: 0.3 + Math.random() * 0.15,
      lifetime: 1 + Math.random() * 0.8,
    });
  }

  for (let s of smokeParticles) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.alpha -= dt / s.lifetime;
    s.vy *= 0.98;
  }
  smokeParticles = smokeParticles.filter(s => s.alpha > 0);

  applyFireDamage(dt);
}

function hasFireAt(x, y) {
  return fireCells.some(f => f.x === x && f.y === y);
}

function createFire(x, y, source) {
  if (!hasFireAt(x, y)) fireCells.push({x, y, timeLeft: FIRE_DURATION, source});
}

function hasNapalmAt(x, y, exclude) {
  return napalmParticles.some(np => np.alive && np !== exclude && np.x === x && np.y === y);
}

function pushNapalmColumn(x, startY) {
  for (let y = startY; y >= 0; y--) {
    const np = napalmParticles.find(n => n.alive && n.x === x && n.y === y);
    if (np) np.y--;
    else break;
  }
}

function tryFlow(p, dir) {
  const nx = p.x + dir;
  const ny = p.y + 1;
  if (!isTerrain(terrain, nx, ny)) {
    if (hasNapalmAt(nx, ny, p)) pushNapalmColumn(nx, ny);
    p.x = nx;
    p.y = ny;
    if (!p.hasDir) { p.dir = dir; p.hasDir = true; }
    return true;
  }
  return false;
}

function trySpill(p, dir) {
  const nx = p.x + dir;
  if (!isTerrain(terrain, nx, p.y)) {
    if (hasNapalmAt(nx, p.y, p)) pushNapalmColumn(nx, p.y);
    p.x = nx;
    if (!p.hasDir) { p.dir = dir; p.hasDir = true; }
    return true;
  }
  return false;
}

function updateParticle(p) {
  const below = isTerrain(terrain, p.x, p.y + 1) || isTank(p.x, p.y + 1);
  const napalmBelow = hasNapalmAt(p.x, p.y + 1, p);

  if (!below && !napalmBelow) {
    if (p.y < H - 1) { p.y++; return; }
    p.alive = false;
    return;
  }

  if (!below && napalmBelow) {
    // standing on another napalm particle - behave as if on fire terrain
  }

  if (below && !hasFireAt(p.x, p.y) && !napalmBelow) {
    createFire(p.x, p.y, p.source);
    p.alive = false;
    return;
  }

  if (!p.hasDir) {
    const flowDirs = [];
    if (!isTerrain(terrain, p.x - 1, p.y + 1)) flowDirs.push(-1);
    if (!isTerrain(terrain, p.x + 1, p.y + 1)) flowDirs.push(1);
    if (flowDirs.length > 0) {
      const dir = sample(flowDirs);
      if (hasNapalmAt(p.x + dir, p.y + 1, p)) pushNapalmColumn(p.x + dir, p.y + 1);
      p.x += dir;
      p.y += 1;
      p.dir = dir;
      p.hasDir = true;
      return;
    }

    const spillDirs = [];
    if (!isTerrain(terrain, p.x - 1, p.y)) spillDirs.push(-1);
    if (!isTerrain(terrain, p.x + 1, p.y)) spillDirs.push(1);
    if (spillDirs.length > 0) {
      const dir = sample(spillDirs);
      if (hasNapalmAt(p.x + dir, p.y, p)) pushNapalmColumn(p.x + dir, p.y);
      p.x += dir;
      p.dir = dir;
      p.hasDir = true;
      return;
    }
    pushNapalmColumn(p.x, p.y);
    p.alive = false;
    return;
  }

  if (tryFlow(p, p.dir) || trySpill(p, p.dir)) return;
  p.alive = false;
}

function applyFireDamage(dt) {
  for (let player of players) {
    if (player.dead) continue;
    for (let fire of fireCells) {
      if (distance(fire.x, fire.y, player.x, player.y + PLAYER_TANK_Y_FOOTPRINT) <= PLAYER_TANK_BOUNDING_RADIUS + 1) {
        player.energy -= FIRE_DAMAGE * dt;
        player.lastDamageSource = fire.source;
      }
    }
  }
}

function drawNapalm() {
  for (let s of smokeParticles) {
    foreground.globalAlpha = s.alpha * 0.4;
    drawRect(foreground, s.x, s.y - 1, 2, 2, '#666');
    foreground.globalAlpha = 1;
  }

  for (let f of fireCells) {
    const t = f.timeLeft / FIRE_DURATION;
    const height = Math.max(1, Math.floor(10 * t * (0.6 + Math.random() * 0.4)));
    for (let i = 0; i < height; i++) {
      const alpha = 1 - i / height * 0.4;
      foreground.globalAlpha = alpha;
      const g = Math.floor(30 + 225 * (1 - i / height));
      const b = Math.floor(Math.max(0, 40 - i * 8));
      const sway = i > 2 ? (Math.random() > 0.5 ? 1 : -1) : 0;
      drawRect(foreground, f.x + sway, f.y - i, 1, 1, `rgb(255,${g},${b})`);
    }
    if (height > 8 && Math.random() > 0.5) {
      foreground.globalAlpha = 0.6 + Math.random() * 0.4;
      drawRect(foreground, f.x + (Math.random() > 0.5 ? 2 : -2), f.y - height + 1, 1, 1, '#fff');
    }
  }
  foreground.globalAlpha = 1;
  for (let p of napalmParticles) {
    drawRect(foreground, p.x, p.y, 1, 1, '#ff8800');
  }
}

export function isTank(x, y) {
  for (let player of players) {
    if (player.dead) continue;

    if (
      distance(x, y, player.x, player.y+PLAYER_TANK_Y_FOOTPRINT) <=
      PLAYER_TANK_BOUNDING_RADIUS
    ) {
      return true;
    }
  }
}

export function isTankShield(x, y) {
  for (let player of players) {
    if (player.dead) continue;
    if (!player.shield) continue;
    const shieldType = SHIELD_TYPES[player.shield.type];
    const playerDistance = distance(x, y, player.x, player.y+PLAYER_TANK_Y_FOOTPRINT);

    if (playerDistance - shieldType.r <= 1) {
      return {player, shieldType};
    }
  }
}

function draw() {
  if (idle && particles.length===0 && fireCells.length===0 && smokeParticles.length===0 && napalmParticles.length===0 && state !== 'start-menu' && state !== 'market' && state !== 'round-end' && state !== 'game-over') return;

  foreground.clearRect(0, 0, W, H);
  drawTrajectories();
  drawPlayers();
  drawProjectile();
  drawExplosions();
  drawNapalm();
  drawParticles();
  drawStatus();

  for (let c of [sky, traces, terrain, foreground]) {
    framebuffer.drawImage(c.canvas, 0, 0);
  }

  if (state === 'start-menu') {
    drawStartMenuPanel();
  } else if (state === 'market') {
    drawMarketPanel();
  } else if (state === 'round-end') {
    drawRoundEndPanel();
  } else if (state === 'game-over') {
    drawGameOverPanel();
  }

  drawScreenShake();
}

function drawPlayers() {
  for (let player of players) {
    const {x, y, a, c, cb, energy, shield, dead} = player;
    if (dead) continue;

    // Shield
    if (shield) {
      const {type, energy} = shield;
      const shieldType = SHIELD_TYPES[type];
      foreground.globalAlpha = energy / shieldType.energy;
      for (let i=0; i<shieldType.s; i++) {
        strokeCircle(foreground, x, y+PLAYER_TANK_Y_FOOTPRINT, shieldType.r+i, shieldType.color);
      }
      foreground.globalAlpha = 1;
    }

    // Parachute
    if (player.parachute) {
      drawSemiCircle(foreground, x, y-15, 10, 'white');
      drawLine(foreground, x-10, y-15, x-2, y, 'white');
      drawLine(foreground, x-5,  y-15, x-1, y, 'white');
      drawLine(foreground, x,    y-15, x,   y, 'white');
      drawLine(foreground, x+5,  y-15, x+1, y, 'white');
      drawLine(foreground, x+10, y-15, x+2, y, 'white');
    }

    // Cannon
    const [px, py] = vec(x, y-3, a+180, 3);
    drawLine(foreground, x-1, y-3, px-1, py, cb);
    drawLine(foreground, x+1, y-3, px+1, py, cb);
    drawLine(foreground, x, y-4, px, py-1, cb);

    // Tank
    drawRect(foreground, x-4, y-3, 8, 1, cb);
    drawRect(foreground, x-5, y-2, 10, 2, cb);
    drawRect(foreground, x-4, y-0, 8, 1, cb);
    drawRect(foreground, x-3, y+1, 6, 1, cb);
    drawLine(foreground, x, y-3, px, py, c);
    drawRect(foreground, x-4, y-2, 8, 2, c);
    drawRect(foreground, x-3, y-0, 6, 1, c);

    // Damage
    const damage = clamp(0, 1 - energy/PLAYER_MAX_ENERGY, 1);
    foreground.globalAlpha = damage * 0.7;
    drawRect(foreground, x-4, y-2, 8, 2, cb);
    foreground.globalAlpha = damage;
    drawRect(foreground, x-3, y-0, 6, 1, cb);
    foreground.globalAlpha = 1;
  }
}

function drawTrajectories() {
  traces.clearRect(0, 0, W, H);
  for (let i=trajectories.length-1; i>=0; i--) {
    const trajectory = trajectories[i];
    const {x, y, c} = trajectory;
    traces.globalAlpha = trajectory.a / 255;
    plot(traces, x, y, c);
  }
  traces.globalAlpha = 1;
}

function fadeTrajectories() {
  for (let i=trajectories.length-1; i>=0; i--) {
    const trajectory = trajectories[i];
    trajectory.a -= TRAJECTORY_FADE_SPEED;
    trajectory.y -= TRAJECTORY_FLOAT_SPEED;
    if (trajectory.a <= 0 || trajectory.y <= 0) {
      trajectories.splice(i, 1);
    }
  }
}

function drawProjectile() {
  if (!projectiles.length) return;
  for (let projectile of projectiles) {
    const color = projectile.player ? projectile.player.c : 'white';
    if (!tracerMode && projectile.weapon?.type !== 'tracer') {
      for (let i=0; i < (projectile.trail?.length || 0); i++) {
        const t = projectile.trail[i];
        const alpha = (i + 1) / (projectile.trail.length + 1);
        foreground.globalAlpha = alpha * 0.5;
        plot(foreground, clamp(0, Math.round(t.x), W-1), clamp(0, Math.round(t.y), H-1), color);
      }
    }
    foreground.globalAlpha = 1;
    plot(foreground, clamp(0, Math.round(projectile.x), W-1), clamp(0, Math.round(projectile.y), H-1), 'white');
  }
}

function drawExplosions() {
  if (!explosions.length) return;
  for (let explosion of explosions) {
    const explosionType = EXPLOSION_TYPES[explosion.type];
    explosionType.draw(explosion, foreground, terrain);
  }
}

function drawParticles() {
  for (let particle of particles) {
    foreground.globalAlpha = clamp(0, particle.alpha / 255, 255);
    plot(foreground, particle.x, particle.y, particle.c);
  }
  foreground.globalAlpha = 1;
}

function drawStartMenuPanel() {
  drawPanelBg(framebuffer);
  drawPanelTitle(framebuffer, 'RAVAGED PLANET');

  const playerCounts = [2, 3, 4, 5, 6];
  const roundCounts = [1, 3, 5, 10];
  const terrains = ['Random', 'Mountain', 'Sand'];
  const tracerOptions = ['On', 'Off'];

  const y = 100;
  const labels = ['Players', 'Rounds', 'Terrain', 'Tracer'];
  const values = [
    playerCounts[menuState.values[0]],
    roundCounts[menuState.values[1]],
    terrains[menuState.values[2]],
    tracerOptions[menuState.values[3]],
  ];

  for (let i=0; i<labels.length; i++) {
    const isSelected = menuState.selected === i;
    const prefix = isSelected ? '> ' : '  ';
    const color = isSelected ? 'yellow' : 'white';
    drawPanelText(framebuffer, `${prefix}${labels[i]}: ${values[i]}`, 160, y + i * 30, color);
  }

  drawPanelDivider(framebuffer, 230);
  drawPanelText(framebuffer, 'Press ENTER to start', 160, 250, 'white');
}

function drawMarketPanel() {
  drawPanelBg(framebuffer);
  drawPanelTitle(framebuffer, 'MARKET');

  const humanPlayer = players.find(p => !p.ai);
  drawPanelText(framebuffer, `Score: ${score}`, 160, 100, 'yellow');

  const marketItems = Object.keys(MARKET_ITEMS).filter(item => !(tracerMode && item === 'tracer'));
  const y = 120;
  const maxVisible = 8;

  for (let i=0; i<Math.min(maxVisible, marketItems.length); i++) {
    const itemIndex = i + (menuState ? menuState.scrollOffset : 0);
    if (itemIndex >= marketItems.length) break;

    const item = marketItems[itemIndex];
    const itemData = MARKET_ITEMS[item];
    const isSelected = menuState && menuState.selected === itemIndex;
    const prefix = isSelected ? '> ' : '  ';
    const color = isSelected ? 'yellow' : 'white';

    let ammoText = '';
    if (humanPlayer) {
      if (item === 'parachute') {
        const t = humanPlayer.tools.find(x => x.type === 'parachute');
        ammoText = t ? `(x${t.ammo})` : '(none)';
      } else if (item === 'shield') {
        ammoText = humanPlayer.shield ? '(owned)' : '(none)';
      } else {
        const weapon = humanPlayer.weapons.find(w => w.type === item);
        if (weapon) {
          ammoText = weapon.type === 'babyMissile' ? '(owned)' : `(x${weapon.ammo})`;
        } else {
          ammoText = '(none)';
        }
      }
    }

    const priceText = itemData.price === 0 ? 'FREE' : `$${itemData.price}`;
    drawPanelText(framebuffer, `${prefix}${item}: ${priceText} ${ammoText}`, 140, y + i * 20, color);
  }

  drawPanelDivider(framebuffer, 280);
  drawPanelText(framebuffer, 'RIGHT: Buy   LEFT: Sell   ENTER: Start Round', 160, 290, 'white');
}

function drawRoundEndPanel() {
  drawPanelBg(framebuffer);

  if (winner) {
    drawPanelTitle(framebuffer, `Round ${round} Complete!`);
    drawPanelText(framebuffer, `Winner: ${winner.name}`, 160, 100, winner.c);
    drawPanelText(framebuffer, `Kills: ${winner.kills}`, 160, 130, 'white');
    drawPanelText(framebuffer, `Round Score: ${winner.kills * SCORE_PER_KILL + SCORE_FOR_WIN}`, 160, 160, 'white');
  } else {
    drawPanelTitle(framebuffer, `Round ${round} Complete!`);
    drawPanelText(framebuffer, 'Nobody survived!', 160, 100, 'white');
  }

  drawPanelText(framebuffer, `Total Score: ${score}`, 160, 200, 'yellow');

  drawPanelDivider(framebuffer, 240);
  if (round < totalRounds) {
    drawPanelText(framebuffer, 'Press ENTER for next round', 160, 260, 'white');
  } else {
    drawPanelText(framebuffer, 'Press ENTER for final results', 160, 260, 'white');
  }
}

function drawGameOverPanel() {
  drawPanelBg(framebuffer);
  drawPanelTitle(framebuffer, 'GAME OVER');

  const y = 100;
  const sortedPlayers = [...players].sort((a, b) => b.wins - a.wins || b.kills - a.kills);

  for (let i=0; i<sortedPlayers.length; i++) {
    const p = sortedPlayers[i];
    const text = `${p.name}: W:${p.wins} K:${p.kills} D:${p.deaths} S:${p.shotsFired}`;
    const color = i === 0 ? 'yellow' : 'white';
    drawPanelText(framebuffer, text, 160, y + i * 16, color);
  }

  drawPanelDivider(framebuffer, 280);
  drawPanelText(framebuffer, 'Press ENTER to play again', 160, 290, 'white');
}

function drawScreenShake() {
  const x = randomInt(-screenShake, screenShake);
  const y = randomInt(-screenShake, screenShake);
  framebuffer.canvas.style.transform = `translate(${x}px, ${y}px)`;
}

function drawStatus() {
  if (state === 'start-menu' || state === 'market' || state === 'round-end' || state === 'game-over') {
    return;
  }

  const player = players[currentPlayer];
  const {currentWeapon} = player;
  const weapon = player.weapons[currentWeapon];
  const weaponType = WEAPON_TYPES[weapon.type];
  drawText(foreground, `${player.name}   NRG:${player.energy}   AIM:${player.a}   PWR:${player.p}   SHD:${player.shield?player.shield.energy:0}   ${clamp(0, weapon.ammo, 99)} ${weaponType.name}`, 8, 8, player.c, 'left');
  drawText(foreground, `WIND: ${wind<=0?'<':''}${Math.abs(wind)}${wind>=0?'>':''}`, W-8, 8, 'white', 'right');
  drawText(foreground, `Round: ${round}/${totalRounds}   Score: ${score}`, W-8, 18, 'white', 'right');
}

loop((deltaTime) => {
  dt = deltaTime;
  update();
  draw();
});
