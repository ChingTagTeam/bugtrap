import { GoogleGenAI } from '@google/genai';
import type { AgentName } from './types';

// Picks up GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GOOGLE_GENAI_USE_ENTERPRISE from env
let _ai: GoogleGenAI | null = null;

export function getAI(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({});
  }
  return _ai;
}

export const MODEL = 'gemini-3.5-flash';

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
