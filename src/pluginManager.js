'use strict';

const fs = require('fs');
const path = require('path');
const events = require('./events');

class PluginManager {
  constructor({pluginsDir = path.join(__dirname, '..', 'plugins'), logger = console, server = null} = {}) {
    this.pluginsDir = pluginsDir;
    this.logger = logger;
    this.server = server;
    this.plugins = new Map();
    this.services = new Map();
  }

  async loadPlugins() {
    if (!fs.existsSync(this.pluginsDir)) return [];

    const candidates = this._discover().map(file => this._readPlugin(file));
    const available = new Map();
    for (const plugin of candidates.filter(Boolean)) {
      if (available.has(plugin.id)) throw new Error(`Duplicate plugin id: ${plugin.id}`);
      available.set(plugin.id, plugin);
    }
    const ordered = [];
    const visiting = new Set();
    const visited = new Set();

    const visit = plugin => {
      if (visited.has(plugin.id)) return;
      if (visiting.has(plugin.id)) throw new Error(`Circular plugin dependency involving ${plugin.id}`);
      visiting.add(plugin.id);
      for (const dependency of plugin.module.dependencies || []) {
        if (!available.has(dependency)) {
          throw new Error(`Plugin ${plugin.id} requires missing plugin ${dependency}`);
        }
        visit(available.get(dependency));
      }
      visiting.delete(plugin.id);
      visited.add(plugin.id);
      ordered.push(plugin);
    };

    for (const plugin of available.values()) visit(plugin);
    for (const plugin of ordered) await this._enable(plugin);
    return ordered.map(plugin => plugin.id);
  }

  _discover() {
    return fs.readdirSync(this.pluginsDir, {withFileTypes: true})
      .filter(entry => !entry.name.startsWith('.'))
      .map(entry => {
        if (entry.isFile() && entry.name.endsWith('.js')) return path.join(this.pluginsDir, entry.name);
        if (entry.isDirectory()) {
          const entryPoint = path.join(this.pluginsDir, entry.name, 'index.js');
          if (fs.existsSync(entryPoint)) return entryPoint;
        }
        return null;
      })
      .filter(Boolean)
      .sort();
  }

  _readPlugin(file) {
    try {
      const module = require(file);
      const id = module.name || path.basename(path.dirname(file) === this.pluginsDir ? file : path.dirname(file), '.js');
      if (this.plugins.has(id)) throw new Error(`Duplicate plugin id: ${id}`);
      if (!Array.isArray(module.dependencies || [])) throw new TypeError(`${id}.dependencies must be an array`);
      return {id, module, path: file, listeners: [], commands: [], services: []};
    } catch (error) {
      this.logger.error(`[PluginManager] Failed reading ${file}:`, error);
      return null;
    }
  }

  async _enable(plugin) {
    this.plugins.set(plugin.id, plugin);
    try {
      await plugin.module.onEnable?.(this._makePluginAPI(plugin.id));
      this.logger.log(`[PluginManager] Enabled ${plugin.id}${plugin.module.version ? ` v${plugin.module.version}` : ''}`);
    } catch (error) {
      this._cleanup(plugin);
      this.plugins.delete(plugin.id);
      throw new Error(`Failed enabling plugin ${plugin.id}: ${error.message}`, {cause: error});
    }
  }

  _makePluginAPI(id) {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin ${id} is not active`);
    const prefix = () => `[${new Date().toISOString()}] [${id}]`;
    return Object.freeze({
      id,
      events,
      server: this.server,
      dataDirectory: path.join(this.pluginsDir, '.data', id),
      logger: Object.freeze({
        log: (...args) => this.logger.log(prefix(), ...args),
        error: (...args) => this.logger.error(prefix(), 'ERROR:', ...args)
      }),
      registerEvent: (eventName, handler) => {
        if (typeof handler !== 'function') throw new TypeError('Event handler must be a function');
        events.on(eventName, handler);
        plugin.listeners.push({eventName, handler});
        return () => events.removeListener(eventName, handler);
      },
      emit: (eventName, ...args) => events.emit(eventName, ...args),
      registerCommand: (name, options) => {
        const registry = this.services.get('commands')?.value;
        if (!registry) throw new Error('The commands service is not available');
        registry.register(name, options);
        plugin.commands.push(name);
      },
      registerService: (name, service) => {
        if (this.services.has(name)) throw new Error(`Service already registered: ${name}`);
        this.services.set(name, {owner: id, value: service});
        plugin.services.push(name);
      },
      getService: name => this.services.get(name)?.value
    });
  }

  _cleanup(plugin) {
    for (const {eventName, handler} of plugin.listeners) events.removeListener(eventName, handler);
    const registry = this.services.get('commands')?.value;
    for (const command of plugin.commands) registry?.unregister(command);
    for (const service of plugin.services) this.services.delete(service);
    plugin.listeners.length = 0;
    plugin.commands.length = 0;
    plugin.services.length = 0;
  }

  async disableAll() {
    for (const plugin of Array.from(this.plugins.values()).reverse()) {
      try {
        await plugin.module.onDisable?.(this._makePluginAPI(plugin.id));
      } catch (error) {
        this.logger.error(`[PluginManager] Error disabling ${plugin.id}:`, error);
      }
      this._cleanup(plugin);
      this.plugins.delete(plugin.id);
      this.logger.log(`[PluginManager] Disabled ${plugin.id}`);
    }
  }
}

module.exports = PluginManager;
