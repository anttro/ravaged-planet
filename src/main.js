import {AI_TYPES} from './ai.js?v=26';
import {DEATH_SPECS, EXPLOSION_SHAKE_REDUCTION_FACTOR, H, MAX_EXPLOSION_SHAKE_FACTOR, MAX_WIND, NETWORK_DISCONNECT_TIMEOUT, PARTICLE_AMOUNT, PARTICLE_FADE_AMOUNT, PARTICLE_MAX_POWER_FACTOR, PARTICLE_MIN_LIFETIME, PARTICLE_MIN_POWER_FACTOR, PARTICLE_POWER_REDUCTION_FACTOR, PARTICLE_TIME_FACTOR, PARTICLE_WIND_REDUCTION_FACTOR, PLAYER_ANGLE_FAST_INCREMENT, PLAYER_ANGLE_INCREMENT, PLAYER_ANGLE_TICK_SOUND_INTERVAL, PLAYER_COLORS, PLAYER_ENERGY_POWER_MULTIPLIER, PLAYER_EXPLOSION_PARTICLE_POWER, PLAYER_FALL_DAMAGE_FACTOR, PLAYER_FALL_DAMAGE_HEIGHT, PLAYER_INITIAL_POWER, PLAYER_MAX_ENERGY, PLAYER_POWER_FAST_INCREMENT, PLAYER_POWER_INCREMENT, PLAYER_POWER_TICK_SOUND_INTERVAL, PLAYER_STARTING_TOOLS, PLAYER_STARTING_WEAPONS, PLAYER_TANK_BOUNDING_RADIUS, PLAYER_TANK_Y_FOOTPRINT, PROJECTILE_POWER_REDUCTION_FACTOR, PROJECTILE_WIND_REDUCTION_FACTOR, SHIELD_TYPES, TRAJECTORY_FADE_SPEED, TRAJECTORY_FLOAT_SPEED, W, WEAPON_TYPES, Z, STARTING_SCORE, SCORE_PER_KILL, SCORE_FOR_WIN, MARKET_ITEMS, NAPALM_SPAWN_RATE, FIRE_DURATION, FIRE_DAMAGE, MAX_PLAYERS} from './constants.js?v=26';
import {createCanvas, drawLine, drawRect, drawSemiCircle, drawText, loop, plot, strokeCircle} from './gfx.js?v=26';
import {afterKeyDelay, key, initClickCanvas, popClick, getPointer, clearKeys} from './input.js?v=26';
import {clamp, deg2rad, distance, parable, random, randomInt, vec, wrap} from './math.js?v=26';
import {PROJECTILE_TYPES} from './projectiles.js?v=26';
import {generateSky} from './sky.js?v=26';
import {playTickSound} from './sound.js?v=26';
import {clipTerrain, closestLand, collapseTerrain, generateTerrain, isTerrain, landHeight, startCollapseTerrain, collapseTerrainStep} from './terrain.js?v=26';
import {sample, shuffle, newPlayerId} from './utils.js?v=26';
import {EXPLOSION_TYPES} from './weapons.js?v=26';
import {drawPanelBg, drawPanelTitle, drawPanelTitleFancy, drawPanelText, drawPanelDivider, drawPanelMenu, getPanelBounds, drawButton, checkHit, PANEL_X, PANEL_WIDTH} from './panel.js?v=26';
import {MSG, CMD, HOST_MSG} from './net/protocol.js?v=26';
import {netBroadcast, netConnect, netDisconnect, netIsConnected, netIsHost, netListRooms, netMakeRoomCode, netMyId, netOnMessage, netOnStatus, netRoom, netSendCommand} from './net.js?v=26';


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
let deathOrderCounter = 0;
let napalmParticles = [];
let fireCells = [];
let smokeParticles = [];
let napalmEmitter = null;
let netSnapPrev = null;
let netSnapPrevAt = 0;
let netSnapCur = null;
let netSnapCurAt = 0;
const reservedPositions = new Set();
let winner;

let score = 0;
let round = 0;
let totalRounds = 1;
let selectedPlayers = 5;
let selectedTerrain = null;
let menuState = null;
let tracerMode = true;
export {tracerMode};

let networkMode = false;
let netPlayerId = null;
let netLobby = null;
let netMenuState = null;
let netError = null;
let lastBroadcastAt = 0;
let lastTerrainAt = 0;
let terrainDirty = false;

export function netDebug() {
  const proj0 = projectiles[0];
  const exp0 = explosions[0];
  const cur = players[currentPlayer];
  return {state, networkMode, netPlayerId, netRoom: netRoom(), netStatus: netIsConnected() ? 'connected' : 'offline', netError, menu: menuState, netMenu: netMenuState, lobby: netLobby,
    turn: cur ? cur.id : null,
    proj: proj0 ? {type: proj0.type, x: proj0.x, y: proj0.y, t: proj0.t} : null,
    exp: exp0 ? {type: exp0.type, x: exp0.x, y: exp0.y, cr: exp0.cr} : null};
}

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
initClickCanvas(framebuffer.canvas);

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
  selectedPlayers = 5;
  selectedTerrain = null;
  napalmParticles = [];
  fireCells = [];
  smokeParticles = [];
  napalmEmitter = null;
  initLevel();
  players = [];
  for (let i = 0; i < 5; i++) {
    const [color, borderColor] = PLAYER_COLORS[i];
    players.push({
      name: `Player ${i+1}`, dead: false,
      id: newPlayerId(),
      x: 0, y: 0, a: 0,
      c: color, cb: borderColor,
      p: PLAYER_INITIAL_POWER,
      tools: [],
      weapons: PLAYER_STARTING_WEAPONS.map(x => ({...x})),
      currentWeapon: 0,
      energy: PLAYER_MAX_ENERGY,
      shield: null,
      ai: i !== 0 ? sample(Object.keys(AI_TYPES)) : undefined,
      parachute: null,
      fallHeight: 0,
      score: 0, totalEarned: 0,
      kills: 0, deaths: 0, deathOrder: -1,
      shotsFired: 0, wins: 0,
      lastDamageSource: null,
    });
  }
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    player.x = 50 + (W-100) / (players.length - 1) * i;
    player.y = landHeight(terrain, player.x) + 1;
    player.a = player.x > W/2 ? 45 : 180-45;
  }
  menuState = {
    selected: 0,
    values: [1, 0, 0, 0, 0],
  };
  state = 'start-menu';
}

function commitStartMenu() {
  const playerCounts = [3, 4, 5, 6, 7, 8, 9, 10];
  const roundCounts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const terrains = ['Random', 'Mountain', 'Sand'];
  selectedPlayers = playerCounts[menuState.values[0]];
  totalRounds = roundCounts[menuState.values[1]];
  selectedTerrain = menuState.values[2] === 0 ? null : terrains[menuState.values[2]].toLowerCase();
  tracerMode = menuState.values[3] === 0;
  const multiplayer = menuState.values[4] === 1;
  menuState = null;
  netError = null;
  if (multiplayer) {
    clearKeys();
    netMenuState = {phase: 'setup', selected: 0};
    state = 'net-menu';
    return;
  }
  score = STARTING_SCORE;
  initAllPlayerStats();
  state = 'market';
}

