'use strict';

// Vanilla-style weather with only two tiny packets per transition. Keeping the
// decision on the existing low-frequency tick avoids timers and per-player work.
module.exports = {
  name: 'weather',
  version: '1.0.0',
  dependencies: ['connections'],

  onEnable(api) {
    const connections = api.getService('connections');
    let raining = false;
    let changeAt = 20 * 60 * 8;
    const sendWeather = player => {
      player.client.write('game_state_change', {reason: raining ? 1 : 2, gameMode: 0});
      player.client.write('game_state_change', {reason: 7, gameMode: raining ? 1 : 0});
    };
    api.registerEvent('playerJoin', sendWeather);
    api.registerEvent('tick', ({tick}) => {
      if (tick < changeAt) return;
      raining = !raining;
      changeAt = tick + 20 * 60 * (raining ? 3 + Math.floor(Math.random() * 5) : 8 + Math.floor(Math.random() * 8));
      for (const player of api.server.players.values()) if (player.spawned && !player.client.ended) sendWeather(player);
      connections.broadcastMessage(raining ? 'Rain clouds are gathering.' : 'The weather is clearing.', 'gray');
    });
    api.registerService('weather', {isRaining: () => raining});
    api.logger.log('Lightweight dynamic weather enabled');
  }
};
