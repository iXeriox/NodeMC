'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const LEVELS = ['guest', 'builder', 'moderator', 'admin', 'owner'];
const GRANTS = {
  guest: [],
  builder: ['build'],
  moderator: ['build', 'server.moderate'],
  admin: ['build', 'server.moderate', 'server.manage'],
  owner: ['*']
};

module.exports = {
  name: 'permissions',
  version: '1.0.0',
  description: 'Provides persistent permission levels and administration controls.',
  dependencies: ['commands'],

  async onEnable(api) {
    const file = path.join(api.dataDirectory, 'players.json');
    await fs.mkdir(api.dataDirectory, {recursive: true});
    let assignments = {};
    try { assignments = JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const save = () => fs.writeFile(file, JSON.stringify(assignments, null, 2));
    const service = {
      level(player) { return assignments[player.uuid] || 'guest'; },
      has(player, permission) {
        const grants = GRANTS[this.level(player)] || [];
        return grants.includes('*') || grants.includes(permission);
      },
      async set(player, level) {
        if (!LEVELS.includes(level)) throw new TypeError(`Unknown permission level: ${level}`);
        assignments[player.uuid] = level;
        await save();
      },
      levels: LEVELS
    };
    api.registerService('permissions', service);
    api.registerEvent('playerJoin', async player => {
      if (Object.keys(assignments).length === 0) {
        await service.set(player, 'owner');
        api.getService('connections').sendMessage(player, 'You are the first player and were granted owner access.', 'gold');
      }
    });
    api.registerCommand('permission', {
      permission: 'server.manage',
      arguments: [
        {name: 'player', parser: 'brigadier:string', properties: {type: 0}},
        {name: 'level', parser: 'brigadier:string', properties: {type: 0}}
      ],
      executor: async ({args, server, reply}) => {
        const player = Array.from(server.players.values()).find(item => item.name.toLowerCase() === (args[0] || '').toLowerCase());
        const level = (args[1] || '').toLowerCase();
        if (!player || !LEVELS.includes(level)) return reply(`Usage: /permission <online player> <${LEVELS.join('|')}>`, 'red');
        await service.set(player, level);
        reply(`${player.name} is now ${level}.`, 'green');
      }
    });
    api.registerCommand('op', {
      permission: 'server.manage',
      arguments: [{name: 'player', parser: 'brigadier:string', properties: {type: 0}}],
      executor: async ({args, server, reply}) => {
        const player = Array.from(server.players.values()).find(item => item.name.toLowerCase() === (args[0] || '').toLowerCase());
        if (!player) return reply('That player is not online.', 'red');
        await service.set(player, 'admin');
        reply(`${player.name} is now an admin.`, 'green');
      }
    });
    api.registerCommand('permissions', {
      permission: 'server.manage',
      executor: ({player, server, reply}) => {
        const online = Array.from(server.players.values());
        if (!online.length) return reply('No players online', 'aqua');
        const component = {text: 'Permission Control\n', color: 'gold', extra: []};
        for (const target of online) {
          component.extra.push({text: `${target.name} (${service.level(target)}): `, color: 'aqua'});
          for (const level of LEVELS) component.extra.push({
            text: `[${level[0].toUpperCase()}]`,
            color: service.level(target) === level ? 'green' : 'gray',
            hoverEvent: {action: 'show_text', contents: {text: `Set ${target.name} to ${level}`}},
            clickEvent: {action: 'run_command', value: `/permission ${target.name} ${level}`}
          });
          component.extra.push({text: '\n'});
        }
        api.getService('connections').sendComponent(player, component);
      }
    });
    this.save = save;
  },

  async onDisable() { await this.save?.(); }
};