function updateStartMenu() {
  const options = ['Players', 'Rounds', 'Terrain', 'Permanent tracer mode', 'Mode'];
  const optionValues = [[3,4,5,6,7,8,9,10], [1,2,3,4,5,6,7,8,9,10], ['Random','Mountain','Sand'], ['On','Off'], ['Single','Multi']];

  if (!menuState) {
    menuState = {
      selected: 0,
      values: [optionValues[0].indexOf(selectedPlayers), optionValues[1].indexOf(totalRounds), selectedTerrain === null ? 0 : selectedTerrain === 'mountain' ? 1 : selectedTerrain === 'sand' ? 2 : 0, tracerMode ? 0 : 1, 0],
    };
  }

  const cycleValue = (opt, dir) => {
    const vals = optionValues[opt];
    menuState.values[opt] = (menuState.values[opt] + dir + vals.length) % vals.length;
  };

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
      cycleValue(menuState.selected, -1);
      playTickSound();
    }
  }
  else if (key('ArrowRight')) {
    if (afterKeyDelay()) {
      cycleValue(menuState.selected, 1);
      playTickSound();
    }
  }
  else if (key('Enter')) {
    if (afterKeyDelay()) {
      commitStartMenu();
    }
  }

  const click = popClick();
  if (click) {
    for (let i = 0; i < 5; i++) {
      const rowY = 120 + i * 30;
      if (checkHit(click.x, click.y, PANEL_X+20, rowY, 168, 20)) {
        menuState.selected = i;
        playTickSound();
      }
      if (checkHit(click.x, click.y, PANEL_X+262, rowY, 24, 18)) {
        menuState.selected = i;
        cycleValue(i, -1);
        playTickSound();
      }
      if (checkHit(click.x, click.y, PANEL_X+355, rowY, 24, 18)) {
        menuState.selected = i;
        cycleValue(i, 1);
        playTickSound();
      }
    }
    if (checkHit(click.x, click.y, PANEL_X+100, 318, 200, 22)) {
      commitStartMenu();
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
      id: newPlayerId(),
      x:0, y:0, a:0,
      c: color, cb: borderColor,
      p: PLAYER_INITIAL_POWER,
      tools: [],
      weapons: (() => {
        const w = PLAYER_STARTING_WEAPONS.map(x => ({...x}));
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

function buyItem(player, item, wallet) {
  const itemData = MARKET_ITEMS[item];
  if (!player || item === 'babyMissile') return;
  const balance = wallet ? wallet.amount : player.score;
  if (balance < itemData.price) return;
  if (wallet) wallet.amount = balance - itemData.price;
  else player.score = balance - itemData.price;
  if (item === 'parachute') {
    let t = player.tools.find(x => x.type === 'parachute');
    if (t) t.ammo += itemData.ammo;
    else player.tools.push({type: 'parachute', ammo: itemData.ammo});
    playTickSound();
  } else if (SHIELD_TYPES[item]) {
    if (player.shield && player.shield.type === item) {
      player.shield.ammo++;
    } else {
      player.shield = {type:item, energy:SHIELD_TYPES[item].energy, ammo:1};
    }
    playTickSound();
  } else if (WEAPON_TYPES[item]) {
    let existingWeapon = player.weapons.find(w => w.type === item);
    if (existingWeapon) {
      existingWeapon.ammo += itemData.ammo;
    } else {
      player.weapons.push({type: item, ammo: itemData.ammo});
    }
    playTickSound();
  }
}

function buySelectedItem(item) {
  const humanPlayer = players.find(p => !p.ai);
  if (!humanPlayer) return;
  const wallet = {amount: score};
  buyItem(humanPlayer, item, wallet);
  score = wallet.amount;
}

function sellItem(player, item, wallet) {
  const itemData = MARKET_ITEMS[item];
  if (!player || item === 'babyMissile') return;
  if (item === 'parachute') {
    const t = player.tools.find(x => x.type === 'parachute');
    if (t && t.ammo > 0) {
      const soldUnits = itemData.ammo - t.ammo;
      const totalRefund = Math.floor((soldUnits + 1) * itemData.price / itemData.ammo);
      const refund = totalRefund - (t._refunded || 0);
      t._refunded = totalRefund;
      if (wallet) wallet.amount += refund;
      else player.score += refund;
      t.ammo--;
      if (t.ammo <= 0) player.tools = player.tools.filter(x => x.type !== 'parachute');
      playTickSound();
    }
  } else if (item === 'shield') {
    if (player.shield) {
      if (wallet) wallet.amount += itemData.price;
      else player.score += itemData.price;
      player.shield = null;
      playTickSound();
    }
  } else {
    const weapon = player.weapons.find(w => w.type === item);
    if (weapon && weapon.ammo > 0) {
      const soldUnits = itemData.ammo - weapon.ammo;
      const totalRefund = Math.floor((soldUnits + 1) * itemData.price / itemData.ammo);
      const refund = totalRefund - (weapon._refunded || 0);
      weapon._refunded = totalRefund;
      if (wallet) wallet.amount += refund;
      else player.score += refund;
      weapon.ammo--;
      if (weapon.ammo <= 0) {
        player.weapons = player.weapons.filter(w => w.type !== item);
      }
      playTickSound();
    }
  }
}

function sellSelectedItem(item) {
  const humanPlayer = players.find(p => !p.ai);
  if (!humanPlayer) return;
  const wallet = {amount: score};
  sellItem(humanPlayer, item, wallet);
  score = wallet.amount;
}

function marketBuy(item) {
  if (networkMode) {
    const mine = myPlayer();
    if (mine) buyItem(mine, item);
  } else {
    buySelectedItem(item);
  }
}

function marketSell(item) {
  if (networkMode) {
    const mine = myPlayer();
    if (mine) sellItem(mine, item);
  } else {
    sellSelectedItem(item);
  }
}

function startRound() {
  menuState = null;
  state = 'round-start';
}

function executeFire(player, a, p, weaponIndex) {
  const [px, py] = vec(player.x, player.y-3, a+180, 5);
  const weapon = player.weapons[weaponIndex];
  const {projectile} = WEAPON_TYPES[weapon.type];
  const projectileType = PROJECTILE_TYPES[projectile.type];
  weapon.ammo -= 1;
  player.shotsFired++;
  projectileType.create(projectile, player, weapon, px, py, a, p, wind)
    .forEach(x => projectiles.push(x));
  state = 'shoot';
}

function updateMarket() {
  const marketItems = Object.keys(MARKET_ITEMS).filter(item => !(tracerMode && item === 'smokeTracer'));
  const isClient = networkMode && !netIsHost();

  if (!menuState || menuState.scrollOffset === undefined) {
    menuState = {
      selected: 0,
      scrollOffset: 0,
      round,
      waitingForHost: false,
    };
    if (!isClient) {
      players.forEach(p => {
        if (p.ai) aiBuy(p);
      });
    }
  }
  if (menuState.round !== round) {
    menuState.round = round;
    menuState.waitingForHost = false;
  }

  if (isClient && menuState.waitingForHost) {
    if (key('Enter')) {
      if (afterKeyDelay()) {
        menuState.waitingForHost = false;
        playTickSound();
      }
    }
    const click = popClick();
    if (click && checkHit(click.x, click.y, PANEL_X+100, 318, 200, 22)) {
      menuState.waitingForHost = false;
      playTickSound();
    }
    return;
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
      if (isClient) {
        netSendCommand({type: CMD.BUY, item: marketItems[menuState.selected]});
      } else {
        marketBuy(marketItems[menuState.selected]);
      }
    }
  }
  else if (key(' ')) {
    idle = true;
  }
  else if (key('Enter')) {
    if (afterKeyDelay()) {
      if (!isClient) startRound();
      else {
        menuState.waitingForHost = true;
        playTickSound();
      }
    }
  }
  else {
    idle = true;
  }

  const click = popClick();
  if (click) {
    const arrowX = PANEL_X + 15;
    const arrowW = 22;
    const arrowH = 54;
    const listX = PANEL_X + 40;
    const listW = 340;
    const itemH = 18;
    const y = 94;
    const maxVisible = 8;

    // Up/down arrow buttons (left side) — 3× taller
    if (checkHit(click.x, click.y, arrowX, y, arrowW, arrowH)) {
      const prev = menuState.selected;
      menuState.selected = (menuState.selected - 1 + marketItems.length) % marketItems.length;
      if (menuState.selected < menuState.scrollOffset) menuState.scrollOffset = menuState.selected;
      if (menuState.selected >= menuState.scrollOffset + maxVisible) menuState.scrollOffset = menuState.selected - (maxVisible - 1);
      if (menuState.selected !== prev) playTickSound();
      return;
    }
    if (checkHit(click.x, click.y, arrowX, y + (maxVisible - 1) * itemH - arrowH + itemH, arrowW, arrowH)) {
      const prev = menuState.selected;
      menuState.selected = (menuState.selected + 1) % marketItems.length;
      if (menuState.selected >= menuState.scrollOffset + maxVisible) menuState.scrollOffset = menuState.selected - (maxVisible - 1);
      if (menuState.selected < menuState.scrollOffset) menuState.scrollOffset = menuState.selected;
      if (menuState.selected !== prev) playTickSound();
      return;
    }

    for (let i = 0; i < Math.min(maxVisible, marketItems.length); i++) {
      const itemY = y + i * itemH;
      if (checkHit(click.x, click.y, listX, itemY, listW, itemH)) {
        const itemIndex = i + menuState.scrollOffset;
        if (menuState.selected === itemIndex) {
          if (isClient) {
            netSendCommand({type: CMD.BUY, item: marketItems[itemIndex]});
          } else {
            marketBuy(marketItems[itemIndex]);
          }
        } else {
          menuState.selected = itemIndex;
          playTickSound();
        }
        return;
      }
    }

    // Buy button
    const btnY = 246;
    const btnH = 22;
    if (checkHit(click.x, click.y, listX + 20, btnY, 90, btnH)) {
      if (isClient) {
        netSendCommand({type: CMD.BUY, item: marketItems[menuState.selected]});
      } else {
        marketBuy(marketItems[menuState.selected]);
      }
      return;
    }

    if (checkHit(click.x, click.y, PANEL_X+100, 318, 200, 22)) {
      if (!isClient) startRound();
      else {
        menuState.waitingForHost = true;
        playTickSound();
      }
    }
  }
}

function aiBuy(player) {
  player.score = STARTING_SCORE;
  const marketItems = Object.keys(MARKET_ITEMS).filter(x => x !== 'babyMissile' && !(tracerMode && x === 'smokeTracer') && (WEAPON_TYPES[x] || x === 'parachute' || SHIELD_TYPES[x]));
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
      } else if (SHIELD_TYPES[item]) {
        if (player.shield && player.shield.type === item) player.shield.ammo++;
        else player.shield = {type:item, energy:SHIELD_TYPES[item].energy, ammo:1};
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
      player.deathOrder = -1;
      player.shotsFired = 0;
      player.totalEarned = player.totalEarned || 0;
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
        id: newPlayerId(),
        x:0, y:0, a:0,
        c: color, cb: borderColor,
        p: PLAYER_INITIAL_POWER,
      tools: [],
      weapons: (() => {
        const w = PLAYER_STARTING_WEAPONS.map(x => ({...x}));
        return w;
      })(),
        currentWeapon: 0,
        energy: PLAYER_MAX_ENERGY,
        shield: null,
        ai: i !== 0 ? sample(Object.keys(AI_TYPES)) : undefined,
        parachute: null,
        fallHeight: 0,
      score: 0,
      totalEarned: 0,
        kills: 0,
        deaths: 0,
        deathOrder: -1,
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

const NOOP_OSC = {frequency: {setValueAtTime() {}}, stop() {}};
let lastBroadcastState = null;
let lastRemoteCommandAt = 0;
let pendingRoster = null;
let connectedClientIds = new Set();
let disconnectedPlayerTimers = {};
let disconnectedPlayerIds = new Set();

function applyRoster(msg) {
  const current = new Map(netLobby.players.map(p => [p.id, p]));
  netLobby.players = msg.players.map(p => ({
    id: p.id,
    name: p.name,
    ready: current.has(p.id) ? current.get(p.id).ready : false,
  }));
  broadcastLobby();
}

function handlePlayerDisconnect(playerId) {
  const player = players.find(p => p.id === playerId && !p.dead);
  if (!player) return;

  const {x, y, c} = player;
  const explosionSpec = sample(DEATH_SPECS);
  const explosionType = EXPLOSION_TYPES[explosionSpec.type];
  explosions.push(explosionType.create(explosionSpec, x, y));
  createParticles(x, y, PLAYER_EXPLOSION_PARTICLE_POWER, c);
  player.dead = true;
  player.deaths++;
  player.deathOrder = typeof deathOrderCounter !== 'undefined' ? deathOrderCounter++ : 0;
  disconnectedPlayerIds.add(playerId);

  if (state === 'aim' && players[currentPlayer].id === playerId) {
    state = 'explosions';
  }

  broadcastWorld();
  delete disconnectedPlayerTimers[playerId];
}

function myPlayer() {
  if (!networkMode) return players.find(p => !p.ai);
  return players.find(p => p.id === netPlayerId);
}

function endNetworkSession() {
  for (const id of Object.keys(disconnectedPlayerTimers)) {
    clearTimeout(disconnectedPlayerTimers[id]);
  }
  disconnectedPlayerTimers = {};
  connectedClientIds.clear();
  disconnectedPlayerIds.clear();
  netDisconnect();
  networkMode = false;
  netPlayerId = null;
  netLobby = null;
  netMenuState = null;
  menuState = null;
  state = 'start-game';
}

netOnMessage((msg) => {
  if (msg.type === MSG.ROSTER) {
    if (netIsHost()) {
      const newIds = new Set(msg.players.map(p => p.id));

      for (const id of connectedClientIds) {
        if (!newIds.has(id) && !disconnectedPlayerTimers[id]) {
          const player = players.find(p => p.id === id && !p.ai && !p.dead);
          if (player && state !== 'net-lobby' && state !== 'market') {
            disconnectedPlayerTimers[id] = setTimeout(() => {
              handlePlayerDisconnect(id);
            }, NETWORK_DISCONNECT_TIMEOUT);
          }
        }
      }

      for (const id of Object.keys(disconnectedPlayerTimers)) {
        if (newIds.has(id)) {
          clearTimeout(disconnectedPlayerTimers[id]);
          delete disconnectedPlayerTimers[id];
        }
      }

      connectedClientIds = newIds;

      if (netLobby) applyRoster(msg);
      else pendingRoster = msg;
    }
    return;
  }
  if (msg.type === MSG.HOST_LEFT) {
    endNetworkSession();
    return;
  }
  if (msg.type === MSG.ERROR) {
    netError = msg.message;
    if (netMenuState && netMenuState.phase !== 'setup') netMenuState.phase = 'setup';
    return;
  }
  if (msg.type === HOST_MSG.LOBBY) {
    netLobby = {players: msg.players, config: msg.config};
    return;
  }
  if (msg.type === HOST_MSG.WORLD) {
    applyWorld(msg.snap);
    return;
  }
  if (msg.type === HOST_MSG.TERRAIN) {
    applyTerrain(msg.png);
    return;
  }
  if (msg.type === HOST_MSG.END_GAME) {
    endNetworkSession();
    return;
  }
  if (msg.type === MSG.COMMAND && netIsHost()) {
    lastRemoteCommandAt = performance.now();
    applyCommand(msg.playerId, msg.cmd);
  }
});

function applyWorld(snap) {
  if (netSnapCur) {
    netSnapPrev = netSnapCur;
    netSnapPrevAt = netSnapCurAt;
  }
  netSnapCur = snap;
  netSnapCurAt = performance.now();

  const prevMyTurn = state === 'aim' && players[currentPlayer] && !players[currentPlayer].ai && players[currentPlayer].id === netPlayerId;
  const keptAim = prevMyTurn ? {
    a: players[currentPlayer].a,
    p: players[currentPlayer].p,
    w: players[currentPlayer].currentWeapon,
  } : null;

  players = snap.players.map(p => ({...p}));
  state = snap.state;
  round = snap.round;
  totalRounds = snap.totalRounds;
  wind = snap.wind;
  currentPlayer = Math.max(0, players.findIndex(p => p.id === snap.currentPlayerId));
  winner = snap.winnerId ? players.find(p => p.id === snap.winnerId) || null : null;
  projectiles = snap.projectiles || [];
  explosions = (snap.explosions || []).map(e => ({...e, osc: NOOP_OSC}));
  trajectories = snap.trajectories || [];
  napalmParticles = snap.napalmParticles || [];
  fireCells = snap.fireCells || [];
  smokeParticles = snap.smokeParticles || [];

  if (keptAim && snap.state === 'aim' && players[currentPlayer] && players[currentPlayer].id === netPlayerId) {
    players[currentPlayer].a = keptAim.a;
    players[currentPlayer].p = keptAim.p;
    players[currentPlayer].currentWeapon = keptAim.w;
  }
}

function interpolateWorld() {
  const cur = netSnapCur;
  if (!cur) return;
  const prev = netSnapPrev;
  let k = 0;
  if (prev && netSnapCurAt > netSnapPrevAt) {
    k = clamp(0, (performance.now() - netSnapCurAt) / (netSnapCurAt - netSnapPrevAt), 3);
  }
  const interp = (a, b) => a + (b - a) * k;

  if (prev && prev.players) {
    for (const p of players) {
      const pr = prev.players.find(q => q.id === p.id);
      if (pr) {
        p.x = interp(pr.x, p.x);
        p.y = interp(pr.y, p.y);
      }
    }
  }

  if (prev && prev.projectiles) {
    const prevPs = prev.projectiles;
    projectiles = (cur.projectiles || []).map((p, i) => {
      const disp = {...p, trail: p.trail || []};
      const pp = prevPs[i];
      if (!pp) return disp;
      if (p.type === 'normal') {
        disp.t = interp(pp.t, p.t);
        const [x, y] = parable(disp.t, p.ox, p.oy, deg2rad(180 + p.a), p.p / PROJECTILE_POWER_REDUCTION_FACTOR, p.wind / PROJECTILE_WIND_REDUCTION_FACTOR);
        disp.x = x;
        disp.y = y;
      } else {
        disp.x = interp(pp.x, p.x);
        disp.y = interp(pp.y, p.y);
      }
      return disp;
    });
  }

  if (prev && prev.explosions) {
    const prevEs = prev.explosions;
    explosions = (cur.explosions || []).map((e, i) => {
      const disp = {...e, osc: NOOP_OSC};
      const pe = prevEs[i];
      if (!pe) return disp;
      disp.cr = interp(pe.cr, e.cr);
      if (e.x !== undefined) {
        disp.x = interp(pe.x, e.x);
        disp.y = interp(pe.y, e.y);
      }
      return disp;
    });
  }
}

function applyTerrain(png) {
  const img = new Image();
  img.onload = () => {
    terrain.clearRect(0, 0, W, H);
    terrain.drawImage(img, 0, 0);
  };
  img.src = png;
}

function broadcastWorld() {
  if (!networkMode || !netIsHost()) return;
  const snap = {
    state,
    round,
    totalRounds,
    wind,
    currentPlayerId: players[currentPlayer] ? players[currentPlayer].id : null,
    winnerId: winner ? winner.id : null,
    players: players.map(p => ({
      id: p.id, name: p.name, ai: p.ai, dead: p.dead,
      x: p.x, y: p.y, a: p.a, p: p.p,
      c: p.c, cb: p.cb,
      currentWeapon: p.currentWeapon,
      energy: p.energy,
      shield: p.shield,
      parachute: p.parachute,
      fallHeight: p.fallHeight,
      tools: p.tools,
      weapons: p.weapons,
      score: p.score, totalEarned: p.totalEarned,
      kills: p.kills, deaths: p.deaths, deathOrder: p.deathOrder,
      shotsFired: p.shotsFired, wins: p.wins,
    })),
    projectiles: projectiles.map(p => ({
      type: p.type, x: p.x, y: p.y, ox: p.ox, oy: p.oy, a: p.a, p: p.p,
      t: p.t, wind: p.wind, state: p.state, d: p.d,
      color: p.player ? p.player.c : 'white',
      trail: p.trail ? p.trail.slice(-300).filter((_, i) => i % 3 === 0).map(t => ({x: t.x, y: t.y})) : [],
    })),
    explosions: explosions.map(e => ({
      type: e.type, x: e.x, y: e.y, r: e.r, cr: e.cr,
      blobs: e.blobs, pattern: e.pattern,
    })),
    napalmParticles: napalmParticles.map(p => ({x: p.x, y: p.y})),
    fireCells: fireCells.map(f => ({x: f.x, y: f.y, timeLeft: f.timeLeft})),
    smokeParticles: smokeParticles.map(s => ({x: s.x, y: s.y, vx: s.vx, vy: s.vy, alpha: s.alpha, lifetime: s.lifetime})),
    trajectories: trajectories.slice(-300).filter((_, i) => i % 3 === 0).map(t => ({x: t.x, y: t.y, a: t.a, c: t.c})),
  };
  netBroadcast({type: HOST_MSG.WORLD, snap});
}

function broadcastTerrain(force) {
  if (!networkMode || !netIsHost()) return;
  const now = performance.now();
  if (!terrainDirty && !force) return;
  if (!force && now - lastTerrainAt < 500) return;
  terrainDirty = false;
  lastTerrainAt = now;
  netBroadcast({type: HOST_MSG.TERRAIN, png: terrain.canvas.toDataURL('image/png')});
}

function applyCommand(playerId, cmd) {
  if (state === 'net-lobby') {
    if (cmd.type === CMD.READY || cmd.type === CMD.UNREADY) {
      const entry = netLobby.players.find(p => p.id === playerId);
      if (entry) entry.ready = cmd.type === CMD.READY;
      broadcastLobby();
    }
    return;
  }
  const player = players.find(p => p.id === playerId);
  if (!player || player.ai) return;
  if (state === 'market') {
    if (cmd.type === CMD.BUY) buyItem(player, cmd.item);
    if (cmd.type === CMD.SELL) sellItem(player, cmd.item);
    broadcastWorld();
    return;
  }
  if (state === 'aim') {
    if (cmd.type === CMD.FIRE && players[currentPlayer].id === playerId && !player.dead && player.weapons.length > 0) {
      player.a = clamp(0, cmd.a, 180);
      player.p = clamp(0, cmd.p, player.energy * PLAYER_ENERGY_POWER_MULTIPLIER);
      player.currentWeapon = clamp(0, cmd.weaponIndex, player.weapons.length - 1);
      executeFire(player, player.a, player.p, player.currentWeapon);
    }
    return;
  }
}

function initNetworkPlayers() {
  players = [];
  const roster = netLobby.players;
  const total = netLobby.config.players;
  for (let i = 0; i < total; i++) {
    const [color, borderColor] = PLAYER_COLORS[i];
    const human = i < roster.length ? roster[i] : null;
    const wasDisconnected = human && disconnectedPlayerIds.has(human.id);
    players.push({
      name: human ? human.name : `AI ${i+1}`,
      dead: false,
      id: human ? human.id : newPlayerId(),
      x: 0, y: 0, a: 0,
      c: color, cb: borderColor,
      p: PLAYER_INITIAL_POWER,
      tools: [],
      weapons: PLAYER_STARTING_WEAPONS.map(x => ({...x})),
      currentWeapon: 0,
      energy: PLAYER_MAX_ENERGY,
      shield: null,
      ai: (human && !wasDisconnected) ? undefined : sample(Object.keys(AI_TYPES)),
      parachute: null,
      fallHeight: 0,
      score: STARTING_SCORE,
      totalEarned: 0,
      kills: 0, deaths: 0, deathOrder: -1,
      shotsFired: 0, wins: 0,
      lastDamageSource: null,
    });
  }
  players = shuffle(players);
  for (let i=0; i<players.length; i++) {
    const player = players[i];
    player.x = 50 + (W-100) / (players.length - 1) * i;
    player.y = landHeight(terrain, player.x) + 1;
    player.a = player.x > W/2 ? 45 : 180-45;
    clipTerrain(terrain, (ctx) => drawRect(ctx, player.x-4, 0, 8, player.y, ctx.color));
  }
  terrainDirty = true;
}

function startNetworkGame() {
  selectedPlayers = netLobby.config.players;
  totalRounds = netLobby.config.rounds;
  selectedTerrain = netLobby.config.terrain;
  menuState = null;
  disconnectedPlayerIds.clear();
  initNetworkPlayers();
  broadcastLobby();
  broadcastWorld();
  broadcastTerrain(true);
  state = 'market';
}

function broadcastLobby() {
  if (!netLobby) return;
  netBroadcast({type: HOST_MSG.LOBBY, players: netLobby.players, config: netLobby.config});
}

function updateNetMenu() {
  const s = netMenuState;
  if (!s) return;
  if (s.phase === 'connecting') return;

  const joinRoom = (code) => {
    const fromBrowse = s.phase === 'browse';
    let name = s.name;
    if (!name) {
      name = prompt('Your name:') || '';
      clearKeys();
      if (!name) return;
      s.name = name.slice(0, 20);
    }
    if (!code) return;
    s.phase = 'connecting';
    netError = null;
    netConnect(name, code).then((res) => {
      clearKeys();
      netPlayerId = res.id;
      networkMode = true;
      players = [];
      if (res.host) {
        netLobby = {players: [], config: {players: 5, rounds: 3, terrain: null}};
        if (pendingRoster) {
          applyRoster(pendingRoster);
          pendingRoster = null;
        }
        menuState = null;
        state = 'net-lobby';
      } else {
        netLobby = {players: [], config: null};
        menuState = null;
        state = 'net-lobby';
      }
    }).catch((e) => {
      netError = e.message || 'connection failed';
      if (fromBrowse) {
        s.phase = 'browse';
        s.lastRefresh = 0;
      } else {
        s.phase = 'setup';
      }
    });
  };

  const refreshRooms = () => {
    if (s.loading) return;
    s.loading = true;
    s.lastRefresh = Date.now();
    netListRooms().then((rooms) => {
      s.rooms = rooms || [];
      s.loading = false;
      s.error = null;
    }).catch((e) => {
      s.loading = false;
      s.error = e.message;
    });
  };

  const goBack = () => {
    state = 'start-menu';
    netMenuState = null;
    netError = null;
    menuState = {
      selected: 0,
      values: [Math.max(0, selectedPlayers - 3), Math.max(0, totalRounds - 1), selectedTerrain === null ? 0 : selectedTerrain === 'mountain' ? 1 : selectedTerrain === 'sand' ? 2 : 0, tracerMode ? 0 : 1, 0],
    };
  };

  const enterBrowse = () => {
    s.phase = 'browse';
    s.rooms = [];
    s.selected = 0;
    s.scrollOffset = 0;
    s.loading = false;
    s.error = null;
    s.lastRefresh = 0;
    refreshRooms();
  };

  if (s.phase === 'setup') {
    if (key('Escape')) {
      if (afterKeyDelay()) goBack();
      return;
    }
    if (key('ArrowUp')) {
      if (afterKeyDelay()) {
        s.selected = (s.selected - 1 + 3) % 3;
        playTickSound();
      }
    } else if (key('ArrowDown')) {
      if (afterKeyDelay()) {
        s.selected = (s.selected + 1) % 3;
        playTickSound();
      }
    } else if (key('Enter')) {
      if (afterKeyDelay()) {
        if (s.selected === 0) joinRoom(new URLSearchParams(location.search).get('room') || netMakeRoomCode());
        else if (s.selected === 1) enterBrowse();
        else goBack();
      }
    }
    const click = popClick();
    if (click) {
      const buttons = [[PANEL_X+100, 140], [PANEL_X+100, 170], [PANEL_X+100, 200]];
      for (let i = 0; i < 3; i++) {
        if (checkHit(click.x, click.y, buttons[i][0], buttons[i][1], 200, 22)) {
          s.selected = i;
          playTickSound();
          if (i === 0) joinRoom(new URLSearchParams(location.search).get('room') || netMakeRoomCode());
          else if (i === 1) enterBrowse();
          else goBack();
          return;
        }
      }
    }
    return;
  }

  if (s.phase === 'browse') {
    if (key('Escape')) {
      if (afterKeyDelay()) {
        s.phase = 'setup';
        s.selected = 1;
      }
      return;
    }
    if (!s.loading && (!s.lastRefresh || Date.now() - s.lastRefresh >= 2000)) refreshRooms();
    const rooms = s.rooms || [];
    const itemCount = rooms.length + 2;
    if (key('ArrowUp')) {
      if (afterKeyDelay()) {
        s.selected = (s.selected - 1 + itemCount) % itemCount;
        playTickSound();
      }
    } else if (key('ArrowDown')) {
      if (afterKeyDelay()) {
        s.selected = (s.selected + 1) % itemCount;
        playTickSound();
      }
    } else if (key('Enter')) {
      if (afterKeyDelay() && !s.loading) {
        if (s.selected < rooms.length) joinRoom(rooms[s.selected].room);
        else if (s.selected === rooms.length) refreshRooms();
        else {
          s.phase = 'setup';
          s.selected = 1;
        }
      }
    }
    if (s.selected < rooms.length) {
      if (s.selected < s.scrollOffset) s.scrollOffset = s.selected;
      if (s.selected > s.scrollOffset + 7) s.scrollOffset = s.selected - 7;
    }
    s.scrollOffset = Math.max(0, Math.min(s.scrollOffset, Math.max(0, rooms.length - 8)));
    const click = popClick();
    if (click && !s.loading) {
      for (let i = 0; i < Math.min(8, rooms.length); i++) {
        const idx = s.scrollOffset + i;
        if (idx >= rooms.length) break;
        if (checkHit(click.x, click.y, PANEL_X+30, 115 + i*16, PANEL_WIDTH-60, 16)) {
          s.selected = idx;
          playTickSound();
          joinRoom(rooms[idx].room);
          return;
        }
      }
      if (checkHit(click.x, click.y, PANEL_X+40, 300, 90, 22)) {
        s.selected = rooms.length;
        playTickSound();
        refreshRooms();
        return;
      }
      if (checkHit(click.x, click.y, PANEL_X+150, 300, 90, 22)) {
        s.selected = rooms.length + 1;
        playTickSound();
        s.phase = 'setup';
        s.selected = 1;
      }
    }
  }
}

function updateNetLobby() {
  if (netIsHost()) {
    if (!netLobby) netLobby = {players: [], config: {players: 5, rounds: 3, terrain: null}};
    const minPlayers = Math.max(2, Math.min(10, netLobby.players.length));
    const playerCounts = Array.from({length: 10 - minPlayers + 1}, (_, i) => minPlayers + i);
    const roundCounts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const terrains = ['Random', 'Mountain', 'Sand'];
    if (!menuState) {
      menuState = {
        selected: 0,
        values: [
          Math.max(0, playerCounts.indexOf(netLobby.config.players)),
          roundCounts.indexOf(netLobby.config.rounds),
          netLobby.config.terrain === null ? 0 : netLobby.config.terrain === 'mountain' ? 1 : 2,
        ],
      };
    }
    const cycle = (opt, dir) => {
      const vals = opt === 0 ? playerCounts : opt === 1 ? roundCounts : terrains;
      menuState.values[opt] = (menuState.values[opt] + dir + vals.length) % vals.length;
    };
    const applyConfig = () => {
      netLobby.config.players = playerCounts[menuState.values[0]];
      netLobby.config.rounds = roundCounts[menuState.values[1]];
      netLobby.config.terrain = terrains[menuState.values[2]] === 'Random' ? null : terrains[menuState.values[2]].toLowerCase();
      broadcastLobby();
    };

    const clearStartHint = () => {
      if (menuState.hint || menuState.startWarn) {
        menuState.hint = '';
        menuState.startWarn = false;
      }
    };

    const tryStart = () => {
      const roster = netLobby.players;
      if (roster.length < 2) {
        menuState.hint = 'Need at least 2 players';
        menuState.startWarn = false;
        playTickSound();
        return;
      }
      const unready = roster.filter(p => p.id !== netPlayerId && !p.ready);
      if (unready.length === 0) {
        clearStartHint();
        startNetworkGame();
        return;
      }
      if (menuState.startWarn) {
        clearStartHint();
        startNetworkGame();
        return;
      }
      menuState.startWarn = true;
      menuState.hint = `${unready.length} not ready - START again to force`;
      playTickSound();
    };

    if (key('ArrowUp')) {
      if (afterKeyDelay()) {
        menuState.selected = (menuState.selected - 1 + 3) % 3;
        playTickSound();
      }
    } else if (key('ArrowDown')) {
      if (afterKeyDelay()) {
        menuState.selected = (menuState.selected + 1) % 3;
        playTickSound();
      }
    } else if (key('ArrowLeft')) {
      if (afterKeyDelay()) {
        cycle(menuState.selected, -1);
        applyConfig();
        clearStartHint();
        playTickSound();
      }
    } else if (key('ArrowRight')) {
      if (afterKeyDelay()) {
        cycle(menuState.selected, 1);
        applyConfig();
        clearStartHint();
        playTickSound();
      }
    } else if (key('Enter')) {
      if (afterKeyDelay()) {
        tryStart();
      }
    }

    const click = popClick();
    if (click) {
      for (let i = 0; i < 3; i++) {
        const rowY = 232 + i * 26;
        if (checkHit(click.x, click.y, PANEL_X+20, rowY, 168, 20)) {
          menuState.selected = i;
          playTickSound();
        }
        if (checkHit(click.x, click.y, PANEL_X+262, rowY, 24, 18)) {
          menuState.selected = i;
          cycle(i, -1);
          applyConfig();
          clearStartHint();
          playTickSound();
        }
        if (checkHit(click.x, click.y, PANEL_X+355, rowY, 24, 18)) {
          menuState.selected = i;
          cycle(i, 1);
          applyConfig();
          clearStartHint();
          playTickSound();
        }
      }
      if (checkHit(click.x, click.y, PANEL_X+100, 318, 200, 22)) {
        tryStart();
      }
    }
  } else {
    if (key('Enter')) {
      if (afterKeyDelay()) {
        if (menuState && menuState.myReady) {
          netSendCommand({type: CMD.UNREADY});
        } else {
          netSendCommand({type: CMD.READY});
        }
        if (!menuState) menuState = {myReady: true};
        else menuState.myReady = !menuState.myReady;
      }
    }
    const click = popClick();
    if (click && checkHit(click.x, click.y, PANEL_X+100, 318, 200, 22)) {
      if (menuState && menuState.myReady) {
        netSendCommand({type: CMD.UNREADY});
      } else {
        netSendCommand({type: CMD.READY});
      }
      if (!menuState) menuState = {myReady: true};
      else menuState.myReady = !menuState.myReady;
    }
  }
}

function update() {
  idle = false;

  updateParticles();
  let napalmDt = dt;
  if (state === 'explosions') {
    const offScreen = (x, y) => x < 0 || x >= W || y < 0 || y >= H;
    const allNapalmOffScreen =
      (!napalmEmitter || offScreen(napalmEmitter.x, napalmEmitter.y)) &&
      napalmParticles.every(p => offScreen(p.x, p.y)) &&
      fireCells.every(f => offScreen(f.x, f.y));
    if (allNapalmOffScreen) napalmDt = dt * 100;
  }
  if (!networkMode || netIsHost()) updateNapalm(napalmDt);

  if (networkMode && !netIsHost()) {
    if (state === 'net-lobby') {
      updateNetLobby();
      return;
    }
    if (state === 'market') {
      updateMarket();
      return;
    }
    interpolateWorld();
    if (state !== 'aim') return;
  }

  if (state === 'start-game') {
    initNewGame();
  }

  else if (state === 'start-menu') {
    updateStartMenu();
  }

  else if (state === 'net-menu') {
    updateNetMenu();
  }

  else if (state === 'net-lobby') {
    updateNetLobby();
  }

  else if (state === 'market') {
    updateMarket();
  }

  else if (state === 'round-start') {
    round++;
    init();
    if (networkMode && netIsHost()) broadcastTerrain(true);
    state = 'start-turn';
  }

  else if (state === 'start-turn') {
    if (networkMode && netIsHost()) lastRemoteCommandAt = performance.now();
    state = 'aim';
  }

  else if (state === 'aim') {
    const player = players[currentPlayer];
    const isMyTurn = player.ai ? false : networkMode ? player.id === netPlayerId : true;
    const {a, p, weapons, energy} = player;
    const maxPower = energy * PLAYER_ENERGY_POWER_MULTIPLIER;
    player.p = clamp(0, player.p, maxPower);
    const isPrecise = key('Alt');
    const isFast = key('Shift');
    const isReverse = key('Shift');
    let shoot;

    if (networkMode && netIsHost() && !player.ai && player.id !== netPlayerId && performance.now() - lastRemoteCommandAt > 45000) {
      executeFire(player, player.a, player.p, player.currentWeapon);
    }

    // Check for clicks on controls
    const click = popClick();
    if (click && !player.ai && isMyTurn) {
      const maxPower = player.energy * PLAYER_ENERGY_POWER_MULTIPLIER;

      // Angle gauge (cx=90, cy=312, r=60)
      const gaugeCx = 80, gaugeCy = 357, gaugeR = 60;
      const gdx = click.x - gaugeCx, gdy = click.y - gaugeCy;
      if (gdx*gdx + gdy*gdy < gaugeR*gaugeR*1.3 && gdy < 0) {
        let aDeg = (-Math.atan2(gdy, gdx) + Math.PI) * 180 / Math.PI;
        if (aDeg < 0) aDeg += 360;
        if (aDeg > 180) aDeg = 360 - aDeg;
        player.a = Math.round(clamp(0, aDeg, 180));
        return;
      }

      // Angle < button (left half, 1px gap from center)
      if (click.x >= 20 && click.x < 80 && click.y >= 369 && click.y < 395) {
        player.a = wrap(0, player.a - 1, 180);
        return;
      }

      // Angle > button (right half, 1px gap from center)
      if (click.x >= 81 && click.x < 141 && click.y >= 369 && click.y < 395) {
        player.a = wrap(0, player.a + 1, 180);
        return;
      }

      // Power bar (610, 286, 25×80)
      if (click.x >= 610 && click.x < 635 && click.y >= 286 && click.y < 366) {
        const pRatio = 1 - (click.y - 286) / 80;
        player.p = Math.round(clamp(0, pRatio, 1) * maxPower);
        return;
      }

      // Power ▲ (1px gap above bar)
      if (click.x >= 610 && click.x < 635 && click.y >= 257 && click.y < 285) {
        player.p = clamp(0, player.p + 1, maxPower);
        return;
      }

      // Power ▼ (1px gap below bar)
      if (click.x >= 610 && click.x < 635 && click.y >= 367 && click.y < 395) {
        player.p = clamp(0, player.p - 1, maxPower);
        return;
      }

      // Weapon switch (385, 360, 140×28)
      if (click.x >= 385 && click.x < 525 && click.y >= 360 && click.y < 388) {
        player.currentWeapon = wrap(0, player.currentWeapon + 1, player.weapons.length - 1);
        playTickSound();
        return;
      }

      // FIRE button (280, 355, 80×40)
      if (click.x >= 280 && click.x < 360 && click.y >= 355 && click.y < 395) {
        shoot = {a: player.a, p: player.p};
      }
    }

    if (player.ai && (!networkMode || netIsHost())) {
      let ai = AI_TYPES[player.ai];
      const plan = ai.decide(player);
      player.a = wrap(0, plan.a, 180);
      player.p = clamp(0, plan.p, maxPower);
      player.currentWeapon = clamp(0, plan.currentWeapon, weapons.length-1);
      shoot = true;
    }

    else if (isMyTurn && key('ArrowLeft')) {
      if (isPrecise && !afterKeyDelay()) return;
      let incr = isFast ? PLAYER_ANGLE_FAST_INCREMENT : PLAYER_ANGLE_INCREMENT;
      player.a = wrap(0, a -incr, 180);
      if (isPrecise || isFast || a % PLAYER_ANGLE_TICK_SOUND_INTERVAL === 0) playTickSound();

    } else if (isMyTurn && key('ArrowRight')) {
      if (isPrecise && !afterKeyDelay()) return;
      let incr = isFast ? PLAYER_ANGLE_FAST_INCREMENT : PLAYER_ANGLE_INCREMENT;
      player.a = wrap(0, a +incr, 180);
      if (isPrecise || isFast || a % PLAYER_ANGLE_TICK_SOUND_INTERVAL === 0) playTickSound();

    } else if (isMyTurn && key('ArrowUp')) {
      if (isPrecise && !afterKeyDelay()) return;
      let incr = isFast ? PLAYER_POWER_FAST_INCREMENT : PLAYER_POWER_INCREMENT;
      player.p = clamp(0, p +incr, maxPower);
      if (p < maxPower && (isPrecise || isFast || p % PLAYER_POWER_TICK_SOUND_INTERVAL === 0)) playTickSound();

    } else if (isMyTurn && key('ArrowDown')) {
      if (isPrecise && !afterKeyDelay()) return;
      let incr = isFast ? PLAYER_POWER_FAST_INCREMENT : PLAYER_POWER_INCREMENT;
      player.p = clamp(0, p -incr, maxPower);
      if (p > 0 && (isPrecise || isFast || p % PLAYER_POWER_TICK_SOUND_INTERVAL === 0)) playTickSound();

    } else if (isMyTurn && key('Tab')) {
      if (!afterKeyDelay()) return;
      const dir = isReverse ? -1 : 1;
      player.currentWeapon = wrap(0, player.currentWeapon+dir, player.weapons.length-1);
      playTickSound();

    } else if (isMyTurn && key(' ')) {
      if (!afterKeyDelay()) return;
      shoot = {a, p};

    } else {
      idle = true;
    }

    if (shoot) {
      const a = shoot === true ? player.a : shoot.a;
      const p = shoot === true ? player.p : shoot.p;
      if (networkMode && !netIsHost()) {
        netSendCommand({type: CMD.FIRE, a, p, weaponIndex: player.currentWeapon});
      } else {
        executeFire(player, a, p, player.currentWeapon);
      }
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
      terrainDirty = true;

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
    let done = false;
    for (let i = 0; i < 2; i++) {
      if (collapseTerrainStep(terrain, collapseState)) {
        collapseState = null;
        state = 'land-players';
        done = true;
        break;
      }
    }
    terrainDirty = true;
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
    if (typeof deathOrderCounter === 'undefined') deathOrderCounter = 0;
    const dyingPlayer = players.find(x => x.energy<=0 && !x.dead);
    if (!dyingPlayer) {deathOrderCounter = undefined; state = 'end-turn'; return}

    const {x, y, c} = dyingPlayer;
    const explosionSpec = sample(DEATH_SPECS);
    const explosionType = EXPLOSION_TYPES[explosionSpec.type];
    explosions.push(explosionType.create(explosionSpec, x, y));
    createParticles(x, y, PLAYER_EXPLOSION_PARTICLE_POWER, c);
    dyingPlayer.dead = true;
    dyingPlayer.deaths++;
    dyingPlayer.deathOrder = deathOrderCounter++;
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
      player.currentWeapon = player.weapons.length > 0 ? wrap(0, player.currentWeapon, player.weapons.length-1) : 0;
      if (player.shield && player.shield.energy <= 0) {
        player.shield.ammo--;
        if (player.shield.ammo > 0) {
          player.shield.energy = SHIELD_TYPES[player.shield.type].energy;
        } else {
          player.shield = null;
        }
      }
      player.fallHeight = 0;
    }

    const canShoot = players.some(x => !x.dead && x.weapons.length > 0);
    if (!canShoot) {
      return state = 'round-end';
    }

    for (let p=0; p<players.length; p++) {
      const i = wrap(0, currentPlayer+p+1, players.length-1);
      if (!players[i].dead && players[i].weapons.length > 0) {currentPlayer = i; break}
    }

    fadeTrajectories();
    state = 'start-turn';
  }

  else if (state === 'round-end') {
    if (!menuState) {
      menuState = {scoreAwarded: false};
      for (let player of players) {
        player.score += player.kills * SCORE_PER_KILL;
        player.totalEarned += player.kills * SCORE_PER_KILL;
      }
      if (winner) {
        winner.score += SCORE_FOR_WIN;
        winner.totalEarned += SCORE_FOR_WIN;
      }
      const humanPlayer = players.find(p => !p.ai);
      if (!networkMode && humanPlayer) {
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
    const click = popClick();
    if (click && checkHit(click.x, click.y, PANEL_X+100, 318, 200, 22)) {
      menuState = null;
      if (round < totalRounds) {
        state = 'market';
      } else {
        state = 'game-over';
      }
    }
    idle = true;
  }

  else if (state === 'game-over') {
    if (key('Enter')) {
      if (afterKeyDelay()) {
        if (networkMode) {
          netBroadcast({type: HOST_MSG.END_GAME, reason: 'complete'});
          endNetworkSession();
        } else {
          state = 'start-game';
        }
      }
    }
    const click = popClick();
    if (click && checkHit(click.x, click.y, PANEL_X+100, 290, 200, 22)) {
      if (networkMode) {
        netBroadcast({type: HOST_MSG.END_GAME, reason: 'complete'});
        endNetworkSession();
      } else {
        state = 'start-game';
      }
    }
    idle = true;
  }

  else {
    throw new Error(`Invalid state, ${state}`);
  }

  if (networkMode && netIsHost()) {
    const now = performance.now();
    const fast = state === 'shoot' || state === 'explosions';
    if (state !== lastBroadcastState || now - lastBroadcastAt > (fast ? 100 : 250)) {
      lastBroadcastState = state;
      lastBroadcastAt = now;
      broadcastWorld();
    }
    broadcastTerrain(false);
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
  const p = {x, y, dir: 0, hasDir: false, alive: true, source, emitX: x, emitY: y, settleTime: 0};

  const below = isTerrain(terrain, p.x, p.y + 1);
  if (!below) return p;

  const fire = hasFireAt(p.x, p.y);
  if (!fire) return p;

  const canFlowDL = !isTerrain(terrain, p.x - 1, p.y + 1);
  const canFlowDR = !isTerrain(terrain, p.x + 1, p.y + 1);
  const canSpillL = !isTerrain(terrain, p.x - 1, p.y);
  const canSpillR = !isTerrain(terrain, p.x + 1, p.y);

  if (canFlowDL || canFlowDR || canSpillL || canSpillR) return p;

  const occupied = napalmParticles.some(np => np.alive && np.x === p.x && np.y === p.y) || hasFireAt(p.x, p.y);
  if (occupied) {
    for (let y = p.y - 1; y >= 0; y--) {
      const np = napalmParticles.find(n => n.alive && n.x === p.x && n.y === y);
      if (np) np.y--;
      else break;
    }
    if (!isTerrain(terrain, p.x, p.y - 1) && !napalmParticles.some(np => np.alive && np.x === p.x && np.y === p.y - 1)) {
      p.y--;
      return p;
    }
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

  napalmParticles.sort((a, b) => b.y - a.y);
  reservedPositions.clear();
  for (const p of napalmParticles) if (p.alive) reservedPositions.add(p.x + ',' + p.y);
  for (let p of napalmParticles) updateParticle(p);
  napalmParticles = napalmParticles.filter(p => p.alive);

  // Settle pass: collapse unsupported columns, then let particles flow/spill
  let changed = true;
  while (changed) {
    changed = false;
    reservedPositions.clear();
    for (const p of napalmParticles) if (p.alive) reservedPositions.add(p.x + ',' + p.y);
    napalmParticles.sort((a, b) => b.y - a.y);
    for (let p of napalmParticles) {
      if (!p.alive) continue;
      const below = isTerrain(terrain, p.x, p.y + 1) || isTank(p.x, p.y + 1);
      const napalmBelow = hasNapalmAt(p.x, p.y + 1, p);
      if (!below && !napalmBelow && p.y < H - 1) {
        claimMove(p, p.x, p.y + 1);
        changed = true;
      }
    }
    if (changed) {
      reservedPositions.clear();
      for (const p of napalmParticles) if (p.alive) reservedPositions.add(p.x + ',' + p.y);
      napalmParticles.sort((a, b) => b.y - a.y);
      for (let p of napalmParticles) if (p.alive) updateParticle(p);
      napalmParticles = napalmParticles.filter(p => p.alive);
    }
  }

  for (let f of fireCells) f.timeLeft -= dt;
  const deadFireCells = fireCells.filter(f => f.timeLeft <= 0);
  fireCells = fireCells.filter(f => f.timeLeft > 0);
  for (let f of deadFireCells) {
    clipTerrain(terrain, (ctx) => { ctx.fillStyle = '#000'; ctx.fillRect(f.x, f.y + 1, 1, 1); });
  }
  if (deadFireCells.length > 0) terrainDirty = true;

  for (let f of fireCells) {
    if (Math.random() < dt * 12) smokeParticles.push({
      x: f.x + (Math.random() > 0.5 ? 1 : -1) * Math.random(),
      y: f.y,
      vx: (Math.random() - 0.5) * 5,
      vy: -(8 + Math.random() * 12),
      alpha: 0.35 + Math.random() * 0.2,
      lifetime: 1.2 + Math.random() * 1.0,
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

function claimMove(p, nx, ny) {
  const key = nx + ',' + ny;
  if (reservedPositions.has(key)) return false;
  reservedPositions.delete(p.x + ',' + p.y);
  reservedPositions.add(key);
  p.x = nx;
  p.y = ny;
  return true;
}

function pushNapalmColumn(x, startY) {
  const column = [];
  for (let y = startY; y >= 0; y--) {
    const np = napalmParticles.find(n => n.alive && n.x === x && n.y === y);
    if (np) column.push(np);
    else break;
  }
  for (let i = column.length - 1; i >= 0; i--) {
    const np = column[i];
    const ok = np.x + ',' + np.y;
    np.y--;
    reservedPositions.delete(ok);
    reservedPositions.add(np.x + ',' + np.y);
  }
}

function pushRow(x, y, dir) {
  const row = [];
  let cx = x + dir;
  while (!isTerrain(terrain, cx, y)) {
    const np = napalmParticles.find(n => n.alive && n.x === cx && n.y === y);
    if (np) {
      row.push(np);
      cx += dir;
    } else break;
  }
  for (let i = row.length - 1; i >= 0; i--) {
    const np = row[i];
    const ok = np.x + ',' + np.y;
    np.x += dir;
    reservedPositions.delete(ok);
    reservedPositions.add(np.x + ',' + np.y);
  }
}

function tryFlow(p, dir) {
  const nx = p.x + dir;
  const ny = p.y + 1;
  if (!isTerrain(terrain, nx, ny)) {
    if (hasNapalmAt(nx, ny, p)) return false;
    if (!claimMove(p, nx, ny)) return false;
    if (!p.hasDir) { p.dir = dir; p.hasDir = true; }
    return true;
  }
  return false;
}

function trySpill(p, dir) {
  const nx = p.x + dir;
  if (!isTerrain(terrain, nx, p.y)) {
    if (hasNapalmAt(nx, p.y, p)) return false;
    if (!claimMove(p, nx, p.y)) return false;
    if (!p.hasDir) { p.dir = dir; p.hasDir = true; }
    return true;
  }
  return false;
}

function updateParticle(p) {
  const prevX = p.x, prevY = p.y;
  const below = isTerrain(terrain, p.x, p.y + 1) || isTank(p.x, p.y + 1);
  const napalmBelow = hasNapalmAt(p.x, p.y + 1, p);

  if (!below && !napalmBelow) {
    if (p.y < H - 1) { claimMove(p, p.x, p.y + 1); return; }
    p.alive = false;
    reservedPositions.delete(p.x + ',' + p.y);
    return;
  }

  if (!below && napalmBelow) {
    // standing on another napalm particle - behave as if on fire terrain
  }

  if (below && !hasFireAt(p.x, p.y) && !napalmBelow && !hasFireAt(p.x, p.y + 1)) {
    createFire(p.x, p.y, p.source);
    p.alive = false;
    reservedPositions.delete(p.x + ',' + p.y);
    return;
  }

  if (!p.hasDir) {
    const flowDirs = [];
    if (!isTerrain(terrain, p.x - 1, p.y + 1)) flowDirs.push(-1);
    if (!isTerrain(terrain, p.x + 1, p.y + 1)) flowDirs.push(1);
    if (flowDirs.length > 0) {
      const dir = sample(flowDirs);
      if (claimMove(p, p.x + dir, p.y + 1)) {
        p.dir = dir;
        p.hasDir = true;
        return;
      }
      if (flowDirs.length > 1) {
        const other = flowDirs.find(d => d !== dir);
        if (claimMove(p, p.x + other, p.y + 1)) {
          p.dir = other;
          p.hasDir = true;
          return;
        }
      }
    }

    const spillDirs = [];
    if (!isTerrain(terrain, p.x - 1, p.y)) spillDirs.push(-1);
    if (!isTerrain(terrain, p.x + 1, p.y)) spillDirs.push(1);
    if (spillDirs.length > 0) {
      const dir = sample(spillDirs);
      if (claimMove(p, p.x + dir, p.y)) {
        p.dir = dir;
        p.hasDir = true;
        return;
      }
      if (spillDirs.length > 1) {
        const other = spillDirs.find(d => d !== dir);
        if (claimMove(p, p.x + other, p.y)) {
          p.dir = other;
          p.hasDir = true;
          return;
        }
      }
    }
    const canPushLeft = !isTerrain(terrain, p.x - 1, p.y)
      && napalmParticles.some(np => np.alive && np.x === p.x - 1 && np.y === p.y)
      && !isTerrain(terrain, p.x - 2, p.y);
    const canPushRight = !isTerrain(terrain, p.x + 1, p.y)
      && napalmParticles.some(np => np.alive && np.x === p.x + 1 && np.y === p.y)
      && !isTerrain(terrain, p.x + 2, p.y);

    if (canPushLeft || canPushRight) {
      const dir = canPushLeft && canPushRight ? sample([-1, 1]) : (canPushLeft ? -1 : 1);
      pushRow(p.x, p.y, dir);
      return;
    }

    if (p.x === p.emitX && p.y === p.emitY) {
      pushNapalmColumn(p.x, p.y - 1);
    }
    return;
  }

  if (tryFlow(p, p.dir) || trySpill(p, p.dir)) return;

  const otherDir = p.dir === -1 ? 1 : -1;
  if (tryFlow(p, otherDir) || trySpill(p, otherDir)) {
    p.dir = otherDir;
    return;
  }

  if (p.x === p.emitX && p.y === p.emitY) {
    pushNapalmColumn(p.x, p.y - 1);
  }

  // Settle time: spread fire to adjacent terrain if stationary >= 1s
  if (p.x !== prevX || p.y !== prevY) {
    p.settleTime = 0;
  } else {
    p.settleTime += dt;
  }
  if (p.settleTime >= 1) {
    [p.x - 1, p.x + 1].forEach(nx => {
      if (isTerrain(terrain, nx, p.y) && !hasFireAt(nx, p.y)) {
        createFire(nx, p.y, p.source);
        p.alive = false;
        reservedPositions.delete(p.x + ',' + p.y);
      }
    });
  }
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
    foreground.globalAlpha = s.alpha * 0.7;
    drawRect(foreground, s.x, s.y - 1, 3, 3, '#999');
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
  if (idle && particles.length===0 && fireCells.length===0 && smokeParticles.length===0 && napalmParticles.length===0 && state !== 'start-menu' && state !== 'market' && state !== 'round-end' && state !== 'game-over' && state !== 'aim') return;

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
  } else if (state === 'net-menu') {
    drawNetMenuPanel();
  } else if (state === 'net-lobby') {
    drawNetLobbyPanel();
  } else if (state === 'market') {
    drawMarketPanel();
  } else if (state === 'round-end') {
    drawRoundEndPanel();
  } else if (state === 'game-over') {
    drawGameOverPanel();
  }

  drawGameControls();
  drawScreenShake();
}

function drawGameControls() {
  if (state !== 'aim') return;
  const player = players[currentPlayer];
  if (player.ai) return;
  if (networkMode && player.id !== netPlayerId) return;

  const maxPower = player.energy * PLAYER_ENERGY_POWER_MULTIPLIER;

  // ---- Angle gauge (bottom-left) ----
  const cx = 80, cy = 357, r = 60;
  framebuffer.globalAlpha = 0.65;
  framebuffer.beginPath();
  framebuffer.arc(cx, cy, r, Math.PI, 0);
  framebuffer.strokeStyle = '#888';
  framebuffer.lineWidth = 2;
  framebuffer.stroke();
  framebuffer.globalAlpha = 1;

  // Tick marks every 30 degrees
  for (let a = 0; a <= 180; a += 30) {
    const ta = Math.PI + a * Math.PI / 180;
    const inner = r - 8, outer = r;
    drawLine(framebuffer,
      cx + Math.cos(ta) * inner, cy + Math.sin(ta) * inner,
      cx + Math.cos(ta) * outer, cy + Math.sin(ta) * outer,
      '#aaa');
  }

  // Arrow pointer
  const pa = Math.PI + player.a * Math.PI / 180;
  const px = cx + Math.cos(pa) * r;
  const py = cy + Math.sin(pa) * r;
  drawLine(framebuffer, cx, cy, px, py, '#f80');
  const arrowAngle = 0.5;
  const arrowLen = 12;
  const ax1 = px - Math.cos(pa - arrowAngle) * arrowLen;
  const ay1 = py - Math.sin(pa - arrowAngle) * arrowLen;
  const ax2 = px - Math.cos(pa + arrowAngle) * arrowLen;
  const ay2 = py - Math.sin(pa + arrowAngle) * arrowLen;
  drawLine(framebuffer, px, py, ax1, ay1, '#f80');
  drawLine(framebuffer, px, py, ax2, ay2, '#f80');
  framebuffer.beginPath();
  framebuffer.arc(cx, cy, 4, 0, Math.PI * 2);
  framebuffer.fillStyle = '#fa0';
  framebuffer.fill();

  // Angle fine-tune buttons (separated by 1px gap)
  const btnY = 369;
  const btnH = 26;
  framebuffer.globalAlpha = 0.5;
  drawRect(framebuffer, cx - r, btnY, r, btnH, '#555');
  drawRect(framebuffer, cx + 1, btnY, r, btnH, '#555');
  framebuffer.globalAlpha = 0.3;
  drawRect(framebuffer, cx - r, btnY, r, 1, '#fff');
  drawRect(framebuffer, cx + 1, btnY, r, 1, '#fff');
  framebuffer.globalAlpha = 1;
  framebuffer.font = '14px ibm-vga';
  framebuffer.textAlign = 'center';
  framebuffer.textBaseline = 'middle';
  framebuffer.fillStyle = '#fff';
  framebuffer.fillText('<', cx - r/2, btnY + btnH/2);
  framebuffer.fillText('>', cx + 1 + r/2, btnY + btnH/2);

  // ---- Power gauge (bottom-right corner) ----
  const barX = 610, barY = 286, barW = 25, barH = 80;
  const powerRatio = maxPower > 0 ? player.p / maxPower : 0;
  framebuffer.globalAlpha = 0.4;
  drawRect(framebuffer, barX, barY, barW, barH, '#333');
  framebuffer.globalAlpha = 0.7;
  const fillH = Math.round(barH * powerRatio);
  drawRect(framebuffer, barX, barY + barH - fillH, barW, fillH, '#f80');
  framebuffer.globalAlpha = 1;

  // Power ▲ ▼ buttons (1px gap from gauge)
  const btnW = barW;
  framebuffer.globalAlpha = 0.5;
  drawRect(framebuffer, barX, barY - 28 - 1, btnW, 28, '#555');
  drawRect(framebuffer, barX, barY + barH + 1, btnW, 28, '#555');
  framebuffer.globalAlpha = 1;
  framebuffer.font = '10px ibm-bios';
  framebuffer.textAlign = 'center';
  framebuffer.textBaseline = 'middle';
  framebuffer.fillStyle = '#fff';
  framebuffer.fillText('▲', barX + btnW / 2, barY - 14);
  framebuffer.fillText('▼', barX + btnW / 2, barY + barH + 14);

  // ---- FIRE button (center bottom) ----
  framebuffer.globalAlpha = 0.55;
  drawRect(framebuffer, 280, 355, 80, 40, '#c00');
  framebuffer.globalAlpha = 0.3;
  drawRect(framebuffer, 280, 355, 80, 2, '#fff');
  drawRect(framebuffer, 280, 355, 2, 40, '#fff');
  drawRect(framebuffer, 280, 393, 80, 2, '#600');
  drawRect(framebuffer, 358, 355, 2, 40, '#600');
  framebuffer.globalAlpha = 1;
  framebuffer.font = 'bold 16px ibm-vga';
  framebuffer.textAlign = 'center';
  framebuffer.textBaseline = 'middle';
  framebuffer.fillStyle = '#fff';
  framebuffer.fillText('FIRE', 320, 375);

  // ---- Weapon switch (between FIRE and power gauge) ----
  framebuffer.globalAlpha = 0.5;
  drawRect(framebuffer, 385, 360, 140, 28, '#448');
  framebuffer.globalAlpha = 1;
  const weapon = player.weapons[player.currentWeapon];
  const weaponType = WEAPON_TYPES[weapon.type];
  framebuffer.font = '8px ibm-bios';
  framebuffer.textAlign = 'center';
  framebuffer.textBaseline = 'middle';
  framebuffer.fillStyle = '#fff';
  framebuffer.fillText(weaponType.name, 455, 374);
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
    if (!tracerMode && projectile.weapon?.type !== 'smokeTracer') {
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

function drawNetMenuPanel() {
  drawPanelBg(framebuffer);
  const s = netMenuState;
  if (s && s.phase === 'browse') {
    drawPanelTitle(framebuffer, 'JOIN GAME', '#48f');
    drawRoomsList();
    return;
  }
  drawPanelTitle(framebuffer, 'MULTIPLAYER', '#48f');

  drawPanelText(framebuffer, 'Play against other players', PANEL_X+40, 100, '#aaa');

  if (!s || s.phase === 'connecting') {
    drawPanelText(framebuffer, 'CONNECTING...', PANEL_X+40, 140, 'yellow');
    return;
  }

  drawButton(framebuffer, PANEL_X+100, 140, 200, 22, 'HOST GAME', s.selected === 0);
  drawButton(framebuffer, PANEL_X+100, 170, 200, 22, 'JOIN GAME', s.selected === 1);
  drawButton(framebuffer, PANEL_X+100, 200, 200, 22, 'BACK', s.selected === 2);
  if (netError) {
    drawPanelText(framebuffer, netError, PANEL_X+40, 240, '#f66');
  }
  drawPanelText(framebuffer, `Relay: ${netIsConnected() ? 'connected' : 'offline'}`, PANEL_X+40, 270, '#aaa');
}

function drawRoomsList() {
  const s = netMenuState;
  if (!s) return;
  const rooms = s.rooms || [];
  if (s.loading && !rooms.length) {
    drawPanelText(framebuffer, 'SEARCHING...', PANEL_X+40, 130, 'yellow');
  }
  if (s.error) {
    drawPanelText(framebuffer, s.error, PANEL_X+40, 130, '#f66');
  }
  if (!rooms.length && !s.loading && !s.error) {
    drawPanelText(framebuffer, 'No open games', PANEL_X+40, 130, '#aaa');
  }
  for (let i = 0; i < Math.min(8, rooms.length); i++) {
    const idx = s.scrollOffset + i;
    if (idx >= rooms.length) break;
    const r = rooms[idx];
    const isSel = s.selected === idx;
    const y = 115 + i*16;
    drawPanelText(framebuffer, `${r.room}   ${r.host}`, PANEL_X+40, y, isSel ? 'yellow' : 'white');
    drawPanelText(framebuffer, `${r.players}/${MAX_PLAYERS}`, PANEL_X+PANEL_WIDTH-40, y, isSel ? 'yellow' : '#aaa', 'right');
  }
  drawButton(framebuffer, PANEL_X+40, 300, 90, 22, 'REFRESH', s.selected === rooms.length);
  drawButton(framebuffer, PANEL_X+150, 300, 90, 22, 'BACK', s.selected === rooms.length + 1);
}

function drawNetLobbyPanel() {
  drawPanelBg(framebuffer);
  drawPanelTitle(framebuffer, 'LOBBY', '#48f');

  drawPanelText(framebuffer, `Room: ${netRoom()}`, PANEL_X+40, 92, 'yellow');

  if (!netLobby) return;

  const roster = netLobby.players;
  let y = 115;
  for (let i = 0; i < Math.min(6, roster.length); i++) {
    const p = roster[i];
    const isMe = p.id === netPlayerId;
    const isHostRow = netIsHost() && i === 0;
    let status = isHostRow ? 'HOST' : p.ready ? 'READY' : 'WAIT';
    let statusColor = isHostRow ? 'yellow' : p.ready ? '#0c8' : '#888';
    if (isMe && !isHostRow) status = p.ready ? 'READY (YOU)' : 'YOU';
    drawPanelText(framebuffer, p.name, PANEL_X+40, y, isMe ? 'yellow' : 'white');
    drawPanelText(framebuffer, status, PANEL_X+PANEL_WIDTH-60, y, statusColor, 'right');
    y += 16;
  }

  if (netIsHost()) {
    const config = netLobby.config;
    const values = [
      String(config.players),
      String(config.rounds),
      config.terrain === null ? 'Random' : config.terrain.charAt(0).toUpperCase() + config.terrain.slice(1),
    ];
    const labels = ['Players', 'Rounds', 'Terrain'];
    let cy = 232;
    for (let i = 0; i < 3; i++) {
      const isSelected = menuState && menuState.selected === i;
      drawPanelText(framebuffer, labels[i], PANEL_X+40, cy, isSelected ? 'yellow' : 'white');
      drawButton(framebuffer, PANEL_X+262, cy, 24, 18, '\u25C0', isSelected);
      drawPanelText(framebuffer, values[i], PANEL_X+322, cy, isSelected ? 'yellow' : 'white', 'center');
      drawButton(framebuffer, PANEL_X+355, cy, 24, 18, '\u25B6', isSelected);
      cy += 26;
    }
    if (menuState && menuState.hint) {
      drawPanelText(framebuffer, menuState.hint, PANEL_X+40, 296, '#f66');
    }
    const startWarn = menuState && menuState.startWarn;
    drawButton(framebuffer, PANEL_X+100, 318, 200, 22, startWarn ? 'START ANYWAY?' : 'START GAME', !!startWarn);
  } else {
    const myReady = menuState && menuState.myReady;
    drawButton(framebuffer, PANEL_X+100, 318, 200, 22, myReady ? 'NOT READY' : 'READY', myReady);
    const readyCount = netLobby.players.filter(p => p.ready || p.id === netPlayerId).length;
    drawPanelText(framebuffer, `Ready ${readyCount}/${netLobby.players.length}`, PANEL_X+40, 296, '#aaa');
  }
}

function drawStartMenuPanel() {
  drawPanelBg(framebuffer);
  drawPanelTitleFancy(framebuffer, 'RAVAGED PLANET', performance.now() / 1000);

  const optionValues = [[3,4,5,6,7,8,9,10], [1,2,3,4,5,6,7,8,9,10], ['Random','Mountain','Sand'], ['On','Off'], ['Single','Multi']];
  const labels = ['Players', 'Rounds', 'Terrain', 'Permanent tracer mode', 'Mode'];
  const y = 120;
  const labelW = 168;
  const arrowW = 24, arrowH = 18;

  for (let i=0; i<labels.length; i++) {
    const rowY = y + i * 30;
    const isSelected = menuState.selected === i;

    drawPanelText(framebuffer, labels[i], PANEL_X + 30, rowY + 5, isSelected ? 'yellow' : 'white');

    const v = optionValues[i][menuState.values[i]];
    drawButton(framebuffer, PANEL_X+262, rowY, arrowW, arrowH, '\u25C0', isSelected);
    drawPanelText(framebuffer, '' + v, PANEL_X+322, rowY + 5, isSelected ? 'yellow' : 'white', 'center');
    drawButton(framebuffer, PANEL_X+355, rowY, arrowW, arrowH, '\u25B6', isSelected);
  }

  drawPanelDivider(framebuffer, 308);
  drawButton(framebuffer, PANEL_X+100, 318, 200, 22, 'START GAME', false);
}

function drawMarketPanel() {
  drawPanelBg(framebuffer);
  drawPanelTitle(framebuffer, 'MARKET', '#0c8');

  const isClient = networkMode && !netIsHost();
  if (isClient && menuState && menuState.waitingForHost) {
    const cx = PANEL_X + PANEL_WIDTH / 2;
    drawPanelText(framebuffer, 'WAITING FOR HOST', cx, 150, 'yellow', 'center');
    drawPanelText(framebuffer, 'TO START ROUND...', cx, 170, 'yellow', 'center');
    drawButton(framebuffer, PANEL_X+100, 318, 200, 22, 'BACK TO SHOP', false);
    return;
  }

  const humanPlayer = myPlayer();

  const marketItems = Object.keys(MARKET_ITEMS).filter(item => !(tracerMode && item === 'smokeTracer'));
  const y = 94;
  const maxVisible = 8;
  const itemH = 18;

  // Up/down arrow buttons (left side) — 3× taller
  const arrowX = PANEL_X + 15;
  const arrowW = 22;
  const arrowH = 54;
  drawButton(framebuffer, arrowX, y, arrowW, arrowH, '\u25B2', false);
  drawButton(framebuffer, arrowX, y + (maxVisible - 1) * itemH - arrowH + itemH, arrowW, arrowH, '\u25BC', false);

  const listX = PANEL_X + 40;
  const listW = 340;

  for (let i = 0; i < Math.min(maxVisible, marketItems.length); i++) {
    const itemIndex = i + (menuState ? menuState.scrollOffset : 0);
    if (itemIndex >= marketItems.length) break;

    const item = marketItems[itemIndex];
    const itemData = MARKET_ITEMS[item];
    const isSelected = menuState && menuState.selected === itemIndex;
    const color = isSelected ? 'yellow' : 'white';

    const rowY = y + i * itemH;

    let ammoText = '';
    if (humanPlayer) {
      if (item === 'parachute') {
        const t = humanPlayer.tools.find(x => x.type === 'parachute');
        ammoText = t ? `(x${t.ammo})` : '-';
      } else if (SHIELD_TYPES[item]) {
        const owned = humanPlayer.shield && humanPlayer.shield.type === item;
        ammoText = owned ? `(x${humanPlayer.shield.ammo})` : '-';
      } else {
        const weapon = humanPlayer.weapons.find(w => w.type === item);
        if (weapon) {
          ammoText = `(x${weapon.ammo})`;
        } else {
          ammoText = '-';
        }
      }
    }

    const priceText = itemData.price === 0 ? 'FREE' : `$${itemData.price}`;
    if (isSelected) {
      drawRect(framebuffer, listX, rowY, listW, itemH, '#558');
    }
    drawPanelText(framebuffer, itemData.name || (WEAPON_TYPES[item] ? WEAPON_TYPES[item].name : item.charAt(0).toUpperCase() + item.slice(1)), listX + 12, rowY + 5, color);
    drawPanelText(framebuffer, priceText, listX + 150, rowY + 5, isSelected ? 'yellow' : '#aaa');
    drawPanelText(framebuffer, ammoText, listX + 230, rowY + 5, isSelected ? 'yellow' : '#aaa');
  }

  // Buy button
  const btnY = 246;
  const btnH = 22;
  drawButton(framebuffer, listX + 20, btnY, 90, btnH, 'BUY', false);
  const wallet = networkMode ? (humanPlayer ? humanPlayer.score : 0) : score;
  drawPanelText(framebuffer, `Score: ${wallet}`, listX + 212, btnY + 1, 'yellow');

  drawPanelDivider(framebuffer, 278);
  drawButton(framebuffer, PANEL_X+100, 318, 200, 22, 'GO TO BATTLE', false);
}

function drawRoundEndPanel() {
  drawPanelBg(framebuffer);
  drawPanelTitle(framebuffer, `Round ${round} Complete!`, '#48f');

  const y = 100;
  const sortedPlayers = [...players].sort((a, b) => {
    if (a === winner) return -1;
    if (b === winner) return 1;
    return b.deathOrder - a.deathOrder;
  });

  // Column headers
  drawPanelText(framebuffer, 'Player', 155, y, '#aaa', 'left');
  drawPanelText(framebuffer, 'Kills', 300, y, '#aaa', 'center');
  drawPanelText(framebuffer, 'Score', 435, y, '#aaa', 'center');

  // Player rows
  for (let i=0; i<sortedPlayers.length; i++) {
    const p = sortedPlayers[i];
    const rowY = y + 20 + i * 16;
    const color = p === winner ? 'yellow' : 'white';
    const roundScore = p.kills * SCORE_PER_KILL + (p === winner ? SCORE_FOR_WIN : 0);
    drawPanelText(framebuffer, p.name, 155, rowY, color, 'left');
    drawPanelText(framebuffer, ''+p.kills, 300, rowY, color, 'center');
    drawPanelText(framebuffer, ''+roundScore, 435, rowY, color, 'center');
  }

  drawPanelDivider(framebuffer, 308);
  drawButton(framebuffer, PANEL_X+100, 318, 200, 22, 'CONTINUE', false);
}

function drawGameOverPanel() {
  drawPanelBg(framebuffer);
  drawPanelTitle(framebuffer, 'GAME OVER', '#e22');

  const sortedPlayers = [...players].sort((a, b) => b.wins - a.wins || b.kills - a.kills);
  const y = 100;

  // Column headers
  drawPanelText(framebuffer, 'Player', 155, y, '#aaa', 'left');
  drawPanelText(framebuffer, 'Wins', 240, y, '#aaa', 'center');
  drawPanelText(framebuffer, 'Kills', 310, y, '#aaa', 'center');
  drawPanelText(framebuffer, 'Shots', 380, y, '#aaa', 'center');
  drawPanelText(framebuffer, 'Score', 450, y, '#aaa', 'center');

  // Player rows
  for (let i=0; i<sortedPlayers.length; i++) {
    const p = sortedPlayers[i];
    const rowY = y + 20 + i * 16;
    const color = i === 0 ? 'yellow' : 'white';
    drawPanelText(framebuffer, p.name, 155, rowY, color, 'left');
    drawPanelText(framebuffer, ''+p.wins, 240, rowY, color, 'center');
    drawPanelText(framebuffer, ''+p.kills, 310, rowY, color, 'center');
    drawPanelText(framebuffer, ''+p.shotsFired, 380, rowY, color, 'center');
    drawPanelText(framebuffer, ''+p.totalEarned, 450, rowY, color, 'center');
  }

  drawPanelDivider(framebuffer, 280);
  drawButton(framebuffer, PANEL_X+100, 290, 200, 22, 'START MENU', false);
}

function drawScreenShake() {
  const x = randomInt(-screenShake, screenShake);
  const y = randomInt(-screenShake, screenShake);
  framebuffer.canvas.style.transform = `translate(${x}px, ${y}px)`;
}

function drawStatus() {
  if (state === 'start-menu' || state === 'net-menu' || state === 'net-lobby' || state === 'market' || state === 'round-end' || state === 'game-over') {
    return;
  }

  const player = players[currentPlayer];
  if (!player) return;
  const {currentWeapon} = player;
  const weapon = player.weapons[currentWeapon];
  if (!weapon) return;
  const weaponType = WEAPON_TYPES[weapon.type];
  drawText(foreground, `${player.name}   NRG:${Math.round(player.energy)}   AIM:${player.a}   PWR:${player.p}   SHD:${player.shield?Math.round(player.shield.energy):0}   ${clamp(0, weapon.ammo, 99)} ${weaponType.name}`, 8, 8, player.c, 'left');
  drawText(foreground, `WIND: ${wind<=0?'<':''}${Math.abs(wind)}${wind>=0?'>':''}`, W-8, 8, 'white', 'right');
  drawText(foreground, `Round: ${round}/${totalRounds}   Score: ${score}`, W-8, 18, 'white', 'right');
}

loop((deltaTime) => {
  dt = deltaTime;
  update();
  draw();
});
