'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {isAttack} = require('../plugins/survival');

test('recognizes protocol attack union variants without treating interaction as combat', () => {
  assert.equal(isAttack({mouse: 1}), true);
  assert.equal(isAttack({type: 1}), true);
  assert.equal(isAttack({action: 'attack'}), true);
  assert.equal(isAttack({mouse: 0}), false);
});
