import {WebSocketServer} from 'ws';
import {randomUUID} from 'node:crypto';
import {MSG} from '../src/net/protocol.js';

const PORT = process.env.PORT || 8090;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

const rooms = new Map();

function makeRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
  } while (rooms.has(code));
  return code;
}

function roomPlayers(room) {
  return [...room.clients.values()].map(c => ({id: c.id, name: c.name}));
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function sendRoster(room) {
  const roster = {type: MSG.ROSTER, players: roomPlayers(room)};
  send(room.host.ws, roster);
}

function removeClient(room, client) {
  room.clients.delete(client.id);
  if (room.clients.size === 0) {
    rooms.delete(room.code);
    console.log(`room ${room.code} closed (empty)`);
    return;
  }
  if (client.host) {
    for (const c of room.clients.values()) send(c.ws, {type: MSG.HOST_LEFT});
    rooms.delete(room.code);
    console.log(`room ${room.code} closed (host left)`);
  } else {
    sendRoster(room);
    console.log(`${client.name} (${client.id}) left room ${room.code}`);
  }
}

const wss = new WebSocketServer({port: PORT});

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  let client = null;
  let room = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, {type: MSG.ERROR, message: 'bad message'});
      return;
    }

    if (msg.type === MSG.JOIN) {
      if (client) {
        send(ws, {type: MSG.ERROR, message: 'already in a room'});
        return;
      }
      const code = String(msg.room || '').toUpperCase().trim();
      if (!new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(code)) {
        send(ws, {type: MSG.ERROR, message: 'invalid room code'});
        return;
      }
      const name = String(msg.name || 'Player').slice(0, 20);
      const id = randomUUID();

      room = rooms.get(code);
      if (!room) {
        room = {code, host: null, clients: new Map()};
        rooms.set(code, room);
      }

      const isHost = room.clients.size === 0;
      client = {id, name, ws, host: isHost};
      room.clients.set(id, client);
      if (isHost) room.host = client;

      send(ws, {type: MSG.JOINED, id, host: isHost, room: code});
      if (isHost) {
        console.log(`room ${code} created by ${name} (${ip})`);
        sendRoster(room);
      } else {
        console.log(`${name} (${ip}) joined room ${code}`);
        sendRoster(room);
      }
      return;
    }

    if (msg.type === MSG.LEAVE) {
      ws.close();
      return;
    }

    if (!client || !room) {
      send(ws, {type: MSG.ERROR, message: 'not in a room'});
      return;
    }

    if (client.host) {
      if (msg.type === MSG.BROADCAST) {
        for (const c of room.clients.values()) {
          if (!c.host) send(c.ws, msg.payload);
        }
      } else {
        send(ws, {type: MSG.ERROR, message: `unknown host message type: ${msg.type}`});
      }
    } else {
      if (msg.type === MSG.COMMAND) {
        send(room.host.ws, msg);
      } else {
        send(ws, {type: MSG.ERROR, message: `unknown client message type: ${msg.type}`});
      }
    }
  });

  ws.on('close', () => {
    if (client && room) removeClient(room, client);
  });

  ws.on('error', (err) => {
    console.error(`client ${ip} error:`, err.message);
  });
});

console.log(`ravaged-planet relay listening on :${PORT}`);
