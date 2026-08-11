'use strict';

const GENERATOR_ID = 'realistic-world';
const WORLD_HEIGHT = 256;
const SEA_LEVEL = 62;
const CHUNK_WIDTH = 16;
const CHUNK_AREA = CHUNK_WIDTH * CHUNK_WIDTH;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, amount) => a + (b - a) * amount;
const fade = value => value * value * (3 - 2 * value);
const smoothstep = (from, to, value) => fade(clamp((value - from) / (to - from), 0, 1));

function hash2D(x, z, seed) {
  let hash = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x5f356495) ^ seed;
  hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
  hash = Math.imul(hash ^ (hash >>> 12), 0x297a2d39);
  return ((hash ^ (hash >>> 15)) >>> 0) / 0xffffffff;
}

function valueNoise(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const tz = fade(z - z0);
  const north = lerp(hash2D(x0, z0, seed), hash2D(x0 + 1, z0, seed), tx);
  const south = lerp(hash2D(x0, z0 + 1, seed), hash2D(x0 + 1, z0 + 1, seed), tx);
  return lerp(north, south, tz) * 2 - 1;
}

function fbm(x, z, seed, octaves) {
  let result = 0;
  let amplitude = 0.5;
  let scale = 1;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave++) {
    result += valueNoise(x * scale, z * scale, seed + octave * 1013) * amplitude;
    weight += amplitude;
    scale *= 2;
    amplitude *= 0.5;
  }
  return result / weight;
}

function resolveBlocks(mcData) {
  const get = (name, fallback = 0) => mcData.blocksByName[name]?.id ?? fallback;
  return Object.freeze({
    air: get('air'), stone: get('stone', 1), bedrock: get('bedrock', 7),
    deepslate: get('deepslate', get('stone', 1)), dirt: get('dirt', 10),
    grass: get('grass_block', 9), sand: get('sand', 138), sandstone: get('sandstone', 139),
    gravel: get('gravel', 137), clay: get('clay', get('dirt', 10)), water: get('water', 32),
    snow: get('snow_block', 112), stoneTop: get('stone', 1),
    oakLog: get('oak_log', 40), oakLeaves: get('oak_leaves', 64),
    birchLog: get('birch_log', 41), birchLeaves: get('birch_leaves', 65),
    spruceLog: get('spruce_log', get('oak_log', 40)), spruceLeaves: get('spruce_leaves', get('oak_leaves', 64)),
    cactus: get('cactus', 187), tallGrass: get('grass', get('air')), dandelion: get('dandelion', get('air')),
    coalOre: get('coal_ore', 105), ironOre: get('iron_ore', 106), goldOre: get('gold_ore', 107),
    cobblestone: get('cobblestone', 14), mossyCobblestone: get('mossy_cobblestone', get('cobblestone', 14)),
    oakPlanks: get('oak_planks', 15), chest: get('chest', 244)
  });
}

/** Sample large-scale climate once per column. The generator is deliberately
 * two-dimensional; caves use cheap analytic waves so generation remains fast. */
function sampleTerrain(worldX, worldZ, seed) {
  const warpX = valueNoise(worldX / 700, worldZ / 700, seed + 11) * 90;
  const warpZ = valueNoise(worldX / 700, worldZ / 700, seed + 29) * 90;
  const x = worldX + warpX;
  const z = worldZ + warpZ;
  let continental = fbm(x / 1050, z / 1050, seed + 1000, 5);
  const erosion = fbm(x / 430, z / 430, seed + 2000, 4);
  const ridge = 1 - Math.abs(fbm(x / 620, z / 620, seed + 3000, 4));
  const detail = fbm(x / 115, z / 115, seed + 4000, 3);

  // Guarantee a pleasant, dry spawn without turning the rest of the map into
  // a finite island. Beyond spawn, continents continue in every direction.
  const spawnInfluence = 1 - smoothstep(24, 150, Math.hypot(worldX, worldZ));
  continental = Math.max(continental, spawnInfluence * 0.32);
  let height = SEA_LEVEL + continental * 31 + detail * 5;
  const mountain = smoothstep(0.55, 0.88, ridge) * smoothstep(0.02, 0.38, continental);
  height += mountain * mountain * (42 - erosion * 11);

  const riverNoise = Math.abs(fbm(x / 370, z / 370, seed + 5000, 3));
  const river = (1 - smoothstep(0.012, 0.052, riverNoise)) * smoothstep(-0.04, 0.2, continental);
  height = lerp(height, SEA_LEVEL - 2, river * 0.9);

  const temperature = fbm(x / 850, z / 850, seed + 6000, 3) - Math.max(0, height - 90) / 100;
  const moisture = fbm(x / 720, z / 720, seed + 7000, 3);
  height = Math.floor(clamp(height, 28, 178));

  let biome;
  if (height >= 122) biome = 'snowy_peaks';
  else if (height >= 98) biome = temperature < -0.08 ? 'snowy_slopes' : 'windswept_hills';
  else if (height < SEA_LEVEL - 5) biome = 'ocean';
  else if (river > 0.55 || height < SEA_LEVEL) biome = 'river';
  else if (temperature > 0.3 && moisture < -0.08) biome = 'desert';
  else if (temperature < -0.25) biome = 'taiga';
  else if (moisture > 0.28) biome = 'birch_forest';
  else if (moisture > 0.08) biome = 'forest';
  else biome = 'plains';

  return {height, biome, river};
}

