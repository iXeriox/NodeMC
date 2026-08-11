'use strict';

const {answerNodeQuestion} = require('../src/nodeAssistant');

module.exports = {
  name: 'node-assistant',
  version: '1.0.0',
  dependencies: ['connections'],

  onEnable(api) {
    const connections = api.getService('connections');
    const cooldowns = new Map();
    api.registerEvent('playerChat', event => {
      if (event.cancelled || !/^node(?:\s|[,!:;-]|$)/i.test(event.message)) return;
      const now = Date.now();
      if (now - (cooldowns.get(event.player.uuid) || 0) < 2000) {
        connections.sendActionBar(event.player, 'Node is thinking — please wait a moment.', 'yellow');
        return;
      }
      cooldowns.set(event.player.uuid, now);
      const answer = answerNodeQuestion(event.message);
      setImmediate(() => connections.sendComponent(event.player, {
        text: 'Node › ', color: 'aqua', bold: true,
        extra: [{text: answer, color: 'white', bold: false}]
      }));
    });
    api.logger.log('Lightweight Node gameplay assistant enabled');
  }
};
