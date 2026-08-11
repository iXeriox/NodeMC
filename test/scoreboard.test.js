'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const scoreboard = require('../plugins/scoreboard');

test('builds a distinctive compact scoreboard for each player', () => {
  const chunk = {biomes: new Array(256).fill('birch_forest')};
  const player = {name: 'Alex', position: {x: 2, y: 70, z: 3}, stats: {distance: 127, deaths: 2}};
  const server = {players: new Map([['1', player]]), config: {maxPlayers: 20}, world: {chunks: new Map([['0,0', chunk]])}};
  const lines = scoreboard.scoreboardLines(player, server);

  assert.equal(lines.length, new Set(lines).size);
  assert.ok(lines.some(line => line.includes('birch forest')));
  assert.ok(lines.some(line => line.includes('Rescues') && line.includes('2')));
  assert.ok(lines.every(line => line.length <= 40));
});
