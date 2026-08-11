module.exports = {
  name: 'sample-plugin',
  version: '0.1.0',
  onEnable(api) {
    api.logger.log('enabled');
    // Register a managed event listener
    api.registerEvent('playerJoin', (player) => {
      api.logger.log(`Welcome ${player.name}!`);
      // emit a custom event
      api.emit('chatMessage', { player, message: `Welcome ${player.name} to NodeMC!` });
    });

    api.registerEvent('tick', () => {
      // heartbeat
    });
  },
  onDisable(api) {
    api.logger.log('disabled');
  }
};