function setBlock(chunk, x, y, z, block) {
  if (x < 0 || x >= CHUNK_WIDTH || z < 0 || z >= CHUNK_WIDTH || y < 0 || y >= WORLD_HEIGHT) return;
  chunk.blocks[y * CHUNK_AREA + z * CHUNK_WIDTH + x] = block;
  chunk.maxY = Math.max(chunk.maxY, y);
}

function generateBase(chunk, seed, blocks) {
  for (let x = 0; x < CHUNK_WIDTH; x++) {
    for (let z = 0; z < CHUNK_WIDTH; z++) {
      const worldX = chunk.x * CHUNK_WIDTH + x;
      const worldZ = chunk.z * CHUNK_WIDTH + z;
      const terrain = sampleTerrain(worldX, worldZ, seed);
      const column = z * CHUNK_WIDTH + x;
      const surface = terrain.height;
      const wet = surface < SEA_LEVEL;
      const soilDepth = 3 + Math.floor(hash2D(worldX, worldZ, seed + 8000) * 3);
      const ceiling = Math.max(surface, SEA_LEVEL);
      chunk.surfaceHeights[column] = surface;
      chunk.biomes[column] = terrain.biome;
      chunk.maxY = Math.max(chunk.maxY, ceiling);

      // Only visit blocks that can be non-air. This removes roughly 70% of the
      // inner-loop work compared with scanning all 256 blocks in every column.
      for (let y = 0; y <= ceiling; y++) {
        let block = blocks.air;
        if (y === 0 || (y < 4 && hash2D(worldX + y * 7, worldZ, seed + 9) > 0.52)) {
          block = blocks.bedrock;
        } else if (y > surface) {
          block = blocks.water;
        } else if (y < surface - soilDepth) {
          const cave = Math.sin(worldX * 0.105 + seed * 0.0007) +
            Math.sin(worldZ * 0.127 - seed * 0.0009) + Math.sin(y * 0.165 + (worldX + worldZ) * 0.024);
          if (y > 7 && y < surface - 5 && cave > 2.58) continue;
          block = y < 20 ? blocks.deepslate : blocks.stone;
          const ore = hash2D(worldX * 31 + y, worldZ * 17 - y, seed + 9000);
          if (y < 32 && ore > 0.9975) block = blocks.goldOre;
          else if (y < 58 && ore > 0.992) block = blocks.ironOre;
          else if (y < 110 && ore > 0.982) block = blocks.coalOre;
        } else if (terrain.biome === 'desert' || (wet && surface >= SEA_LEVEL - 4)) {
          block = y < surface - 2 ? blocks.sandstone : blocks.sand;
        } else if (wet) {
          const floor = hash2D(worldX, worldZ, seed + 9100);
          block = floor > 0.82 ? blocks.clay : floor > 0.55 ? blocks.gravel : blocks.dirt;
        } else if (y < surface) {
          block = blocks.dirt;
        } else if (terrain.biome === 'snowy_peaks' || terrain.biome === 'snowy_slopes') {
          block = blocks.snow;
        } else if (terrain.biome === 'windswept_hills') {
          block = hash2D(worldX, worldZ, seed + 9200) > 0.45 ? blocks.stoneTop : blocks.grass;
        } else {
          block = blocks.grass;
        }
        chunk.blocks[y * CHUNK_AREA + column] = block;
      }
    }
  }
}

