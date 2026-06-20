/**
 * Readability agent dataset preparation.
 *
 * REAL DATA SOURCES:
 *   - Lint/style corpora: ESLint / Pylint / SonarQube flagged code paired with
 *     the corrected version. The linter IS the labeler here. Run ESLint on a
 *     large open-source corpus and pair violations with their auto-fix.
 *   - Refactoring commits: mine "refactor:" / "rename:" / "cleanup:" commits
 *     on GitHub and map the diff to readability findings.
 *
 * This dataset has the least readily available labeled data — keep examples
 * high quality rather than large and noisy (spec §5).
 *
 * JSONL written to: data/readability_train.jsonl, data/readability_val.jsonl
 */

import { writeFileSync, mkdirSync } from 'fs';
import { makeExample, toJsonl, splitDataset, type SFTFinding } from './dataset-format';

const INSTRUCTION =
  'Review this code for readability and code quality issues. Return findings JSON only.';

const SEED_EXAMPLES: Array<{ code: string; findings: SFTFinding[] }> = [
  {
    code: `function calc(a: number, b: number, c: number): number {
  return a * 0.0825 + b * 1.15 + c * 86400000;
}`,
    findings: [
      { line: 2, severity: 'MEDIUM', confidence: 0.90, type: 'magic_number', message: '0.0825, 1.15, and 86400000 are unexplained magic numbers. Name them: TAX_RATE, MARKUP_FACTOR, MS_PER_DAY.' },
    ],
  },
  {
    code: `function p(u: any): any {
  const r = u.d.n.split(' ');
  return r[0];
}`,
    findings: [
      { line: 1, severity: 'HIGH', confidence: 0.95, type: 'poor_naming', message: "Function 'p', parameter 'u', and variable 'r' are single-letter abbreviations. Use descriptive names: parseFirstName(user), result." },
      { line: 1, severity: 'MEDIUM', confidence: 0.88, type: 'implicit_any', message: "Parameters and return typed as 'any'. Add proper types to enable static analysis." },
    ],
  },
  {
    code: `function processData(data: any[], type: string, flag: boolean, extra?: any) {
  if (type === 'A') {
    if (flag) {
      if (data.length > 0) {
        if (extra) {
          return data.map(d => ({ ...d, extra }));
        }
        return data.map(d => d);
      }
      return [];
    }
    return data.filter(d => d.active);
  } else if (type === 'B') {
    return flag ? data.slice(0, 10) : data;
  }
  return data;
}`,
    findings: [
      { line: 1, severity: 'HIGH', confidence: 0.92, type: 'complex_function', message: 'Function has 4 levels of nesting and 4 parameters including a boolean flag. Separate concerns: create processTypeA and processTypeB, use early returns to flatten nesting.' },
      { line: 1, severity: 'MEDIUM', confidence: 0.85, type: 'boolean_parameter', message: "Boolean parameter 'flag' is a code smell — callers can't tell what true/false means. Replace with an options object or two separate functions." },
    ],
  },
  {
    code: `// This function gets the user from the database by looking up the user id in the users table
// and then returning the user object with all of its properties
// Returns null if the user is not found
async function getUserFromDatabase(userId: string) {
  return db.collection('users').doc(userId).get();
}`,
    findings: [
      { line: 1, severity: 'LOW', confidence: 0.88, type: 'redundant_comment', message: 'The three-line comment restates what the function name and implementation already say. Remove it; the code is self-documenting.' },
    ],
  },
  {
    code: `const x = users
  .filter(u => u.active === true)
  .map(u => ({ id: u.id, name: u.name, email: u.email }))
  .filter(u => u.email !== undefined && u.email !== null && u.email !== '')
  .sort((a, b) => a.name > b.name ? 1 : a.name < b.name ? -1 : 0);`,
    findings: [
      { line: 2, severity: 'LOW', confidence: 0.82, type: 'verbose_boolean', message: "u.active === true is redundant; u.active is already a boolean." },
      { line: 4, severity: 'LOW', confidence: 0.85, type: 'verbose_null_check', message: 'Three separate falsy checks can be simplified to Boolean(u.email) or u.email?.trim().' },
    ],
  },
  {
    code: `function getUserData() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem('user'));
  } catch(e) {}
  return data;
}`,
    findings: [
      { line: 5, severity: 'MEDIUM', confidence: 0.90, type: 'swallowed_exception', message: 'Empty catch block silently discards parse errors. At minimum log the error; ideally return a typed default or let the caller handle it.' },
    ],
  },
  {
    code: `class UserService {
  private db: Database;
  private cache: Cache;
  private logger: Logger;
  private emailer: Emailer;
  private sms: SMSService;
  private analytics: Analytics;
  private payment: PaymentService;

  async registerUser(email: string, password: string) {
    // ... 200 lines touching all 7 dependencies
  }
}`,
    findings: [
      { line: 1, severity: 'HIGH', confidence: 0.87, type: 'god_class', message: 'UserService has 7 injected dependencies, suggesting it handles too many concerns. Split: AuthService (db, cache), NotificationService (emailer, sms), UserAnalyticsService.' },
    ],
  },
  // Clean examples
  {
    code: `const TAX_RATE = 0.0825;
const SHIPPING_MARKUP = 1.15;
const MS_PER_DAY = 86_400_000;

function calculateOrderTotal(
  subtotal: number,
  shippingCost: number,
  daysToExpiry: number
): number {
  return subtotal * (1 + TAX_RATE) + shippingCost * SHIPPING_MARKUP + daysToExpiry * MS_PER_DAY;
}`,
    findings: [],
  },
  {
    code: `interface User {
  id: string;
  name: string;
  email: string;
}

function getFirstName(user: User): string {
  return user.name.split(' ')[0];
}`,
    findings: [],
  },
  {
    code: `async function getActiveUsersWithEmail(): Promise<Pick<User, 'id' | 'name' | 'email'>[]> {
  return db
    .collection('users')
    .where('active', '==', true)
    .where('email', '!=', '')
    .orderBy('name')
    .get()
    .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() } as User)));
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

  writeFileSync('data/readability_train.jsonl', toJsonl(train), 'utf8');
  writeFileSync('data/readability_val.jsonl', toJsonl(val), 'utf8');

  console.log(`Readability dataset: ${train.length} train, ${val.length} val`);
  console.log('Written to data/readability_train.jsonl and data/readability_val.jsonl');
  console.log('\nNEXT: augment by running ESLint on open-source code and pairing violations with their auto-fix (target: 80+ high-quality examples).');
}

buildDataset();
