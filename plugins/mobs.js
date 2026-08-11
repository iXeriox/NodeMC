'use strict';

const {randomUUID} = require('node:crypto');

module.exports = {
  name: 'mobs',
  version: '1.0.0',
  description: 'Spawns and moves passive mobs and building vendors.',
  dependencies: ['connections'],

  onEnable(api) {
    const connections = api.getService('connections');
    const world = api.getService('world');
    const mcData = require('minecraft-data')(api.server.config.version);
    const mobTypes = ['cow', 'pig', 'sheep', 'chicken']
      .map(name => mcData.entitiesByName[name])
      .filter(Boolean);
    const mobs = new Map();
    const vendorCooldowns = new Map();
    let nextEntityId = 100000;
    const vendorType = mcData.entitiesByName.villager;
    const vendorLocations = new Set();

    const addVendors = chunks => {
      if (!vendorType) return;
      for (const chunk of chunks) for (const marker of chunk.vendors || []) {
        const key = `${marker.x},${marker.y},${marker.z}`;
        if (vendorLocations.has(key)) continue;
        vendorLocations.add(key);
        const mob = {entityId: nextEntityId++, uuid: randomUUID(), type: vendorType.id, name: 'vendor', ...marker, target: null, stationary: true};
        mobs.set(mob.entityId, mob);
        connections.broadcastPacket('spawn_entity', packet(mob));
      }
    };

    const spawnNear = player => {
      if (!mobTypes.length || mobs.size >= 24) return;
      for (let count = 0; count < 3 && mobs.size < 24; count++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 8 + Math.random() * 20;
        const x = Math.floor(player.position.x + Math.cos(angle) * distance);
        const z = Math.floor(player.position.z + Math.sin(angle) * distance);
        const chunk = world.getChunk(Math.floor(x / 16), Math.floor(z / 16));
        if (!chunk?.surfaceHeights) continue;
        const localX = ((x % 16) + 16) % 16;
        const localZ = ((z % 16) + 16) % 16;
        const y = chunk.surfaceHeights[localZ * 16 + localX] + 1;
        const type = mobTypes[Math.floor(Math.random() * mobTypes.length)];
        const mob = {entityId: nextEntityId++, uuid: randomUUID(), type: type.id, name: type.name, x: x + 0.5, y, z: z + 0.5, target: null};
        mobs.set(mob.entityId, mob);
        connections.broadcastPacket('spawn_entity', packet(mob));
        api.emit('mobSpawn', mob);
      }
    };

    api.registerEvent('playerJoin', player => {
      addVendors(world.world.chunks.values());
      for (const mob of mobs.values()) player.client.write('spawn_entity', packet(mob));
      spawnNear(player);
    });
    api.registerEvent('worldChunksReady', ({chunks}) => addVendors(chunks));
    api.registerEvent('packetReceived', ({player, packetName, data}) => {
      if (packetName !== 'use_entity') return;
      const mob = mobs.get(data.target);
      if (!mob?.stationary) return;
      const lastVisit = vendorCooldowns.get(player.uuid) || 0;
      if (Date.now() - lastVisit < 300000) {
        connections.sendMessage(player, 'Vendor: Come back later for more supplies.', 'yellow');
        return;
      }
      vendorCooldowns.set(player.uuid, Date.now());
      const bread = mcData.itemsByName.bread;
      player.client.write('set_slot', {windowId: 0, stateId: 0, slot: 37, item: {present: true, itemId: bread.id, itemCount: 4, nbtData: undefined}});
      connections.sendMessage(player, 'Vendor: Take this food for your journey.', 'green');
    });
    api.registerEvent('tick', ({tick}) => {
      if (tick % 10 === 0) {
        for (const mob of mobs.values()) moveMob(mob, world, connections);
      }
      if (tick % 200 !== 0 || api.server.players.size === 0) return;
      const players = Array.from(api.server.players.values()).filter(player => player.spawned);
      if (players.length) spawnNear(players[Math.floor(Math.random() * players.length)]);
    });
    api.registerService('mobs', {list: () => Array.from(mobs.values()), get: id => mobs.get(id), spawnNear});
    this.removeAll = () => {
      if (mobs.size) connections.broadcastPacket('entity_destroy', {entityIds: Array.from(mobs.keys())});
      mobs.clear();
    };
    api.logger.log(`Passive mob spawning enabled with ${mobTypes.length} mob types`);
  },

  onDisable() {
    this.removeAll?.();
  }
};

function moveMob(mob, world, connections) {
  if (mob.stationary) return;
  if (!mob.target || Math.hypot(mob.target.x - mob.x, mob.target.z - mob.z) < 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 3 + Math.random() * 8;
    mob.target = {x: mob.x + Math.cos(angle) * distance, z: mob.z + Math.sin(angle) * distance};
  }
  const dx = mob.target.x - mob.x;
  const dz = mob.target.z - mob.z;
  const length = Math.hypot(dx, dz);
  if (!length) return;
  const nextX = mob.x + dx / length * 0.25;
  const nextZ = mob.z + dz / length * 0.25;
  const chunk = world.getChunk(Math.floor(nextX / 16), Math.floor(nextZ / 16));
  if (!chunk?.surfaceHeights) { mob.target = null; return; }
  const localX = ((Math.floor(nextX) % 16) + 16) % 16;
  const localZ = ((Math.floor(nextZ) % 16) + 16) % 16;
  const nextY = chunk.surfaceHeights[localZ * 16 + localX] + 1;
  if (Math.abs(nextY - mob.y) > 1.1) { mob.target = null; return; }
  mob.x = nextX;
  mob.y = nextY;
  mob.z = nextZ;
  const yaw = Math.floor((Math.atan2(-dx, dz) * 256 / (Math.PI * 2))) & 0xff;
  connections.broadcastPacket('entity_teleport', {entityId: mob.entityId, x: mob.x, y: mob.y, z: mob.z, yaw, pitch: 0, onGround: true});
}

function packet(mob) {
  return {
    entityId: mob.entityId,
    objectUUID: mob.uuid,
    type: mob.type,
    x: mob.x,
    y: mob.y,
    z: mob.z,
    pitch: 0,
    yaw: 0,
    headPitch: 0,
    objectData: 0,
    velocity: {x: 0, y: 0, z: 0}
  };
}
