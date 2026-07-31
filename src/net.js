import {MSG, HOST_MSG} from './net/protocol.js?v=20';

let socket = null;
let myId = null;
let isHost = false;
let room = null;
let myName = '';
let handlers = [];
let statusHandlers = [];
let status = 'disconnected';

function relayUrl() {
  const params = new URLSearchParams(location.search);
  const override = params.get('relay');
  if (override) return override;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export function netStatus() {
  return status;
}

export function netIsConnected() {
  return status === 'connected';
}

export function netIsHost() {
  return isHost;
}

export function netRoom() {
  return room;
}

export function netMyId() {
  return myId;
}

export function netMakeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function netOnMessage(fn) {
  handlers.push(fn);
}

export function netOnStatus(fn) {
  statusHandlers.push(fn);
}

function emit(message) {
  for (const fn of handlers) fn(message);
}

function setStatus(value) {
  status = value;
  for (const fn of statusHandlers) fn(value);
}

export function netConnect(name, code) {
  return new Promise((resolve, reject) => {
    if (socket) {
      try { socket.close(); } catch {}
      socket = null;
    }
    myName = name;
    setStatus('connecting');
    let joined = false;
    socket = new WebSocket(relayUrl());

    socket.onopen = () => {
      socket.send(JSON.stringify({type: MSG.JOIN, room: code, name}));
    };

    socket.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === MSG.JOINED) {
        joined = true;
        myId = msg.id;
        isHost = msg.host;
        room = msg.room;
        setStatus('connected');
        resolve({id: msg.id, host: msg.host, room: msg.room});
        return;
      }
      emit(msg);
    };

    socket.onerror = () => {
      setStatus('disconnected');
      if (!joined) reject(new Error('connection failed'));
    };

    socket.onclose = () => {
      setStatus('disconnected');
      socket = null;
      myId = null;
      isHost = false;
      room = null;
      if (!joined) reject(new Error('connection closed'));
    };
  });
}

export function netSendCommand(cmd) {
  if (!socket || status !== 'connected') return;
  socket.send(JSON.stringify({type: MSG.COMMAND, playerId: myId, cmd}));
}

export function netBroadcast(payload) {
  if (!socket || status !== 'connected' || !isHost) return;
  socket.send(JSON.stringify({type: MSG.BROADCAST, payload}));
}

export function netDisconnect() {
  if (socket) {
    try {
      socket.send(JSON.stringify({type: MSG.LEAVE}));
    } catch {}
    try { socket.close(); } catch {}
  }
  socket = null;
  myId = null;
  isHost = false;
  room = null;
  setStatus('disconnected');
}
