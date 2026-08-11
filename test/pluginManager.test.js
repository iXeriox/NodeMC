'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const PluginManager = require('../src/pluginManager');

function fixture(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nodemc-plugins-'));
  for (const [name, source] of Object.entries(files)) {
    const target = path.join(directory, name);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, source);
  }
  return directory;
}

function serverStub() {
  return {
    commands: new Map(),
    registerCommand(name, options) { this.commands.set(name, options); },
    unregisterCommand(name) { this.commands.delete(name); }
  };
}

test('loads directory and file plugins in dependency order', async t => {
  const directory = fixture({
    'feature.js': `module.exports={name:'feature',dependencies:['core'],onEnable(api){api.getService('answer').push('feature')}}`,
    'core/index.js': `module.exports={name:'core',onEnable(api){api.registerService('answer',['core'])}}`
  });
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const manager = new PluginManager({pluginsDir: directory, server: serverStub(), logger: {log() {}, error() {}}});

  assert.deepEqual(await manager.loadPlugins(), ['core', 'feature']);
  assert.deepEqual(manager.services.get('answer').value, ['core', 'feature']);
  await manager.disableAll();
  assert.equal(manager.services.size, 0);
});

test('managed commands and listeners are removed when plugins disable', async t => {
  const directory = fixture({
    'managed.js': `module.exports={name:'managed',dependencies:['registry'],onEnable(api){api.registerCommand('hello',{executor(){}});api.registerEvent('fixture-event',()=>{})}}`,
    'registry.js': `module.exports={name:'registry',onEnable(api){const commands=new Map();api.registerService('commands',{register:(name,value)=>commands.set(name,value),unregister:name=>commands.delete(name)});api.registerService('testCommands',commands)}}`
  });
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const server = serverStub();
  const manager = new PluginManager({pluginsDir: directory, server, logger: {log() {}, error() {}}});

  await manager.loadPlugins();
  assert.equal(manager.services.get('testCommands').value.has('hello'), true);
  assert.equal(manager.plugins.get('managed').listeners.length, 1);
  await manager.disableAll();
  assert.equal(manager.services.size, 0);
});

test('rejects missing dependencies', async t => {
  const directory = fixture({'broken.js': `module.exports={name:'broken',dependencies:['missing']}`});
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const manager = new PluginManager({pluginsDir: directory, server: serverStub(), logger: {log() {}, error() {}}});
  await assert.rejects(() => manager.loadPlugins(), /requires missing plugin missing/);
});

test('awaits asynchronous plugin initialization in dependency order', async t => {
  const directory = fixture({
    'first.js': `module.exports={name:'first',async onEnable(api){await new Promise(resolve=>setTimeout(resolve,10));api.registerService('ready',true)}}`,
    'second.js': `module.exports={name:'second',dependencies:['first'],onEnable(api){if(!api.getService('ready'))throw new Error('not ready')}}`
  });
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const manager = new PluginManager({pluginsDir: directory, server: serverStub(), logger: {log() {}, error() {}}});
  assert.deepEqual(await manager.loadPlugins(), ['first', 'second']);
  await manager.disableAll();
});

test('exposes loaded plugin descriptions for the plugins command', async t => {
  const directory = fixture({
    'documented.js': `module.exports={name:'documented',version:'3.1.4',description:'Does useful work.'}`
  });
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const manager = new PluginManager({pluginsDir: directory, server: serverStub(), logger: {log() {}, error() {}}});
  await manager.loadPlugins();
  assert.deepEqual(manager.getPluginInfo(), [{name: 'documented', version: '3.1.4', description: 'Does useful work.'}]);
  await manager.disableAll();
});
