const path = require('path');
const PluginManager = require('./pluginManager');
const Server = require('./server');

const server = new Server();
const pm = new PluginManager({ server, pluginsDir: path.join(__dirname, '..', 'plugins') });
server.pluginManager = pm;

pm.loadPlugins();
server.start();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  pm.disableAll();
  server.stop();
  process.exit(0);
});
