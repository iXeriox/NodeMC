'use strict';

const GENERATOR_ID = 'realistic-world';
const SEA_LEVEL = 62;
const ISLAND_RADIUS = 180;
const ISLAND_CENTER_X = 0;
const ISLAND_CENTER_Z = 0;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const fade = t => t * t * (3 - 2 * t);
const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function hash2D(x, z, seed) {
  let h = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x5f356495) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 0xffffffff;
}

function valueNoise2D(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const tz = fade(z - z0);
  const a = hash2D(x0, z0, seed) * 2 - 1;
  const b = hash2D(x0 + 1, z0, seed) * 2 - 1;
  const c = hash2D(x0, z0 + 1, seed) * 2 - 1;
  const d = hash2D(x0 + 1, z0 + 1, seed) * 2 - 1;
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

function fbm(x, z, seed, octaves = 5) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normalizer = 0;

  for (let octave = 0; octave < octaves; octave++) {
    value += valueNoise2D(x * frequency, z * frequency, seed + octave * 1013) * amplitude;
    normalizer += amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }

  return value / normalizer;
}

function blockIds(mcData) {
  const id = (name, fallback) => mcData.blocksByName[name]?.id ?? fallback;
  return {
    air: id('air', 0),
    stone: id('stone', 1),
    bedrock: id('bedrock', 7),
    dirt: id('dirt', 10),
    grass: id('grass_block', 9),
    sand: id('sand', 138),
    sandstone: id('sandstone', 139),
    gravel: id('gravel', 137),
    water: id('water', 32),
    snow: id('snow_block', 112),
    oakLog: id('oak_log', 40),
    oakLeaves: id('oak_leaves', 64),
    birchLog: id('birch_log', 41),
    birchLeaves: id('birch_leaves', 65),
    cactus: id('cactus', 187),
    coalOre: id('coal_ore', 105),
    ironOre: id('iron_ore', 106)
  };
}

function selectBiome(worldX, worldZ, seed, height, continentalness) {
  const temperature = fbm(worldX / 900, worldZ / 900, seed + 4000, 4);
  const moisture = fbm(worldX / 750, worldZ / 750, seed + 5000, 4);

  if (height >= 112) return 'snowy_peaks';
  if (continentalness < -0.15) return 'ocean';
  if (temperature > 0.32 && moisture < -0.12) return 'desert';
  if (moisture > 0.22) return 'forest';
  if (temperature < -0.28) return 'taiga';
  return 'plains';
}

function terrainHeight(worldX, worldZ, seed) {
  const dx = worldX - ISLAND_CENTER_X;
  const dz = worldZ - ISLAND_CENTER_Z;
  const distanceFromCenter = Math.sqrt(dx * dx + dz * dz);

  // Island shape: 1.0 at center, 0.0 at radius edge, negative beyond
  const islandShape = 1 - smoothstep(ISLAND_RADIUS * 0.6, ISLAND_RADIUS, distanceFromCenter);

  const continentalness = fbm(worldX / 1200, worldZ / 1200, seed + 1000, 6);
  const erosion = fbm(worldX / 480, worldZ / 480, seed + 2000, 5);
  const ridgeBase = fbm(worldX / 750, worldZ / 750, seed + 3000, 5);
  const ridges = 1 - Math.abs(ridgeBase);
  const detail = fbm(worldX / 120, worldZ / 120, seed + 6000, 4);

  // Blend island shape with continentalness
  const blendedContinentalness = lerp(-0.5, continentalness * 0.5, islandShape);

  let height = SEA_LEVEL + blendedContinentalness * 28 + detail * 5 * islandShape;
  const mountainMask = smoothstep(0.52, 0.82, ridges) *
    smoothstep(0.02, 0.38, blendedContinentalness) * islandShape;
  height += mountainMask * mountainMask * (36 - erosion * 13);

  // Narrow, seed-stable river valleys that cut through inland terrain.
  const riverNoise = Math.abs(fbm(worldX / 420, worldZ / 420, seed + 7000, 4));
  const riverStrength = 1 - smoothstep(0.012, 0.055, riverNoise);
  if (blendedContinentalness > -0.08 && islandShape > 0.3) {
    height = lerp(height, SEA_LEVEL - 2, riverStrength * 0.92 * islandShape);
  }

  return {
    height: Math.floor(clamp(height, 0, 158)),
    continentalness: blendedContinentalness,
    riverStrength,
    islandShape
  };
}

