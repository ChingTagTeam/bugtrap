/**
 * JSONL format for Vertex AI SFT.
 * Each line is one training example: user turn = code + instruction,
 * model turn = findings JSON in our canonical shape.
 *
 * Spec reference: bugtrap-spec.md §5 "Dataset format (Vertex SFT, JSONL)"
 */

export interface SFTFinding {
  line: number | null;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  confidence: number;
  type: string;
  message: string;
}

export interface SFTExample {
  contents: [
    { role: 'user'; parts: [{ text: string }] },
    { role: 'model'; parts: [{ text: string }] },
  ];
}

export function makeExample(
  instruction: string,
  code: string,
  findings: SFTFinding[]
): SFTExample {
  return {
    contents: [
      { role: 'user', parts: [{ text: `${instruction}\n\n${code}` }] },
      { role: 'model', parts: [{ text: JSON.stringify({ findings }) }] },
    ],
  };
}

export function toJsonl(examples: SFTExample[]): string {
  return examples.map((e) => JSON.stringify(e)).join('\n');
}

// Train/val split: 80/20, minimum 16 val examples
export function splitDataset(
  examples: SFTExample[],
  valFraction = 0.2
): { train: SFTExample[]; val: SFTExample[] } {
  const shuffled = [...examples].sort(() => Math.random() - 0.5);
  const valCount = Math.max(16, Math.floor(shuffled.length * valFraction));
  return {
    train: shuffled.slice(valCount),
    val: shuffled.slice(0, valCount),
  };
}
