'use strict';

module.exports = {
  name: 'loot',
  version: '1.0.0',
  description: 'Awards useful survival gear from rare generated chests.',
  dependencies: ['connections', 'world'],
  onEnable(api) {
    const mcData = require('minecraft-data')(api.server.config.version);
    const claimed = new Set();
    const rewards = [
      ['iron_sword', 1], ['iron_pickaxe', 1], ['iron_chestplate', 1],
      ['bread', 8], ['cooked_beef', 6], ['torch', 16]
    ].filter(([name]) => mcData.itemsByName[name]);
    api.registerEvent('packetReceived', ({player, packetName, data}) => {
      if (!['use_item_on', 'block_place'].includes(packetName)) return;
      const location = data.location;
      if (!location) return;
      const key = `${location.x},${location.y},${location.z}`;
      if (claimed.has(key) || !isLootChest(api.getService('world').world, location)) return;
      claimed.add(key);
      const [name, count] = rewards[Math.floor(Math.random() * rewards.length)];
      const item = mcData.itemsByName[name];
      player.client.write('set_slot', {
        windowId: 0,
        stateId: 0,
        slot: 36,
        item: {present: true, itemId: item.id, itemCount: count, nbtData: undefined}
      });
      api.getService('connections').sendMessage(player, `You found ${count} ${name.replaceAll('_', ' ')}!`, 'gold');
    });
  }
};

function isLootChest(world, location) {
  const chunk = world.chunks.get(`${Math.floor(location.x / 16)},${Math.floor(location.z / 16)}`);
  return chunk?.lootChests?.some(chest => chest.x === location.x && chest.y === location.y && chest.z === location.z);
}
