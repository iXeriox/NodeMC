'use strict';

function angleToSignedByte(radians) {
  if (!Number.isFinite(radians)) throw new TypeError('Protocol angle must be finite');
  const unsigned = Math.floor(radians * 256 / (Math.PI * 2)) & 0xff;
  return unsigned > 127 ? unsigned - 256 : unsigned;
}

module.exports = {angleToSignedByte};
