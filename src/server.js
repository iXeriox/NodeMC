'use strict';

const mc = require('minecraft-protocol');
const {Vec3} = require('vec3');
const events = require('./events');
const fs = require('fs');
const path = require('path');

/**
 * Minimal Minecraft Java 1.20.1 server.
 *
 * Packet framing, login_finished, compression, encryption and keep-alives are
 * deliberately handled by minecraft-protocol. The previous implementation
 * advertised protocol 763 (1.20.1) while trying to use the 1.20.2+
 * configuration state, which caused the client-side login_finished exception.
 */
class Server {
  constructor(options = {}) {
    this.pluginManager = null;
    this.running = false;
    this.players = new Map();
    this.world = null;
    this.worldGenerator = null;
    this.networkServer = null;
    this._tickInterval = null;
    this.commands = new Map();

    this.config = {
      host: '0.0.0.0',
      port: 25565,
      onlineMode: false,
      maxPlayers: 20,
      motd: 'A NodeMC Server',
      viewDistance: 4,
      version: '1.20.1',
      ...options
    };
  }

  start() {
    if (this.running) return;

    if (!this.worldGenerator || typeof this.worldGenerator.generateChunk !== 'function') {
      throw new Error(
        'No world generator registered. Load a world-generator plugin before starting the server.'
      );
    }

    console.log(`NodeMC ${this.config.version} server starting...`);

    this._ensureWorldsDirectory();

    const loadedWorld = this._loadWorld('world');
    if (loadedWorld) {
      this.world = loadedWorld;
      console.log(`Loaded existing world: ${this.world.name}`);
      this._loadInitialChunks();
    } else {
      this.world = {
        name: 'world',
        seed: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
        chunks: new Map(),
        generator: this.worldGenerator.id,
        spawnPoint: {...this.worldGenerator.spawnPoint},
        worldTime: 0
      };
      this._loadInitialChunks();
      this._saveWorld();
    }

    this.networkServer = mc.createServer({
      host: this.config.host,
      port: this.config.port,
      version: this.config.version,
      motd: this.config.motd,
      maxPlayers: this.config.maxPlayers,
      'max-players': this.config.maxPlayers,
      'online-mode': this.config.onlineMode,
      encryption: this.config.onlineMode,
      keepAlive: true,
      hideErrors: false
    });

    this.networkServer.on('playerJoin', client => this._handlePlayerJoin(client));

    this.networkServer.on('error', error => {
      console.error('Minecraft server error:', error);
      events.emit('serverError', error);
    });

    this.networkServer.on('listening', () => {
      this.running = true;
      console.log(`NodeMC listening on ${this.config.host}:${this.config.port}`);
      events.emit('serverStart', this);
    });

    this._tickInterval = setInterval(() => {
      this.world.worldTime++;
      events.emit('tick');

      // Send time update to all players
      this.broadcastPacket('time_update', {
        age: [0, this.world.worldTime],
        time: [0, this.world.worldTime % 24000]
      });

      for (const player of this.players.values()) {
        if (player.spawned) events.emit('playerUpdate', player);
      }
    }, 50);
  }

