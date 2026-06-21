/**
 * Server + client helpers for named-event Server-Sent Events.
 * The existing /api/review route uses bare `data:` frames; the repo scan
 * stream uses named events (`event: node\ndata: {...}`) so the client can
 * route each frame by type as the graph builds itself.
 */

const encoder = new TextEncoder();

/** Encodes a named SSE frame: `event: <name>\ndata: <json>\n\n`. */
export function sseEncode(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Reads a fetch ReadableStream of SSE frames and invokes `onEvent` for each
 * complete `event:`/`data:` pair. Tolerates multi-line data and ignores
 * malformed frames. Resolves when the stream closes; rejects if the underlying
 * fetch is aborted (caller should catch AbortError).
 */
export async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: unknown) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      let eventName = 'message';
      let dataStr = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
      }
      if (!dataStr) continue;
      try {
        onEvent(eventName, JSON.parse(dataStr));
      } catch {
        // skip malformed frame
      }
    }
  }
}
