import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

// Pure JavaScript SHA-256; works where Web Crypto is unavailable, including
// mobile devices opening a development server over plain HTTP.
export function sha256Hex(value) {
  if (typeof value !== 'string' || !value.length) throw new Error('A non-empty token is required to calculate its SHA-256 hash.');
  return bytesToHex(sha256(utf8ToBytes(value)));
}