  _handlePlayerJoin(client) {
    const mcData = require('minecraft-data')(this.config.version);
    const spawn = this.world.spawnPoint;

    const player = {
      id: String(client.id),
      socket: client.socket,
      client,
      name: client.username,
      uuid: client.uuid,
      spawned: false,
      position: { ...spawn },
      rotation: { yaw: 0, pitch: 0 },
      health: 20,
      food: 20,
      gamemode: 1,
      state: 4
    };

    this.players.set(player.id, player);

    client.on('packet', (data, metadata) => {
      events.emit('packetReceived', {
        player,
        packetId: metadata.id,
        packetName: metadata.name,
        state: metadata.state,
        data
      });

      if (metadata.name === 'position') {
        player.position = {
          x: data.x ?? player.position.x,
          y: data.y ?? player.position.y,
          z: data.z ?? player.position.z
        };
        player.rotation = {
          yaw: data.yaw ?? player.rotation.yaw,
          pitch: data.pitch ?? player.rotation.pitch
        };
      }
      
      if (metadata.name === 'teleport_confirm' && data.teleportId === 1 && !player.spawned) {
        // Send player abilities
        client.write('abilities', {
          flags: 0x02 | 0x04, // flying + allow flying in creative
          flyingSpeed: 0.05,
          walkingSpeed: 0.1
        });

        // Send commands to client
        this._sendCommands(client);

        // Send held item slot
        client.write('held_item_slot', {
          slot: 0
        });

        player.spawned = true;
        console.log(`${player.name} (${player.uuid}) entered the game`);
        this.broadcastMessage(`${player.name} joined the game`, 'yellow');
        events.emit('playerJoin', player);
      }

      if (metadata.name === 'chat_message') {
        const message = data.message || data.plainMessage || '';
        console.log(`<${player.name}> ${message}`);

        const chatEvent = {
          player,
          message,
          timestamp: Date.now(),
          cancelled: false
        };

        events.emit('chat', chatEvent);

        if (!chatEvent.cancelled) {
          this.broadcastMessage(`<${player.name}> ${message}`, 'white');
        }
      }
    });

    client.on('error', error => {
      console.error(`Client error for ${player.name}:`, error);
    });

    client.once('end', reason => this._handleDisconnect(player, reason));

    // minecraft-data supplies the version-correct dimension codec, world
    // identifiers and other fields required by the 1.20.1 Play Login packet.
    client.write('login', {
      ...mcData.loginPacket,
      entityId: client.id,
      isHardcore: false,
      gameMode: player.gamemode,
      previousGameMode: -1,
      hashedSeed: [0, 0],
      maxPlayers: this.config.maxPlayers,
      viewDistance: this.config.viewDistance,
      simulationDistance: this.config.viewDistance,
      reducedDebugInfo: false,
      enableRespawnScreen: true,
      isDebug: false,
      isFlat: true,
      enforceSecureChat: false
    });

    client.write('position', {
      x: spawn.x + 0.5,
      y: spawn.y + 1,
      z: spawn.z + 0.5,
      yaw: 0,
      pitch: 0,
      flags: 0,
      teleportId: 1
    });

    // Send chunk data to client in batches for faster loading
    const chunkX = Math.floor(spawn.x / 16);
    const chunkZ = Math.floor(spawn.z / 16);
    const radius = this.config.viewDistance;

    const chunksToSend = [];
    for (let x = chunkX - radius; x <= chunkX + radius; x++) {
      for (let z = chunkZ - radius; z <= chunkZ + radius; z++) {
        const chunk = this.world.chunks.get(`${x},${z}`);
        if (chunk) {
          chunksToSend.push(chunk);
        }
      }
    }

    // Send chunks in batches of 10 to avoid overwhelming the client
    const batchSize = 10;
    for (let i = 0; i < chunksToSend.length; i += batchSize) {
      const batch = chunksToSend.slice(i, i + batchSize);
      setImmediate(() => {
        batch.forEach(chunk => this._sendChunkData(client, chunk));
      });
    }

    // Player spawn finalization happens after teleport_confirm
  }

  stop() {
    if (!this.networkServer && !this._tickInterval) return;

    console.log('Stopping NodeMC server...');

    for (const player of this.players.values()) {
      if (player.client && !player.client.ended) {
        player.client.end('Server closed');
      }
    }

    this.players.clear();

    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }

    if (this.networkServer) {
      this.networkServer.close();
      this.networkServer = null;
    }

    if (this.world) {
      this._saveWorld();
    }

