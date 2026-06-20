/**
 * Correctness agent dataset preparation.
 *
 * REAL DATA SOURCES (download manually):
 *   - Defects4J    https://github.com/rjust/defects4j  (Java reproducible bugs)
 *   - QuixBugs     https://github.com/jkoppel/QuixBugs (Python/Java algorithms)
 *   - BugsInPy     https://github.com/soarsmu/BugsInPy
 *   - GitHub: mine "fix:" / "bug:" commits — pair buggy_code with fixed_code,
 *             infer the finding from the commit diff.
 *
 * Normalization: convert each (buggy_code, fix_diff) pair into a finding that
 * names the bug type, the line, and a clear message explaining WHY it was wrong.
 *
 * JSONL written to: data/correctness_train.jsonl, data/correctness_val.jsonl
 */

import { writeFileSync, mkdirSync } from 'fs';
import { makeExample, toJsonl, splitDataset, type SFTFinding } from './dataset-format';

const INSTRUCTION =
  'Review this code for correctness bugs and logic errors. Return findings JSON only.';

const SEED_EXAMPLES: Array<{ code: string; findings: SFTFinding[] }> = [
  {
    code: `function average(nums: number[]): number {
  let sum = 0;
  for (let i = 0; i <= nums.length; i++) {
    sum += nums[i];
  }
  return sum / nums.length;
}`,
    findings: [
      { line: 3, severity: 'HIGH', confidence: 0.97, type: 'off_by_one', message: 'Loop condition i <= nums.length goes one past the last index. nums[nums.length] is undefined, corrupting sum. Use i < nums.length.' },
    ],
  },
  {
    code: `async function fetchUser(id: string) {
  const user = await db.find(id);
  return user.name.toUpperCase();
}`,
    findings: [
      { line: 3, severity: 'HIGH', confidence: 0.95, type: 'null_deref', message: "No null check on user. If db.find returns null/undefined, accessing .name throws at runtime. Check 'if (!user)' before accessing properties." },
    ],
  },
  {
    code: `let counter = 0;

function increment() {
  counter++;
}

// Called from multiple async handlers
app.post('/click', increment);
app.post('/vote', increment);`,
    findings: [
      { line: 4, severity: 'MEDIUM', confidence: 0.78, type: 'race_condition', message: 'Shared mutable counter incremented from concurrent request handlers. In a multi-process deployment this is a true race. Use an atomic DB field or Redis INCR.' },
    ],
  },
  {
    code: `function divide(a: number, b: number): number {
  return a / b;
}

const result = divide(10, 0);`,
    findings: [
      { line: 2, severity: 'MEDIUM', confidence: 0.85, type: 'division_by_zero', message: 'No guard against b === 0. JavaScript returns Infinity, which silently propagates. Validate b !== 0 or handle Infinity at the call site.' },
    ],
  },
  {
    code: `async function processItems(ids: string[]) {
  const results = [];
  ids.forEach(async (id) => {
    const item = await fetchItem(id);
    results.push(item);
  });
  return results;
}`,
    findings: [
      { line: 3, severity: 'HIGH', confidence: 0.93, type: 'async_forEach_bug', message: 'forEach does not await the async callback. processItems returns before any fetchItem resolves, so results is always []. Use Promise.all(ids.map(...)) instead.' },
    ],
  },
  {
    code: `function mergeObjects(a: object, b: object) {
  return Object.assign(a, b);
}`,
    findings: [
      { line: 2, severity: 'MEDIUM', confidence: 0.82, type: 'mutating_input', message: 'Object.assign mutates the first argument (a). Callers passing an object they expect unchanged will observe silent mutation. Use Object.assign({}, a, b) or spread {...a, ...b}.' },
    ],
  },
  {
    code: `function parseJSON(str: string) {
  return JSON.parse(str);
}

const data = parseJSON(userInput);`,
    findings: [
      { line: 2, severity: 'HIGH', confidence: 0.90, type: 'missing_error_handling', message: 'JSON.parse throws SyntaxError on invalid input. Without try/catch this crashes the process. Wrap in try/catch and handle the error.' },
    ],
  },
  {
    code: `function findMax(arr: number[]): number {
  let max = 0;
  for (const n of arr) {
    if (n > max) max = n;
  }
  return max;
}`,
    findings: [
      { line: 2, severity: 'HIGH', confidence: 0.88, type: 'wrong_initial_value', message: 'Initializing max to 0 is wrong for all-negative arrays (returns 0 instead of the actual maximum). Initialize to -Infinity or arr[0] after checking arr.length > 0.' },
    ],
  },
  {
    code: `function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}`,
    findings: [],
  },
  {
    code: `export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  backoff = 200
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, backoff * 2 ** attempt));
    }
  }
  throw new Error('unreachable');
}`,
    findings: [],
  },
  {
    code: `function binarySearch(arr: number[], target: number): number {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}`,
    findings: [],
  },
  {
    code: `class EventEmitter {
  private listeners: Map<string, Set<() => void>> = new Map();

  on(event: string, cb: () => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }

  emit(event: string) {
    this.listeners.get(event)?.forEach((cb) => cb());
  }
}`,
    findings: [],
  },
];

function buildDataset(): void {
  const examples = SEED_EXAMPLES.map(({ code, findings }) =>
    makeExample(INSTRUCTION, code, findings)
  );

  const { train, val } = splitDataset(examples);
  mkdirSync('data', { recursive: true });

  writeFileSync('data/correctness_train.jsonl', toJsonl(train), 'utf8');
  writeFileSync('data/correctness_val.jsonl', toJsonl(val), 'utf8');

  console.log(`Correctness dataset: ${train.length} train, ${val.length} val`);
  console.log('Written to data/correctness_train.jsonl and data/correctness_val.jsonl');
  console.log('\nNEXT: augment with real data from Defects4J / QuixBugs (target: 100+ examples).');
}

buildDataset();
