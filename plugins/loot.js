'use strict';

module.exports = {
  name: 'loot',
  version: '1.0.0',
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
    const animalDrops = {
      cow: [['beef', 2], ['leather', 1]],
      pig: [['porkchop', 2]],
      sheep: [['mutton', 2], ['white_wool', 1]],
      chicken: [['chicken', 1], ['feather', 2]]
    };
    api.registerEvent('mobDeath', ({mob, killer}) => {
      const drops = (animalDrops[mob.name] || []).filter(([name]) => mcData.itemsByName[name]);
      // Roughly one in twenty animals adds a recognizable rare bonus.
      if (Math.random() < 0.05 && mcData.itemsByName.emerald) drops.push(['emerald', 1]);
      drops.forEach(([name, maximum], index) => {
        const count = 1 + Math.floor(Math.random() * maximum);
        const item = mcData.itemsByName[name];
        killer.client.write('set_slot', {
          windowId: 0, stateId: 0, slot: 36 + (index % 9),
          item: {present: true, itemId: item.id, itemCount: count, nbtData: undefined}
        });
      });
      if (drops.length) api.getService('connections').sendMessage(killer,
        `Drops: ${drops.map(([name]) => name.replaceAll('_', ' ')).join(', ')}`, drops.some(([name]) => name === 'emerald') ? 'light_purple' : 'gray');
    });
  }
};

function isLootChest(world, location) {
  const chunk = world.chunks.get(`${Math.floor(location.x / 16)},${Math.floor(location.z / 16)}`);
  return chunk?.lootChests?.some(chest => chest.x === location.x && chest.y === location.y && chest.z === location.z);
}
