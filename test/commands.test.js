'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const mc = require('minecraft-protocol');
const plugin = require('../plugins/commands');

test('publishes executable command nodes for client completion', () => {
  const services = new Map();
  const api = {
    server: {players: new Map()},
    registerService(name, service) { services.set(name, service); },
    getService(name) { return services.get(name); },
    registerCommand(name, options) { services.get('commands').register(name, options); },
    logger: {log() {}}
  };
  plugin.onEnable(api);
  const commands = services.get('commands');
  commands.register('say', {
    arguments: [{name: 'message', parser: 'brigadier:string', properties: {type: 2}}],
    executor() {}
  });
  let declaration;
  commands.sendTree({write(name, data) { declaration = {name, data}; }});

  assert.equal(declaration.name, 'declare_commands');
  assert.equal(declaration.data.rootIndex, 0);
  const say = declaration.data.nodes.find(node => node.extraNodeData?.name === 'say');
  const argument = declaration.data.nodes[say.children[0]];
  assert.equal(argument.extraNodeData.name, 'message');
  assert.equal(argument.extraNodeData.parser, 'brigadier:string');
  assert.equal(argument.extraNodeData.properties, 'GREEDY_PHRASE');
  assert.equal(argument.flags.has_command, 1);
  const serializer = mc.createSerializer({state: 'play', isServer: true, version: '1.20.1'});
  const buffer = serializer.createPacketBuffer({name: declaration.name, params: declaration.data});
  const deserializer = mc.createDeserializer({state: 'play', isServer: false, version: '1.20.1'});
  let decoded;
  deserializer.on('data', packet => { decoded = packet.data.params; });
  deserializer.write(buffer);
  assert.equal(decoded.nodes.find(node => node.extraNodeData?.name === 'say').flags.command_node_type, 1);
});

test('auto-corrects a close command name', () => {
  const services = new Map();
  let executed = false;
  const api = {
    server: {players: new Map()},
    registerService(name, service) { services.set(name, service); },
    getService(name) { return services.get(name); },
    registerCommand(name, options) { services.get('commands').register(name, options); },
    logger: {log() {}}
  };
  plugin.onEnable(api);
  services.get('commands').register('status', {executor() { executed = true; }});
  assert.equal(services.get('commands').execute({uuid: 'test'}, '/statsu'), true);
  assert.equal(executed, true);
});

test('plugins command reports names, versions, and descriptions', () => {
  const services = new Map();
  let response;
  const api = {
    server: {players: new Map(), pluginManager: {getPluginInfo: () => [
      {name: 'world', version: '1.0.0', description: 'Renders worlds.'}
    ]}},
    registerService(name, service) { services.set(name, service); },
    getService(name) { return services.get(name); },
    registerCommand(name, options) { services.get('commands').register(name, options); },
    logger: {log() {}, error() {}}
  };
  services.set('connections', {sendMessage(player, message) { response = message; }});
  plugin.onEnable(api);
  assert.equal(services.get('commands').execute({uuid: 'test'}, '/plugins'), true);
  assert.match(response, /world v1\.0\.0 — Renders worlds\./);
});