function decorate(chunk, seed, blocks) {
  // A safe margin makes chunks independent and deterministic: decoration never
  // mutates a neighbor that may be generated concurrently.
  for (let x = 2; x <= 13; x++) {
    for (let z = 2; z <= 13; z++) {
      const column = z * CHUNK_WIDTH + x;
      const surface = chunk.surfaceHeights[column];
      const biome = chunk.biomes[column];
      if (surface < SEA_LEVEL || surface > 118) continue;
      const worldX = chunk.x * CHUNK_WIDTH + x;
      const worldZ = chunk.z * CHUNK_WIDTH + z;
      const roll = hash2D(worldX, worldZ, seed + 12000);

      if (biome === 'desert') {
        if (roll < 0.008) for (let y = 1; y <= 2 + (roll < 0.002 ? 1 : 0); y++) setBlock(chunk, x, surface + y, z, blocks.cactus);
        continue;
      }

      const chance = {birch_forest: 0.036, forest: 0.029, taiga: 0.025, plains: 0.003}[biome] || 0;
      if (roll >= chance) {
        if (biome === 'plains' && roll > 0.89) setBlock(chunk, x, surface + 1, z, roll > 0.975 ? blocks.dandelion : blocks.tallGrass);
        continue;
      }
      const type = biome === 'taiga' ? 'spruce' : biome === 'birch_forest' ? 'birch' : 'oak';
      addTree(chunk, x, surface, z, type, hash2D(worldX, worldZ, seed + 13000), blocks);
    }
  }
}

function addTree(chunk, x, surface, z, type, roll, blocks) {
  const log = blocks[`${type}Log`];
  const leaves = blocks[`${type}Leaves`];
  const height = (type === 'spruce' ? 5 : 4) + Math.floor(roll * 3);
  for (let y = 1; y <= height; y++) setBlock(chunk, x, surface + y, z, log);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = height - 2; dy <= height + 1; dy++) {
        const edge = Math.abs(dx) === 2 && Math.abs(dz) === 2;
        if (edge && dy !== height) continue;
        const index = (surface + dy) * CHUNK_AREA + (z + dz) * CHUNK_WIDTH + x + dx;
        if (chunk.blocks[index] === blocks.air) setBlock(chunk, x + dx, surface + dy, z + dz, leaves);
      }
    }
  }
}

function addStructures(chunk, seed, blocks) {
  chunk.lootChests = [];
  chunk.vendors = [];
  const roll = hash2D(chunk.x, chunk.z, seed + 18000);
  const column = 8 * CHUNK_WIDTH + 8;
  const baseY = chunk.surfaceHeights[column];
  if (baseY <= SEA_LEVEL || baseY >= 105) return;

  if (roll > 0.987) {
    for (let x = 5; x <= 11; x++) for (let z = 5; z <= 11; z++) {
      setBlock(chunk, x, baseY, z, (x + z) % 5 === 0 ? blocks.mossyCobblestone : blocks.cobblestone);
      for (let y = baseY + 1; y <= baseY + 4; y++) setBlock(chunk, x, y, z, x === 5 || x === 11 || z === 5 || z === 11 ? blocks.oakPlanks : blocks.air);
      setBlock(chunk, x, baseY + 5, z, blocks.oakPlanks);
    }
    setBlock(chunk, 8, baseY + 1, 11, blocks.air);
    setBlock(chunk, 8, baseY + 2, 11, blocks.air);
    setBlock(chunk, 7, baseY + 1, 7, blocks.chest);
    chunk.lootChests.push({x: chunk.x * 16 + 7, y: baseY + 1, z: chunk.z * 16 + 7});
    chunk.vendors.push({x: chunk.x * 16 + 8.5, y: baseY + 1, z: chunk.z * 16 + 8.5});
  } else if (roll > 0.955) {
    setBlock(chunk, 8, baseY + 1, 8, blocks.chest);
    chunk.lootChests.push({x: chunk.x * 16 + 8, y: baseY + 1, z: chunk.z * 16 + 8});
  }
}

module.exports = {
  name: GENERATOR_ID,
  version: '2.0.0',

  onEnable(api) {
    if (!api.server) throw new Error('realistic-world requires the PluginManager server option');
    const blocks = resolveBlocks(require('minecraft-data')(api.server.config.version));
    api.registerService('worldGenerator', {
      id: GENERATOR_ID,
      spawnPoint: {x: 0, y: 75, z: 0},
      generateChunk({chunkX, chunkZ, seed}) {
        if (!Number.isInteger(chunkX) || !Number.isInteger(chunkZ)) throw new TypeError('Chunk coordinates must be integers');
        const numericSeed = Number(BigInt(seed) & 0x7fffffffn) | 0;
        const chunk = {
          x: chunkX, z: chunkZ,
          blocks: new Uint16Array(CHUNK_AREA * WORLD_HEIGHT),
          surfaceHeights: new Uint16Array(CHUNK_AREA),
          biomes: new Array(CHUNK_AREA),
          maxY: SEA_LEVEL,
          generated: true,
          generatorVersion: 2
        };
        generateBase(chunk, numericSeed, blocks);
        decorate(chunk, numericSeed, blocks);
        addStructures(chunk, numericSeed, blocks);
        return chunk;
      }
    });
    api.logger.log('Registered optimized infinite terrain generator (10 biomes, caves, ores, vegetation, and structures)');
  },

  onDisable(api) { api.logger.log('World generator stopped'); }
};