module.exports = {
  name: GENERATOR_ID,

  onEnable(api) {
    if (!api.server) {
      throw new Error('realistic-world requires the PluginManager server option');
    }

    const mcData = require('minecraft-data')(api.server.config.version);
    const blocks = blockIds(mcData);

    api.server.registerWorldGenerator({
      id: GENERATOR_ID,
      spawnPoint: {x: ISLAND_CENTER_X, y: 75, z: ISLAND_CENTER_Z},

      generateChunk({chunkX, chunkZ, seed}) {
        const numericSeed = Number(seed & 0x7fffffffn) | 0;
        const chunk = {
          x: chunkX,
          z: chunkZ,
          blocks: new Uint16Array(16 * 256 * 16),
          surfaceHeights: new Uint16Array(256),
          biomes: new Array(256),
          maxY: SEA_LEVEL,
          generated: true
        };

        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) {
            const worldX = chunkX * 16 + x;
            const worldZ = chunkZ * 16 + z;
            const terrain = terrainHeight(worldX, worldZ, numericSeed);
            const biome = selectBiome(
              worldX,
              worldZ,
              numericSeed,
              terrain.height,
              terrain.continentalness
            );
            const column = z * 16 + x;
            const surface = terrain.height;
            const underwater = surface < SEA_LEVEL;
            const soilDepth = 3 + Math.floor(hash2D(worldX, worldZ, numericSeed + 8000) * 3);

            chunk.surfaceHeights[column] = surface;
            chunk.biomes[column] = biome;
            chunk.maxY = Math.max(chunk.maxY, underwater ? SEA_LEVEL : surface);

            for (let y = 0; y < 256; y++) {
              const index = y * 256 + column;

              if (y === 0 || (y < 4 && hash2D(worldX + y, worldZ, numericSeed) > 0.55)) {
                chunk.blocks[index] = blocks.bedrock;
              } else if (y > surface && y <= SEA_LEVEL) {
                chunk.blocks[index] = blocks.water;
              } else if (y > surface) {
                chunk.blocks[index] = blocks.air;
              } else if (y < surface - soilDepth) {
                let block = blocks.stone;
                const oreRoll = hash2D(worldX * 31 + y, worldZ * 17 - y, numericSeed + 9000);
                if (y < 54 && oreRoll > 0.993) block = blocks.ironOre;
                else if (y < 96 && oreRoll > 0.982) block = blocks.coalOre;
                chunk.blocks[index] = block;
              } else if (biome === 'desert' || (underwater && surface >= SEA_LEVEL - 5)) {
                chunk.blocks[index] = y < surface - 2 ? blocks.sandstone : blocks.sand;
              } else if (underwater) {
                chunk.blocks[index] = hash2D(worldX, worldZ, numericSeed + 9100) > 0.65
                  ? blocks.gravel
                  : blocks.dirt;
              } else if (y === surface) {
                chunk.blocks[index] = biome === 'snowy_peaks' ? blocks.snow : blocks.grass;
              } else {
                chunk.blocks[index] = blocks.dirt;
              }
            }
          }
        }

        // Deterministic vegetation. A two-block margin keeps foliage inside
        // its owning chunk and avoids writing into chunks not generated yet.
        for (let x = 2; x <= 13; x++) {
          for (let z = 2; z <= 13; z++) {
            const column = z * 16 + x;
            const biome = chunk.biomes[column];
            const surface = chunk.surfaceHeights[column];
            const worldX = chunkX * 16 + x;
            const worldZ = chunkZ * 16 + z;
            const roll = hash2D(worldX, worldZ, numericSeed + 12000);

            if (biome === 'desert' && roll > 0.992 && surface >= SEA_LEVEL) {
              const height = 2 + (roll > 0.997 ? 1 : 0);
              for (let y = 1; y <= height; y++) {
                chunk.blocks[(surface + y) * 256 + column] = blocks.cactus;
              }
              chunk.maxY = Math.max(chunk.maxY, surface + height);
              continue;
            }

            const treeChance = biome === 'forest' ? 0.028 :
              biome === 'taiga' ? 0.018 : biome === 'plains' ? 0.003 : 0;
            if (roll >= treeChance || surface < SEA_LEVEL || surface > 108) continue;

            const birch = biome === 'forest' &&
              hash2D(worldX, worldZ, numericSeed + 13000) > 0.72;
            const log = birch ? blocks.birchLog : blocks.oakLog;
            const leaves = birch ? blocks.birchLeaves : blocks.oakLeaves;
            const trunkHeight = 4 + Math.floor(
              hash2D(worldX, worldZ, numericSeed + 14000) * 3
            );

            for (let y = 1; y <= trunkHeight; y++) {
              chunk.blocks[(surface + y) * 256 + column] = log;
            }

            for (let dx = -2; dx <= 2; dx++) {
              for (let dz = -2; dz <= 2; dz++) {
                for (let dy = trunkHeight - 2; dy <= trunkHeight + 1; dy++) {
                  if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy !== trunkHeight) continue;
                  const leafX = x + dx;
                  const leafZ = z + dz;
                  const leafY = surface + dy;
                  const leafIndex = leafY * 256 + leafZ * 16 + leafX;
                  if (chunk.blocks[leafIndex] === blocks.air) chunk.blocks[leafIndex] = leaves;
                }
              }
            }

            chunk.maxY = Math.max(chunk.maxY, surface + trunkHeight + 1);
          }
        }

        return chunk;
      }
    });

    api.logger.log('Registered vanilla-inspired realistic world generator');
  },

  onDisable(api) {
    if (!api.server || api.server.running) return;
    api.server.unregisterWorldGenerator(GENERATOR_ID);
  }
};