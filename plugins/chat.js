'use strict';

module.exports = {
  name: 'chat',
  version: '2.0.0',
  description: 'Validates player chat and routes slash commands.',
  dependencies: ['commands'],

  onEnable(api) {
    const commands = api.getService('commands');
    api.registerEvent('playerChat', event => {
      const message = event.message.trim();
      if (!message || message.length > 256) {
        event.cancelled = true;
        return;
      }
      if (!message.startsWith('/')) return;
      event.cancelled = true;
      if (!commands.execute(event.player, message)) {
        api.getService('connections')?.sendMessage(event.player, `Unknown command: ${message.split(/\s/, 1)[0]}`, 'red');
      }
    });
    api.logger.log('Secure chat and command routing enabled');
  }
};
