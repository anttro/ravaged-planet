// Wire protocol shared between the browser client, the host and the relay.
// All messages are JSON objects with a `type` field.

export const MSG = {
  // client -> relay
  JOIN: 'join',           // {room, name}
  LEAVE: 'leave',         // {}
  LIST_ROOMS: 'list-rooms', // {}  fetch open rooms before joining
  // relay -> client
  JOINED: 'joined',       // {id, host, room}
  ROSTER: 'roster',       // {players: [{id, name}]}  (host only)
  ROOMS: 'rooms',         // {rooms: [{room, players, host}]}
  HOST_LEFT: 'host-left', // {}
  ERROR: 'error',         // {message}
  // client -> relay -> host (non-host clients only)
  COMMAND: 'command',     // {playerId, cmd}
  // host -> relay -> other clients (verbatim payload)
  BROADCAST: 'broadcast', // {payload}
};

export const CMD = {
  READY: 'ready',             // lobby: client is ready
  UNREADY: 'unready',         // lobby: client no longer ready
  CONFIG: 'config',           // lobby: host updates lobby config {players, rounds, terrain}
  START: 'start',             // lobby: host starts the game
  FIRE: 'fire',               // {a, p, weaponIndex}
  BUY: 'buy',                 // {item}
  SELL: 'sell',               // {item}
  CHAT: 'chat',               // {text}
};

export const HOST_MSG = {
  LOBBY: 'lobby',             // {players: [{id, name, ready}], config: {players, rounds, terrain}}
  WORLD: 'world',             // {snap}
  TERRAIN: 'terrain',         // {terrain: {palette: [hex], tops: b64(Uint16), colors: b64(Uint8)}} column-heights
  EVENT: 'event',             // {kind, ...}
  START_ROUND: 'start-round', // {}  round N begins
  END_GAME: 'end-game',       // {reason}
};
