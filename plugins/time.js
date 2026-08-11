'use strict';

module.exports = {
  name: 'time',
  version: '1.0.0',
  dependencies: ['connections'],
  onEnable(api) {
    const connections = api.getService('connections');
    api.registerEvent('tick', ({tick}) => {
      const world = api.getService('world').world;
      world.worldTime += api.server.config.timeScale;
      if (tick % 20 === 0) connections.broadcastPacket('time_update', {
        age: [0, Math.floor(world.worldTime)],
        time: [0, Math.floor(world.worldTime % 24000)]
      });
    });
  }
};
