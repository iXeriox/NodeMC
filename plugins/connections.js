'use strict';

const mc = require('minecraft-protocol');

module.exports = {
  name: 'connections',
  version: '1.0.0',
  dependencies: ['world', 'chat'],

  onEnable(api) {
    const worldService = api.getService('world');
    const commands = api.getService('commands');
    let networkServer = null;
    let tickTimer = null;

    const broadcastPacket = (packetName, data, excluded = null) => {
      for (const player of api.server.players.values()) {
        if (!player.spawned || player === excluded || player.client.ended) continue;
        player.client.write(packetName, data);
      }
    };
    const sendMessage = (player, message, color = 'white') => {
      if (!player?.client || player.client.ended) return;
      player.client.write('system_chat', {content: JSON.stringify({text: message, color}), isActionBar: false});
    };
    const sendComponent = (player, component) => {
      if (!player?.client || player.client.ended) return;
      player.client.write('system_chat', {content: JSON.stringify(component), isActionBar: false});
    };
    const broadcastMessage = (message, color = 'white') => {
      api.emit('chatBroadcast', {message, color, timestamp: Date.now()});
      for (const player of api.server.players.values()) sendMessage(player, message, color);
    };

    api.registerService('connections', {broadcastPacket, broadcastMessage, sendMessage, sendComponent});
    api.registerEvent('worldChunksReady', ({player, chunks}) => {
      if (!player.spawned || player.client.ended) return;
      const centerX = Math.floor(player.position.x / 16);
      const centerZ = Math.floor(player.position.z / 16);
      const keepRadius = api.server.config.viewDistance + api.server.config.worldExpansionMargin;
      for (const key of Array.from(player.loadedChunks)) {
        const [x, z] = key.split(',').map(Number);
        if (Math.abs(x - centerX) <= keepRadius && Math.abs(z - centerZ) <= keepRadius) continue;
        player.client.write('unload_chunk', {chunkX: x, chunkZ: z});
        player.loadedChunks.delete(key);
      }
      for (const chunk of chunks) {
        const key = `${chunk.x},${chunk.z}`;
        if (player.loadedChunks.has(key)) continue;
        worldService.sendChunk(player.client, chunk);
        player.loadedChunks.add(key);
      }
    });
    api.registerService('connections', {broadcastPacket, broadcastMessage, sendMessage});
    api.registerEvent('serverReady', () => {
      networkServer = mc.createServer({
        host: api.server.config.host,
        port: api.server.config.port,
        version: api.server.config.version,
        motd: api.server.config.motd,
        maxPlayers: api.server.config.maxPlayers,
        'max-players': api.server.config.maxPlayers,
        'online-mode': api.server.config.onlineMode,
        encryption: api.server.config.onlineMode,
        keepAlive: true,
        hideErrors: false
      });
      networkServer.on('login', client => connect(client, api, worldService, commands, broadcastMessage));
      networkServer.on('error', error => api.logger.error('Minecraft listener error:', error));
      networkServer.on('listening', () => api.logger.log(`Accepting players on ${api.server.config.host}:${api.server.config.port}`));
      let tickCount = 0;
      tickTimer = setInterval(() => api.emit('tick', {tick: ++tickCount, now: Date.now()}), 50);
      tickTimer = setInterval(() => {
        const world = worldService.world;
        world.worldTime++;
        api.emit('tick', {time: world.worldTime});
        broadcastPacket('time_update', {age: [0, world.worldTime], time: [0, world.worldTime % 24000]});
      }, 50);
    });

    this.close = () => {
      if (tickTimer) clearInterval(tickTimer);
      for (const player of api.server.players.values()) {
        if (!player.client.ended) player.client.end('Server closed');
      }
      if (networkServer) networkServer.close();
    };
  },

  onDisable() {
    this.close?.();
  }
};

