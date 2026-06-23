import { GoogleGenAI } from '@google/genai';
import type { AgentName } from './types';

let _ai: GoogleGenAI | null = null;

// Vercel stores multi-line keys with literal "\n" — normalize to real newlines.
function privateKey(): string {
  return (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
}

/**
 * Vertex AI client. Credentials are passed explicitly from env vars (the service
 * account's client_email + private_key) rather than discovered from a file, so
 * the same code authenticates locally and on Vercel — whose ephemeral, read-only
 * filesystem makes the GOOGLE_APPLICATION_CREDENTIALS file path unreliable.
 */
export function getAI(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION,
      googleAuthOptions: {
        credentials: {
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          private_key: privateKey(),
        },
      },
    });
  }
  return _ai;
}

export const MODEL = 'gemini-2.5-flash';

/**
 * Returns the tuned model endpoint for a given agent if one is configured
 * and has been validated to beat the base model, otherwise falls back to MODEL.
 *
 * Set TUNED_MODEL_SECURITY / TUNED_MODEL_CORRECTNESS / TUNED_MODEL_READABILITY
 * in .env.local after running scripts/evaluate.ts and confirming it wins.
 */
export function modelForAgent(agent: AgentName): string {
  const key = `TUNED_MODEL_${agent.toUpperCase()}`;
  return process.env[key] ?? MODEL;
}
