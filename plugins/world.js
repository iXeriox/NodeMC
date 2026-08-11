'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {Vec3} = require('vec3');

const nextTurn = () => new Promise(resolve => setImmediate(resolve));

function progressBar(done, total) {
  const percentage = Math.floor((done / total) * 100);
  const filled = Math.floor(percentage / 5);
  return `[${'#'.repeat(filled)}${'-'.repeat(20 - filled)}] ${String(percentage).padStart(3)}%`;
}

module.exports = {
  name: 'world',
  version: '1.0.0',
  description: 'Loads, expands, renders, caches, and saves the active world.',
  dependencies: ['realistic-world'],

  async onEnable(api) {
    const generator = api.getService('worldGenerator');
    if (!generator) throw new Error('No world generator service is available');
    const worldsDirectory = path.join(process.cwd(), 'worlds');
    const worldPath = path.join(worldsDirectory, `${api.server.config.worldName}.json`);
    await fs.mkdir(worldsDirectory, {recursive: true});

    let saved = null;
    try {
      saved = JSON.parse(await fs.readFile(worldPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') api.logger.error('Unable to read saved world:', error);
    }

    const world = {
      name: api.server.config.worldName,
      seed: saved ? BigInt(saved.seed) : BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
      generator: generator.id,
      spawnPoint: saved?.generator === generator.id ? saved.spawnPoint : {...generator.spawnPoint},
      worldTime: saved?.worldTime || 0,
      chunks: new Map()
    };
    api.server.world = world;

    const radius = Math.max(api.server.config.viewDistance, api.server.config.worldRenderDistance);
    const coordinates = [];
    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) coordinates.push([x, z]);
    }

    api.logger.log(`Rendering ${coordinates.length} chunks asynchronously...`);
    let lastPercentage = -1;
    for (let index = 0; index < coordinates.length; index++) {
      const [chunkX, chunkZ] = coordinates[index];
      const chunk = await generator.generateChunk({chunkX, chunkZ, seed: world.seed, world, server: api.server});
      if (!chunk || !(chunk.blocks instanceof Uint16Array)) {
        throw new TypeError(`Generator returned an invalid chunk at ${chunkX},${chunkZ}`);
      }
      // Pre-encode protocol data once so joining players only perform socket
      // writes instead of rebuilding every section and light mask.
      chunk.packet = renderChunk(chunk, api.server.config.version);
      world.chunks.set(`${chunkX},${chunkZ}`, chunk);
      const percentage = Math.floor(((index + 1) / coordinates.length) * 100);
      if (percentage !== lastPercentage && (percentage % 5 === 0 || percentage === 100)) {
        api.logger.log(progressBar(index + 1, coordinates.length));
        lastPercentage = percentage;
      }
      if ((index + 1) % 2 === 0) await nextTurn();
    }

    const spawnChunk = world.chunks.get(`${Math.floor(world.spawnPoint.x / 16)},${Math.floor(world.spawnPoint.z / 16)}`);
    if (spawnChunk?.surfaceHeights) {
      const x = ((world.spawnPoint.x % 16) + 16) % 16;
      const z = ((world.spawnPoint.z % 16) + 16) % 16;
      world.spawnPoint.y = spawnChunk.surfaceHeights[z * 16 + x];
    }

    const worldService = {
      world,
      getChunk: (x, z) => world.chunks.get(`${x},${z}`),
      sendChunk: (client, chunk) => client.write('map_chunk', chunk.packet),
      async ensureArea(centerX, centerZ, areaRadius) {
        const available = [];
        for (let x = centerX - areaRadius; x <= centerX + areaRadius; x++) {
          for (let z = centerZ - areaRadius; z <= centerZ + areaRadius; z++) {
            const key = `${x},${z}`;
            let chunk = world.chunks.get(key);
            if (!chunk) {
              chunk = await generator.generateChunk({chunkX: x, chunkZ: z, seed: world.seed, world, server: api.server});
              chunk.packet = renderChunk(chunk, api.server.config.version);
              world.chunks.set(key, chunk);
              if (available.length % 2 === 0) await nextTurn();
            }
            available.push(chunk);
          }
        }
        return available;
      }
    };
    api.registerService('world', worldService);
    let expansionQueue = Promise.resolve();
    api.registerEvent('playerChunkChange', player => {
      const centerX = Math.floor(player.position.x / 16);
      const centerZ = Math.floor(player.position.z / 16);
      const radius = api.server.config.viewDistance + api.server.config.worldExpansionMargin;
      expansionQueue = expansionQueue.then(() => worldService.ensureArea(centerX, centerZ, radius))
        .then(chunks => api.emit('worldChunksReady', {player, chunks}))
        .catch(error => api.logger.error('World expansion failed:', error));
    });
    this.save = () => fs.writeFile(worldPath, JSON.stringify({
      ...(saved || {}),
      name: world.name,
      seed: world.seed.toString(),
      generator: world.generator,
      spawnPoint: world.spawnPoint,
      worldTime: world.worldTime
    }, null, 2));
    await this.save();
    api.logger.log(`World fully rendered: ${world.chunks.size} chunks`);
  },

  async onDisable(api) {
    if (this.save) await this.save();
    api.logger.log('World saved');
  }
};

function renderChunk(chunk, version) {
  const ChunkColumn = require('prismarine-chunk')(version);
  const column = new ChunkColumn();
  const maxY = Math.min(255, Math.max(0, chunk.maxY ?? 255));
  const heights = new Array(256).fill(0);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      let height = 0;
      for (let y = 0; y <= maxY; y++) {
        const type = chunk.blocks[y * 256 + z * 16 + x];
        if (type !== 0) {
          column.setBlockType(new Vec3(x, y, z), type);
          height = y + 1;
        }
      }
      heights[z * 16 + x] = height;
      for (let y = height; y <= maxY; y++) column.setSkyLight(new Vec3(x, y, z), 15);
    }
  }
  const packed = packHeightmap(heights);
  const light = column.dumpLight();
  return {
    x: chunk.x,
    z: chunk.z,
    heightmaps: {type: 'compound', name: '', value: {MOTION_BLOCKING: {type: 'longArray', value: packed}}},
    chunkData: column.dump(),
    blockEntities: [],
    skyLightMask: light.skyLightMask,
    blockLightMask: light.blockLightMask,
    emptySkyLightMask: light.emptySkyLightMask,
    emptyBlockLightMask: light.emptyBlockLightMask,
    skyLight: light.skyLight,
    blockLight: light.blockLight
  };
}

function packHeightmap(heights) {
  const packed = [];
  let current = [0, 0];
  let bitPosition = 0;
  for (const rawHeight of heights) {
    const height = Math.min(rawHeight, 511);
    for (let bit = 0; bit < 9; bit++) {
      if ((height >> bit) & 1) {
        if (bitPosition < 32) current[1] |= (1 << bitPosition);
        else current[0] |= (1 << (bitPosition - 32));
      }
      if (++bitPosition === 64) {
        packed.push(current);
        current = [0, 0];
        bitPosition = 0;
      }
    }
  }
  if (bitPosition) packed.push(current);
  while (packed.length < 37) packed.push([0, 0]);
  return packed;
}
