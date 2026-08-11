'use strict';

const {randomUUID} = require('node:crypto');

module.exports = {
  name: 'mobs',
  version: '1.0.0',
  dependencies: ['connections'],

  onEnable(api) {
    const connections = api.getService('connections');
    const world = api.getService('world');
    const mcData = require('minecraft-data')(api.server.config.version);
    const mobTypes = ['cow', 'pig', 'sheep', 'chicken']
      .map(name => mcData.entitiesByName[name])
      .filter(Boolean);
    const mobs = new Map();
    let nextEntityId = 100000;

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
        const mob = {entityId: nextEntityId++, uuid: randomUUID(), type: type.id, name: type.name, x: x + 0.5, y, z: z + 0.5};
        mobs.set(mob.entityId, mob);
        connections.broadcastPacket('spawn_entity', packet(mob));
        api.emit('mobSpawn', mob);
      }
    };

    api.registerEvent('playerJoin', player => {
      for (const mob of mobs.values()) player.client.write('spawn_entity', packet(mob));
      spawnNear(player);
    });
    api.registerEvent('tick', ({time}) => {
      if (time % 200 !== 0 || api.server.players.size === 0) return;
      const players = Array.from(api.server.players.values()).filter(player => player.spawned);
      if (players.length) spawnNear(players[Math.floor(Math.random() * players.length)]);
    });
    api.registerService('mobs', {list: () => Array.from(mobs.values()), spawnNear});
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
