'use strict';

const readline = require('node:readline');

const COLORS = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m'
};

class ConsoleUI {
  constructor({input = process.stdin, output = process.stdout, errorOutput = process.stderr, colors} = {}) {
    this.input = input;
    this.output = output;
    this.errorOutput = errorOutput;
    this.colors = colors ?? Boolean(output.isTTY && !process.env.NO_COLOR);
    this.interface = null;
    this.stopping = false;
  }

  paint(value, ...styles) {
    if (!this.colors) return value;
    return `${styles.map(style => COLORS[style]).join('')}${value}${COLORS.reset}`;
  }

  write(level, values) {
    const settings = {
      INFO: ['cyan', this.output], SUCCESS: ['green', this.output],
      WARN: ['yellow', this.errorOutput], ERROR: ['red', this.errorOutput]
    }[level];
    const time = new Date().toISOString().slice(11, 19);
    const message = values.map(formatValue).join(' ');
    settings[1].write(`${this.paint(time, 'gray')} ${this.paint(level.padEnd(7), 'bold', settings[0])} ${message}\n`);
  }

  log(...values) { this.write('INFO', values); }
  info(...values) { this.write('INFO', values); }
  success(...values) { this.write('SUCCESS', values); }
  warn(...values) { this.write('WARN', values); }
  error(...values) { this.write('ERROR', values); }

  banner(version) {
    const title = [
      '╭────────────────────────────────────────╮',
      `│  NodeMC ${String(version).padEnd(31)}│`,
      '│  Modular Minecraft Server             │',
      '╰────────────────────────────────────────╯'
    ].join('\n');
    this.output.write(`${this.paint(title, 'bold', 'cyan')}\n`);
  }

  startInput(server) {
    if (!this.input.isTTY || !this.output.isTTY || this.interface) return;
    this.interface = readline.createInterface({input: this.input, output: this.output, prompt: this.paint('nodemc › ', 'green', 'bold')});
    this.interface.on('line', line => this.handleCommand(line, server));
    this.interface.on('close', () => { this.interface = null; });
    this.info('Console ready. Type "help" to list available commands.');
    this.interface.prompt();
  }

  handleCommand(line, server) {
    const command = line.trim().toLowerCase();
    if (!command) return this.interface?.prompt();
    if (command === 'help') {
      this.output.write('  status   Show server state and player count\n  players  List connected players\n  plugins  List enabled plugins\n  clear    Clear the terminal\n  stop     Gracefully stop the server\n');
    } else if (command === 'status') {
      const state = server.ready ? 'READY' : server.running ? 'STARTING' : 'STOPPED';
      this.info(`State: ${state}  Players: ${server.players.size}/${server.config.maxPlayers}  Version: ${server.config.version}`);
    } else if (command === 'players') {
      const players = Array.from(server.players.values(), player => player.name).filter(Boolean);
      this.info(`Players (${players.length}): ${players.join(', ') || 'none'}`);
    } else if (command === 'plugins') {
      const plugins = server.pluginManager?.getPluginInfo() || [];
      this.info(`Plugins (${plugins.length}): ${plugins.map(plugin => `${plugin.name} v${plugin.version}`).join(', ') || 'none'}`);
    } else if (command === 'clear') {
      this.output.write('\x1bc');
      this.banner(server.config.version);
    } else if (command === 'stop') {
      this.interface?.pause();
      server.requestShutdown?.();
      return;
    } else {
      this.warn(`Unknown console command: ${command}. Type "help" for help.`);
    }
    this.interface?.prompt();
  }

  close() {
    this.interface?.close();
    this.interface = null;
  }
}

function formatValue(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

module.exports = ConsoleUI;
