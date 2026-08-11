'use strict';

const OBJECTIVE = 'nodemc_nexus';

module.exports = {
  name: 'nodemc-scoreboard',
  version: '1.0.0',
  dependencies: ['connections'],

  onEnable(api) {
    const connections = api.getService('connections');
    const entries = new Map();

    const update = player => {
      if (!player.spawned || player.client.ended) return;
      const previous = entries.get(player.id) || [];
      const next = scoreboardLines(player, api.server);
      for (const itemName of previous) {
        if (!next.includes(itemName)) player.client.write('scoreboard_score', {itemName, action: 1, scoreName: OBJECTIVE});
      }
      next.forEach((itemName, index) => {
        if (previous[index] === itemName) return;
        player.client.write('scoreboard_score', {
          itemName, action: 0, scoreName: OBJECTIVE, value: next.length - index
        });
      });
      entries.set(player.id, next);
    };

    api.registerEvent('playerJoin', player => {
      player.client.write('scoreboard_objective', {
        name: OBJECTIVE,
        action: 0,
        displayText: JSON.stringify({text: '✦ NodeMC Nexus ✦', color: 'aqua', bold: true}),
        type: 0
      });
      player.client.write('scoreboard_display_objective', {position: 1, name: OBJECTIVE});
      update(player);
    });
    api.registerEvent('playerLeave', ({player}) => entries.delete(player.id));
    api.registerEvent('tick', ({tick}) => {
      if (tick % 40 === 0) for (const player of api.server.players.values()) update(player);
      if (tick % 100 === 0) for (const player of api.server.players.values()) {
        const biome = playerBiome(player, api.server.world);
        connections.sendActionBar(player, `✦ ${biome}  •  X ${Math.floor(player.position.x)}  Y ${Math.floor(player.position.y)}  Z ${Math.floor(player.position.z)} ✦`, 'aqua');
      }
    });
    api.registerService('scoreboard', {update});
    api.logger.log('NodeMC Nexus scoreboard and heads-up display enabled');
  }
};

function scoreboardLines(player, server) {
  return [
    '§8──────────────',
    `§fPlayer §b${player.name}`,
    `§fOnline §a${server.players.size}§7/§a${server.config.maxPlayers}`,
    `§fBiome §e${playerBiome(player, server.world)}`,
    `§fPosition §7${Math.floor(player.position.x)}, ${Math.floor(player.position.y)}, ${Math.floor(player.position.z)}`,
    `§fExplored §d${Math.floor((player.stats?.distance || 0) / 10) * 10}m`,
    `§fRescues §c${player.stats?.deaths || 0}`,
    '§7Ask §bNode §7for help',
    '§8───────────── '
  ];
}

function playerBiome(player, world) {
  const chunkX = Math.floor(player.position.x / 16);
  const chunkZ = Math.floor(player.position.z / 16);
  const chunk = world?.chunks.get(`${chunkX},${chunkZ}`);
  if (!chunk?.biomes) return 'Generating…';
  const x = ((Math.floor(player.position.x) % 16) + 16) % 16;
  const z = ((Math.floor(player.position.z) % 16) + 16) % 16;
  return String(chunk.biomes[z * 16 + x] || 'Unknown').replaceAll('_', ' ');
}

module.exports.scoreboardLines = scoreboardLines;
