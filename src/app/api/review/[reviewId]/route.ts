import { getScanReview } from '@/lib/firestore';
import { errorResponse } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * GET /api/review/[reviewId] — returns a persisted review for the public
 * revisit path (no auth). Only PUBLIC reviews are returned; private reviews
 * respond 403 so they can only be read by their owner via the client SDK.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reviewId: string }> }
): Promise<Response> {
  try {
    const { reviewId } = await params;
    const data = await getScanReview(reviewId);
    if (!data) {
      return new Response(JSON.stringify({ error: 'Review not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!data.review.public) {
      return new Response(JSON.stringify({ error: 'This review is private' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return Response.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
