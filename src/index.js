const path = require('path');
const PluginManager = require('./pluginManager');
const Server = require('./server');

const server = new Server();
const pm = new PluginManager({ server, pluginsDir: path.join(__dirname, '..', 'plugins') });
server.pluginManager = pm;

server.start().catch(error => {
  console.error('NodeMC failed to start:', error);
  process.exitCode = 1;
});

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down...');
  await server.stop();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
