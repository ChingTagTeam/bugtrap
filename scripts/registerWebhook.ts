import 'dotenv/config';
import { registerRepoWebhook } from '../src/registerWebhook';

const [owner, repo] = process.argv.slice(2);
if (!owner || !repo) {
  console.error('Usage: tsx scripts/registerWebhook.ts <owner> <repo>');
  process.exit(1);
}

try {
  const result = await registerRepoWebhook(owner, repo);
  console.log(`Webhook ${result.action} (id ${result.id}) on ${owner}/${repo}`);
} catch (err) {
  console.error('Failed to register webhook:', err instanceof Error ? err.message : err);
  process.exit(1);
}
