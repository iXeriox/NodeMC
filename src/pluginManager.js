const fs = require('fs');
const path = require('path');
const events = require('./events');

class PluginManager {
  constructor({pluginsDir = path.join(__dirname, '..', 'plugins'), logger = console, server = null} = {}) {
    this.pluginsDir = pluginsDir;
    this.logger = logger;
    this.server = server;
    this.plugins = new Map(); // id -> {module, meta, listeners}
  }

  loadPlugins() {
    if (!fs.existsSync(this.pluginsDir)) return;
    const files = fs.readdirSync(this.pluginsDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const full = path.join(this.pluginsDir, file);
      try {
        const mod = require(full);
        const id = mod.name || path.basename(file, '.js');
        this.plugins.set(id, { module: mod, meta: { id, path: full }, listeners: [] });
        this.logger.log(`[PluginManager] Loaded plugin ${id}`);
        if (typeof mod.onEnable === 'function') {
          const api = this._makePluginAPI(id);
          mod.onEnable(api);
          this.logger.log(`[PluginManager] Enabled plugin ${id}`);
        }
      } catch (err) {
        this.logger.error(`[PluginManager] Failed loading ${file}:`, err);
      }
    }
  }

  _makePluginAPI(id) {
    const self = this;
    return {
      id,
      events,
      server: this.server,
      logger: { log: (...args) => this.logger.log(`[${id}]`, ...args), error: (...args) => this.logger.error(`[${id}]`, ...args) },
      registerEvent(eventName, handler) {
        events.on(eventName, handler);
        const p = self.plugins.get(id);
        if (p) p.listeners.push({ eventName, handler });
      },
      emit(eventName, ...args) {
        events.emit(eventName, ...args);
      }
    };
  }

  disableAll() {
    for (const [id, p] of this.plugins.entries()) {
      try {
        if (p.module && typeof p.module.onDisable === 'function') {
          const api = this._makePluginAPI(id);
          p.module.onDisable(api);
        }
      } catch (err) {
        this.logger.error(`[PluginManager] Error disabling ${id}:`, err);
      }
      // remove listeners
      for (const { eventName, handler } of p.listeners) {
        events.removeListener(eventName, handler);
      }
      this.plugins.delete(id);
      this.logger.log(`[PluginManager] Disabled and unloaded ${id}`);
    }
  }
}

module.exports = PluginManager;
