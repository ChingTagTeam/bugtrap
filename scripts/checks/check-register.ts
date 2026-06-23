import assert from 'node:assert/strict';
import { registerRepoWebhook } from '../../src/registerWebhook';

process.env.PUBLIC_URL = 'https://bugtrap.example';
process.env.GITHUB_WEBHOOK_SECRET = 'shh';

function fakeOctokit(existingUrl: string | null) {
  const calls: string[] = [];
  return {
    calls,
    repos: {
      listWebhooks: async () => ({ data: existingUrl ? [{ id: 42, config: { url: existingUrl } }] : [] }),
      createWebhook: async (args: { config: { url: string; content_type: string; secret: string }; events: string[] }) => {
        calls.push('create');
        assert.equal(args.config.url, 'https://bugtrap.example/webhook/github');
        assert.equal(args.config.content_type, 'json');
        assert.equal(args.config.secret, 'shh');
        assert.deepEqual(args.events, ['push']);
        return { data: { id: 99 } };
      },
      updateWebhook: async (args: { hook_id: number }) => {
        calls.push('update');
        assert.equal(args.hook_id, 42);
        return { data: { id: 42 } };
      },
    },
  };
}

const created = await registerRepoWebhook('o', 'r', { octokit: fakeOctokit(null) as never });
assert.deepEqual(created, { id: 99, action: 'created' });

const updated = await registerRepoWebhook('o', 'r', { octokit: fakeOctokit('https://bugtrap.example/webhook/github') as never });
assert.deepEqual(updated, { id: 42, action: 'updated' });
console.log('check-register OK');
