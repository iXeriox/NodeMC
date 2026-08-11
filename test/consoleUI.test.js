'use strict';

const assert = require('node:assert/strict');
const {PassThrough} = require('node:stream');
const test = require('node:test');
const ConsoleUI = require('../src/consoleUI');

function capture(stream) {
  let value = '';
  stream.on('data', chunk => { value += chunk; });
  return () => value;
}

test('renders structured, color-free logs for redirected output', () => {
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  const outputText = capture(output);
  const errorText = capture(errorOutput);
  const ui = new ConsoleUI({output, errorOutput, colors: false});

  ui.info('Server starting');
  ui.error('Startup failed', new Error('bad config'));

  assert.match(outputText(), /^\d{2}:\d{2}:\d{2} INFO\s+Server starting\n$/);
  assert.match(errorText(), /^\d{2}:\d{2}:\d{2} ERROR\s+Startup failed Error: bad config/m);
  assert.doesNotMatch(outputText() + errorText(), /\x1b/);
});

test('renders the server banner and console status', () => {
  const output = new PassThrough();
  const outputText = capture(output);
  const ui = new ConsoleUI({output, errorOutput: output, colors: false});
  const server = {
    ready: true,
    running: true,
    players: new Map([['one', {name: 'Alex'}]]),
    config: {maxPlayers: 20, version: '1.20.1'}
  };

  ui.banner(server.config.version);
  ui.handleCommand('status', server);

  assert.match(outputText(), /NodeMC 1\.20\.1/);
  assert.match(outputText(), /State: READY\s+Players: 1\/20\s+Version: 1\.20\.1/);
});