    this.running = false;
    events.emit('serverStop', this);
    console.log('NodeMC server stopped');
  }

  _handleDisconnect(player, reason) {
    if (!this.players.has(player.id)) return;

    this.players.delete(player.id);
    console.log(`${player.name} left the game${reason ? `: ${reason}` : ''}`);
    this.broadcastMessage(`${player.name} left the game`, 'yellow');
    events.emit('playerLeave', player);
  }

  broadcastPacket(packetName, data, excludePlayer = null) {
    for (const player of this.players.values()) {
      if (!player.spawned || player === excludePlayer || player.client.ended) continue;
      player.client.write(packetName, data);
    }
  }

  broadcastMessage(message, color = 'white') {
    console.log(`[CHAT] ${message}`);
    const chatData = { message, color, timestamp: Date.now() };
    events.emit('chat', chatData);

    const content = JSON.stringify({ text: message, color });
    for (const player of this.players.values()) {
      if (!player.spawned || player.client.ended) continue;

      try {
        player.client.write('system_chat', {
          content,
          isActionBar: false
        });
      } catch (error) {
        console.error(`Unable to send chat to ${player.name}:`, error.message);
      }
    }
  }

  getPlayer(nameOrId) {
    if (this.players.has(String(nameOrId))) {
      return this.players.get(String(nameOrId));
    }

    for (const player of this.players.values()) {
      if (player.name === nameOrId || player.uuid === nameOrId) return player;
    }

    return null;
  }

  registerWorldGenerator(generator) {
    if (!generator || typeof generator.id !== 'string') {
      throw new TypeError('World generator must have a string id');
    }
    if (typeof generator.generateChunk !== 'function') {
      throw new TypeError(`World generator ${generator.id} must implement generateChunk()`);
    }

    this.worldGenerator = {
      spawnPoint: {x: 0, y: 63, z: 0},
      ...generator
    };
    console.log(`[World] Registered generator: ${generator.id}`);
  }

  unregisterWorldGenerator(id) {
    if (this.worldGenerator?.id !== id) return false;
    if (this.running) {
      throw new Error('Cannot unregister the active world generator while the server is running');
    }
    this.worldGenerator = null;
    return true;
  }

  registerCommand(name, options = {}) {
    if (!name || typeof name !== 'string') {
      throw new TypeError('Command name must be a non-empty string');
    }

    const command = {
      name,
      description: options.description || '',
      aliases: options.aliases || [],
      permission: options.permission || null,
      arguments: options.arguments || [],
      executor: options.executor || null
    };

    this.commands.set(name, command);
    console.log(`[Commands] Registered command: ${name}`);
    return true;
  }

  unregisterCommand(name) {
    return this.commands.delete(name);
  }

  getCommands() {
    return Array.from(this.commands.values());
  }

  _sendCommands(client) {
    try {
      const nodes = [
        {
          flags: 0,
          children: []
        }
      ];

      let nodeIndex = 1;
      const rootChildren = [];

      for (const [name, command] of this.commands) {
        rootChildren.push(nodeIndex);

        const commandNode = {
          flags: 0x01 | 0x04, // literal | executable
          children: [],
          name: name
        };

        if (command.arguments && command.arguments.length > 0) {
          commandNode.children = [];
          for (let i = 0; i < command.arguments.length; i++) {
            nodeIndex++;
            commandNode.children.push(nodeIndex);
          }
        }

        nodes.push(commandNode);
        nodeIndex++;

        // Add argument nodes
        if (command.arguments && command.arguments.length > 0) {
          for (const arg of command.arguments) {
            const argNode = {
              flags: 0x02 | 0x04, // argument | executable
              children: [],
              name: arg.name || 'arg',
              parser: arg.parser || 'brigadier:string',
              properties: arg.properties || {type: 0}
            };
            nodes.push(argNode);
          }
        }
      }

      nodes[0].children = rootChildren;

      client.write('declare_commands', {
        nodes: nodes,
        rootIndex: 0
      });
    } catch (error) {
      console.error('Failed to send commands:', error.message);
    }
  }

  _loadInitialChunks() {
    console.log(`Generating world with plugin: ${this.worldGenerator.id}`);
    const radius = this.config.viewDistance;

    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        const chunk = this.worldGenerator.generateChunk({
          chunkX: x,
          chunkZ: z,
          seed: this.world.seed,
          world: this.world,
          server: this
        });

        if (!chunk || !(chunk.blocks instanceof Uint16Array)) {
          throw new TypeError(
            `Generator ${this.worldGenerator.id} returned an invalid chunk at ${x},${z}`
          );
        }

        this.world.chunks.set(`${x},${z}`, chunk);
      }
    }

    // Generators may expose their surface height for safe spawn placement.
    const spawnChunkX = Math.floor(this.world.spawnPoint.x / 16);
    const spawnChunkZ = Math.floor(this.world.spawnPoint.z / 16);
    const spawnChunk = this.world.chunks.get(`${spawnChunkX},${spawnChunkZ}`);
    if (spawnChunk?.surfaceHeights) {
      const localX = ((this.world.spawnPoint.x % 16) + 16) % 16;
      const localZ = ((this.world.spawnPoint.z % 16) + 16) % 16;
      this.world.spawnPoint.y = spawnChunk.surfaceHeights[localZ * 16 + localX];
    }

    console.log(`Generated ${this.world.chunks.size} chunks`);
  }

  _sendChunkData(client, chunk) {
    try {
      const ChunkColumn = require('prismarine-chunk')(this.config.version);
      const chunkColumn = new ChunkColumn();

      // prismarine-chunk expects a Vec3 position. Passing x, y and z as
      // separate arguments corrupts section coordinates and creates gaps.
      const maxY = Math.min(255, Math.max(0, chunk.maxY ?? 255));
      const heightMap = new Array(16 * 16).fill(0);

      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          let columnHeight = 0;
          for (let y = 0; y <= maxY; y++) {
            const index = (y * 256) + (z * 16) + x;
            const blockType = chunk.blocks[index];
            if (blockType !== 0) {
              chunkColumn.setBlockType(new Vec3(x, y, z), blockType);
              columnHeight = y + 1;
            }
          }
          heightMap[z * 16 + x] = columnHeight;

          // Set sky light to full brightness above surface for better lighting
          for (let y = columnHeight; y <= maxY; y++) {
            chunkColumn.setSkyLight(new Vec3(x, y, z), 15);
          }
        }
      }

      // Compute proper heightmap from actual block heights
      const heightmapBits = [];
      for (let i = 0; i < heightMap.length; i++) {
        heightmapBits.push(heightMap[i]);
      }

      // Pack heightmap into long array (9 bits per height value)
      const packedHeightmap = [];
      let currentLong = [0, 0];
      let bitPos = 0;

      for (let height of heightmapBits) {
        const heightValue = Math.min(height, 511);
        for (let bit = 0; bit < 9; bit++) {
          if ((heightValue >> bit) & 1) {
            if (bitPos < 32) {
              currentLong[1] |= (1 << bitPos);
            } else {
              currentLong[0] |= (1 << (bitPos - 32));
            }
          }
          bitPos++;
          if (bitPos >= 64) {
            packedHeightmap.push([...currentLong]);
            currentLong = [0, 0];
            bitPos = 0;
          }
        }
      }
      if (bitPos > 0) {
        packedHeightmap.push(currentLong);
      }

      // Pad to required length
      while (packedHeightmap.length < 37) {
        packedHeightmap.push([0, 0]);
      }

      // Since 1.18, map_chunk and update_light are represented by one
      // combined packet. prismarine-chunk returns the version-correct masks
      // and light arrays; every one of these fields is required by ProtoDef.
      const lightData = chunkColumn.dumpLight();

      client.write('map_chunk', {
        x: chunk.x,
        z: chunk.z,
        heightmaps: {
          type: 'compound',
          name: '',
          value: {
            MOTION_BLOCKING: {
              type: 'longArray',
              value: packedHeightmap
            }
          }
        },
        chunkData: chunkColumn.dump(),
        blockEntities: [],
        skyLightMask: lightData.skyLightMask,
        blockLightMask: lightData.blockLightMask,
        emptySkyLightMask: lightData.emptySkyLightMask,
        emptyBlockLightMask: lightData.emptyBlockLightMask,
        skyLight: lightData.skyLight,
        blockLight: lightData.blockLight
      });
    } catch (error) {
      console.error(`Failed to send chunk ${chunk.x},${chunk.z}:`, error.message);
    }
  }

  _ensureWorldsDirectory() {
    const worldsDir = path.join(process.cwd(), 'worlds');
    if (!fs.existsSync(worldsDir)) {
      fs.mkdirSync(worldsDir, {recursive: true});
      console.log('Created worlds directory');
    }
  }

  _saveWorld() {
    if (!this.world) return;

    try {
      const worldsDir = path.join(process.cwd(), 'worlds');
      const worldPath = path.join(worldsDir, `${this.world.name}.json`);

      // Generated chunks are reproducible and are deliberately not serialized.
      // This keeps world.json tiny; persistent block changes can later be stored
      // separately as sparse overrides instead of full 65,536-entry arrays.
      const worldData = {
        name: this.world.name,
        seed: this.world.seed.toString(),
        spawnPoint: this.world.spawnPoint,
        generator: this.worldGenerator?.id || this.world.generator,
        worldTime: this.world.worldTime
      };

      fs.writeFileSync(worldPath, JSON.stringify(worldData, null, 2));
      console.log(`Saved world: ${this.world.name}`);
    } catch (error) {
      console.error('Failed to save world:', error);
    }
  }

  _loadWorld(worldName) {
    try {
      const worldsDir = path.join(process.cwd(), 'worlds');
      const worldPath = path.join(worldsDir, `${worldName}.json`);

      if (!fs.existsSync(worldPath)) {
        return null;
      }

      const worldData = JSON.parse(fs.readFileSync(worldPath, 'utf8'));

      return {
        name: worldData.name,
        seed: BigInt(worldData.seed),
        generator: this.worldGenerator.id,
        spawnPoint: worldData.generator === this.worldGenerator.id
          ? worldData.spawnPoint
          : {...this.worldGenerator.spawnPoint},
        chunks: new Map(),
        worldTime: worldData.worldTime || 0
      };
    } catch (error) {
      console.error('Failed to load world:', error);
      return null;
    }
  }
}

module.exports = Server;