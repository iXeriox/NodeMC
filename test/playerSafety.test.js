'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {rescueFromVoid} = require('../plugins/connections');

test('void rescue restores health and teleports to the last safe position', () => {
  const writes = [];
  const player = {
    position: {x: 50, y: -20, z: 50},
    lastSafePosition: {x: 4, y: 70, z: -8},
    rotation: {yaw: 30}, health: 2, food: 15, teleportId: 1,
    stats: {deaths: 0},
    client: {write(name, data) { writes.push({name, data}); }}
  };

  rescueFromVoid(player);

  assert.deepEqual(player.position, player.lastSafePosition);
  assert.equal(player.health, 20);
  assert.equal(player.stats.deaths, 1);
  assert.deepEqual(writes.find(packet => packet.name === 'position').data, {
    x: 4, y: 71, z: -8, yaw: 30, pitch: 0, flags: 0, teleportId: 2
  });
  assert.ok(writes.some(packet => packet.name === 'set_title_text'));
});
