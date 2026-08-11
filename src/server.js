const events = require('./events');

class Server {
  constructor() {
    this.pluginManager = null;
    this.running = false;
  }

  start() {
    this.running = true;
    console.log('NodeMC server starting...');

    // Simple tick loop for demo and plugin events
    this._tickInterval = setInterval(() => {
      events.emit('tick');
    }, 1000);

    // Demo: simulate a player joining after 2s
    setTimeout(() => {
      const player = { id: 'player1', name: 'Steve' };
      events.emit('playerJoin', player);
    }, 2000);

    console.log('NodeMC server started (demo mode)');
  }

  stop() {
    if (!this.running) return;
    clearInterval(this._tickInterval);
    this.running = false;
    console.log('NodeMC server stopped');
  }
}

module.exports = Server;
