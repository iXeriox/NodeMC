const path = require('path');
const PluginManager = require('./pluginManager');
const Server = require('./server');
const ConsoleUI = require('./consoleUI');

const ui = new ConsoleUI();
const server = new Server({logger: ui});
const pm = new PluginManager({server, logger: ui, pluginsDir: path.join(__dirname, '..', 'plugins')});
server.pluginManager = pm;
server.requestShutdown = shutdown;

ui.banner(server.config.version);
ui.info('Starting server and loading plugins...');
server.start().then(() => ui.startInput(server)).catch(error => {
  ui.error('NodeMC failed to start:', error);
  process.exitCode = 1;
});

// Graceful shutdown
async function shutdown() {
  if (ui.stopping) return;
  ui.stopping = true;
  ui.info('Shutting down gracefully...');
  ui.close();
  try {
    await server.stop();
    ui.success('Server stopped safely.');
    process.exitCode = 0;
  } catch (error) {
    ui.error('Server shutdown failed:', error);
    process.exitCode = 1;
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
