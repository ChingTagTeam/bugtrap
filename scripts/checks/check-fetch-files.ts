import assert from 'node:assert/strict';
import { collectChangedPaths } from '../../src/webhookFiles';

const payload = {
  after: 'sha-after',
  repository: { name: 'r', owner: { login: 'o' } },
  commits: [
    { added: ['src/a.ts', 'img/logo.png'], modified: ['src/a.ts'], removed: ['src/old.ts'] },
    { added: ['package-lock.json'], modified: ['src/b.py'], removed: [] },
  ],
};
const paths = collectChangedPaths(payload as never);
// dedup a.ts; drop removed old.ts; drop png; drop lockfile
assert.deepEqual([...paths].sort(), ['src/a.ts', 'src/b.py']);
console.log('check-fetch-files OK');