function connect(client, api, worldService, commands, broadcastMessage) {
  if (!api.server.ready) {
    client.end('Server is still starting');
    return;
  }
  const mcData = require('minecraft-data')(api.server.config.version);
  const spawn = worldService.world.spawnPoint;
  const player = {
    id: String(client.id),
    client,
    socket: client.socket,
    name: client.username,
    uuid: client.uuid,
    spawned: false,
    position: {...spawn},
    rotation: {yaw: 0, pitch: 0},
    health: 20,
    food: 20,
    gamemode: 0,
    loadedChunks: new Set(),
    lastChunk: null
    gamemode: 1
  };
  api.server.players.set(player.id, player);

  client.on('packet', (data, metadata) => {
    api.emit('packetReceived', {player, packetName: metadata.name, state: metadata.state, data});
    updatePosition(player, data, metadata.name);
    if (metadata.name === 'teleport_confirm' && data.teleportId === 1 && !player.spawned) {
      client.write('abilities', {flags: 0, flyingSpeed: 0.05, walkingSpeed: 0.1});
      client.write('abilities', {flags: 0x02 | 0x04, flyingSpeed: 0.05, walkingSpeed: 0.1});
      commands.sendTree(client);
      client.write('held_item_slot', {slot: 0});
      player.spawned = true;
      broadcastMessage(`${player.name} joined the game`, 'yellow');
      api.emit('playerJoin', player);
    }
    if (metadata.name === 'chat_message' || metadata.name === 'chat_command') {
      const raw = data.message || data.command || data.plainMessage || '';
      const message = metadata.name === 'chat_command' ? `/${raw}` : raw;
      const event = {player, message, timestamp: Date.now(), cancelled: false};
      api.emit('playerChat', event);
      if (!event.cancelled) broadcastMessage(`<${player.name}> ${message}`, 'white');
    }
  });
  client.on('error', error => api.logger.error(`Client ${player.name}:`, error.message));
  client.once('end', reason => {
    if (!api.server.players.delete(player.id)) return;
    if (player.spawned) broadcastMessage(`${player.name} left the game`, 'yellow');
    api.emit('playerLeave', {player, reason});
  });

  client.write('login', {
    ...mcData.loginPacket,
    entityId: client.id,
    isHardcore: false,
    gameMode: player.gamemode,
    previousGameMode: -1,
    hashedSeed: [0, 0],
    maxPlayers: api.server.config.maxPlayers,
    viewDistance: api.server.config.viewDistance,
    simulationDistance: api.server.config.viewDistance,
    reducedDebugInfo: false,
    enableRespawnScreen: true,
    isDebug: false,
    isFlat: false,
    enforceSecureChat: false
  });
  client.write('position', {x: spawn.x + 0.5, y: spawn.y + 1, z: spawn.z + 0.5, yaw: 0, pitch: 0, flags: 0, teleportId: 1});

  const radius = api.server.config.viewDistance;
  const centerX = Math.floor(spawn.x / 16);
  const centerZ = Math.floor(spawn.z / 16);
  const chunks = [];
  for (let x = centerX - radius; x <= centerX + radius; x++) {
    for (let z = centerZ - radius; z <= centerZ + radius; z++) {
      const chunk = worldService.getChunk(x, z);
      if (chunk) {
        chunks.push(chunk);
        player.loadedChunks.add(`${x},${z}`);
      }
      if (chunk) chunks.push(chunk);
    }
  }
  sendChunkBatches(client, chunks, worldService);
}

function sendChunkBatches(client, chunks, worldService) {
  let offset = 0;
  const sendNext = () => {
    if (client.ended) return;
    for (const chunk of chunks.slice(offset, offset + 8)) worldService.sendChunk(client, chunk);
    offset += 8;
    if (offset < chunks.length) setImmediate(sendNext);
  };
  sendNext();
}

function updatePosition(player, data, packetName) {
  if (!['position', 'position_look', 'look'].includes(packetName)) return;
  player.position = {x: data.x ?? player.position.x, y: data.y ?? player.position.y, z: data.z ?? player.position.z};
  player.rotation = {yaw: data.yaw ?? player.rotation.yaw, pitch: data.pitch ?? player.rotation.pitch};
  const chunk = `${Math.floor(player.position.x / 16)},${Math.floor(player.position.z / 16)}`;
  if (chunk !== player.lastChunk) {
    player.lastChunk = chunk;
    require('../src/events').emit('playerChunkChange', player);
  }
}
