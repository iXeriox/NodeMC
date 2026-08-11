'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const generatorPlugin = require('../plugins/worldGenerator');

function loadGenerator() {
  let generator;
  generatorPlugin.onEnable({
    server: {config: {version: '1.20.1'}},
    registerService(name, service) { if (name === 'worldGenerator') generator = service; },
    logger: {log() {}}
  });
  return generator;
}

test('generates deterministic, bounded chunks with useful metadata', () => {
  const generator = loadGenerator();
  const first = generator.generateChunk({chunkX: 4, chunkZ: -3, seed: 123456789n});
  const second = generator.generateChunk({chunkX: 4, chunkZ: -3, seed: 123456789n});

  assert.deepEqual(first.blocks, second.blocks);
  assert.deepEqual(first.surfaceHeights, second.surfaceHeights);
  assert.deepEqual(first.biomes, second.biomes);
  assert.equal(first.blocks.length, 16 * 256 * 16);
  assert.equal(first.surfaceHeights.length, 256);
  assert.ok(first.maxY >= 62 && first.maxY < 256);
  assert.ok(first.biomes.every(Boolean));
});

test('produces varied infinite terrain outside the former island boundary', () => {
  const generator = loadGenerator();
  const chunks = [20, 40, 80].map(chunkX => generator.generateChunk({chunkX, chunkZ: 7, seed: 42n}));
  const heights = new Set(chunks.flatMap(chunk => Array.from(chunk.surfaceHeights)));
  const biomes = new Set(chunks.flatMap(chunk => chunk.biomes));

  assert.ok(heights.size > 10, `expected varied heights, received ${heights.size}`);
  assert.ok(biomes.size > 1, `expected varied biomes, received ${biomes.size}`);
});
