import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifySignature } from '../../src/server';

const secret = 'shh';
const body = Buffer.from(JSON.stringify({ hello: 'world' }));
const good = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

assert.equal(verifySignature(body, good, secret), true);
assert.equal(verifySignature(body, 'sha256=deadbeef', secret), false);
assert.equal(verifySignature(body, '', secret), false);
assert.equal(verifySignature(body, good, ''), false); // no secret → reject
console.log('check-signature OK');
