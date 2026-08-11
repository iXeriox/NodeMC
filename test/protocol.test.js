'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {angleToSignedByte} = require('../src/protocol');

test('encodes entity angles within the protocol signed-byte range', () => {
  for (let degrees = -720; degrees <= 720; degrees++) {
    const encoded = angleToSignedByte(degrees * Math.PI / 180);
    assert.ok(encoded >= -128 && encoded <= 127, `${degrees}° encoded as ${encoded}`);
  }
  assert.equal(angleToSignedByte(Math.PI), -128);
  assert.equal(angleToSignedByte(Math.PI * 1.5), -64);
});

test('rejects invalid protocol angles', () => {
  assert.throws(() => angleToSignedByte(Number.NaN), /must be finite/);
});
