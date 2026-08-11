'use strict';

const events = require('./events');

/**
 * NodeMC's intentionally small kernel. Protocol, worlds, chat, commands and
 * entities are supplied by plugins; the kernel only owns shared state and the
 * application lifecycle.
 */
class Server {
  constructor(options = {}) {
    this.pluginManager = null;
    this.running = false;
    this.ready = false;
    this.players = new Map();
    this.world = null;
    this.config = {
      host: '0.0.0.0',
      port: 25565,
      onlineMode: false,
      maxPlayers: 20,
      motd: 'A NodeMC Server',
      viewDistance: 4,
      version: '1.20.1',
      worldName: 'world',
      ...options
    };
  }

  async start() {
    if (this.running) return;
    if (!this.pluginManager) throw new Error('A plugin manager is required');
    this.running = true;
    events.emit('serverStarting', this);
    try {
      await this.pluginManager.loadPlugins();
      this.ready = true;
      events.emit('serverReady', this);
      console.log(`NodeMC ${this.config.version} is ready`);
    } catch (error) {
      this.running = false;
      await this.pluginManager.disableAll();
      throw error;
    }
  }

  async stop() {
    if (!this.running) return;
    this.ready = false;
    events.emit('serverStopping', this);
    await this.pluginManager.disableAll();
    this.players.clear();
    this.world = null;
    this.running = false;
    events.emit('serverStopped', this);
  }
}

module.exports = Server;
