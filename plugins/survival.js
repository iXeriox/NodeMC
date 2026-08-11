'use strict';

// Combat is intentionally event driven: no extra tick loop or pathfinder is
// needed. The mobs plugin owns health and reactions while this plugin translates
// protocol attacks into gameplay damage.
module.exports = {
  name: 'survival',
  version: '1.0.0',
  dependencies: ['mobs'],

  onEnable(api) {
    const mobs = api.getService('mobs');
    api.registerEvent('packetReceived', ({player, packetName, data}) => {
      if (packetName !== 'use_entity' || !isAttack(data)) return;
      mobs.damage(data.target, player, 4);
    });
    api.logger.log('Entity combat and aware NPC reactions enabled');
  }
};

function isAttack(data) {
  // minecraft-protocol has used both `mouse` and `type` for this union tag.
  return data.mouse === 1 || data.type === 1 || data.action === 'attack';
}

module.exports.isAttack = isAttack;
