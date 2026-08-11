'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {answerNodeQuestion} = require('../src/nodeAssistant');

test('answers common Node gameplay questions without an external service', () => {
  assert.match(answerNodeQuestion('Node how do I build a house?'), /7×9 foundation/);
  assert.match(answerNodeQuestion('Node, where is spawn?'), /X 0, Z 0/);
  assert.match(answerNodeQuestion('Node help'), /\/help/);
});

test('gives a useful fallback for unknown questions', () => {
  assert.match(answerNodeQuestion('Node explain quantum physics'), /Try asking/);
});
