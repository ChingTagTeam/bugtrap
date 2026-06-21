import { requireUid, errorResponse } from '@/lib/auth-server';
import { octokitForToken } from '@/lib/octokit';
import { storeGithubToken } from '@/lib/firestore';

export const runtime = 'nodejs';

/**
 * POST { githubToken } — called once right after GitHub sign-in.
 * Validates the token against GitHub, stores it server-side at
 * users/{uid}.githubToken, and returns the login. The token is never
 * logged and never returned.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const uid = await requireUid(req);
    const body: { githubToken?: string } = await req.json();
    const token = body.githubToken;
    if (!token) {
      return new Response(JSON.stringify({ error: 'githubToken is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const octokit = octokitForToken(token);
    const { data } = await octokit.users.getAuthenticated();
    await storeGithubToken(uid, token, data.login);

    return Response.json({ ok: true, login: data.login });
  } catch (err) {
    return errorResponse(err);
  }
}
