'use strict';

module.exports = {
  name: 'commands',
  version: '2.0.0',

  onEnable(api) {
    const commands = new Map();
    const service = {
      register(name, options = {}) {
        const normalized = name.toLowerCase();
        if (!/^[a-z0-9_-]+$/.test(normalized)) throw new TypeError(`Invalid command name: ${name}`);
        if (commands.has(normalized)) throw new Error(`Command already registered: ${normalized}`);
        commands.set(normalized, {name: normalized, description: '', arguments: [], aliases: [], ...options});
      },
      unregister: name => commands.delete(name.toLowerCase()),
      list: () => Array.from(commands.values()),
      execute(player, input) {
        const [name, ...args] = input.trim().replace(/^\//, '').split(/\s+/);
        let command = commands.get(name.toLowerCase()) || Array.from(commands.values())
          .find(candidate => candidate.aliases.includes(name.toLowerCase()));
        if (!command) {
          const suggestion = nearest(name.toLowerCase(), Array.from(commands.keys()));
          if (suggestion && distance(name.toLowerCase(), suggestion) <= 2) command = commands.get(suggestion);
        }
        if (!command || typeof command.executor !== 'function') return false;
        const permissions = api.getService('permissions');
        if (command.permission && !permissions?.has(player, command.permission)) {
          api.getService('connections')?.sendMessage(player, 'You do not have permission to use that command.', 'red');
          return true;
        }
        const result = command.executor({player, args, server: api.server, reply: (message, color) => {
          api.getService('connections')?.sendMessage(player, message, color);
        }});
        if (result?.catch) result.catch(error => {
          api.logger.error(`Command /${command.name} failed:`, error);
          api.getService('connections')?.sendMessage(player, 'Command failed.', 'red');
        });
        return true;
      },
      sendTree(client) {
        const nodes = [{flags: 0, children: []}];
        for (const command of commands.values()) addCommand(nodes, command);
        client.write('declare_commands', {nodes, rootIndex: 0});
      }
    };
    api.registerService('commands', service);

    api.registerCommand('help', {
      description: 'Show available commands',
      executor: ({reply}) => reply(`Available commands: ${service.list().map(command => `/${command.name}`).join(', ')}`, 'yellow')
    });
    api.registerCommand('ping', {description: 'Check server responsiveness', executor: ({reply}) => reply('Pong!', 'green')});
    api.registerCommand('list', {
      description: 'Show online players',
      executor: ({server, reply}) => {
        const names = Array.from(server.players.values(), player => player.name);
        reply(`Online (${names.length}): ${names.join(', ') || 'nobody'}`, 'aqua');
      }
    });
    api.logger.log('Command registry and client completion tree enabled');
  }
};

function addCommand(nodes, command) {
  const literalIndex = nodes.length;
  const literal = {flags: command.arguments.length ? 0x01 : 0x01 | 0x04, children: [], name: command.name};
  nodes.push(literal);
  nodes[0].children.push(literalIndex);
  let parent = literal;
  for (let index = 0; index < command.arguments.length; index++) {
    const argument = command.arguments[index];
    const nodeIndex = nodes.length;
    parent.children.push(nodeIndex);
    parent = {
      flags: 0x02 | (index === command.arguments.length - 1 ? 0x04 : 0),
      children: [],
      name: argument.name,
      parser: argument.parser || 'brigadier:string',
      properties: argument.properties || {type: 0}
    };
    nodes.push(parent);
  }
}

function nearest(value, choices) {
  return choices.reduce((best, choice) => !best || distance(value, choice) < distance(value, best) ? choice : best, null);
}

function distance(a, b) {
  const row = Array.from({length: b.length + 1}, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return row[b.length];
}
