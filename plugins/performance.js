'use strict';

const {monitorEventLoopDelay} = require('node:perf_hooks');

module.exports = {
  name: 'performance',
  version: '1.0.0',
  dependencies: ['commands', 'connections'],
  onEnable(api) {
    const delay = monitorEventLoopDelay({resolution: 20});
    delay.enable();
    let ticks = 0;
    let windowStarted = Date.now();
    let tps = 20;
    api.registerEvent('tick', () => {
      ticks++;
      const elapsed = Date.now() - windowStarted;
      if (elapsed >= 5000) {
        tps = Math.min(20, ticks / (elapsed / 1000));
        ticks = 0;
        windowStarted = Date.now();
      }
    });
    const snapshot = () => ({
      tps: Number(tps.toFixed(1)),
      lagMs: Number((delay.mean / 1e6).toFixed(1)),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      busy: tps < 18 || delay.mean / 1e6 > 50
    });
    api.registerService('performance', {snapshot});
    api.registerCommand('serverusage', {
      permission: 'server.moderate',
      executor: ({reply}) => {
        const usage = snapshot();
        reply(`${usage.busy ? 'BUSY' : 'HEALTHY'} | TPS ${usage.tps}/20 | lag ${usage.lagMs}ms | memory ${usage.memoryMb}MB`, usage.busy ? 'red' : 'green');
      }
    });
    this.stop = () => delay.disable();
  },
  onDisable() { this.stop?.(); }
};
