/**
 * Security agent dataset preparation.
 *
 * REAL DATA SOURCES (download manually before running):
 *   - Devign / Big-Vul  https://github.com/ZeoVan/MSR_20_Code_vulnerability_CSV_Dataset
 *   - CVEfixes          https://github.com/secureIT-project/CVEfixes
 *   - OWASP Benchmark   https://github.com/OWASP-Benchmark/BenchmarkJava
 *   - SARD / Juliet     https://samate.nist.gov/SARD/
 *
 * Normalization contract:
 *   Each raw example must map to: (vulnerable_code, findings[]) where findings
 *   follow our SFTFinding schema. Negative examples (clean code) should make up
 *   ~20% of the dataset so the model learns to say {"findings":[]} correctly.
 *
 * JSONL is written to: data/security_train.jsonl, data/security_val.jsonl
 */

import { writeFileSync, mkdirSync } from 'fs';
import { makeExample, toJsonl, splitDataset, type SFTFinding } from './dataset-format';

const INSTRUCTION =
  'Review this code for security vulnerabilities. Return findings JSON only.';

// ── Curated seed examples ─────────────────────────────────────────────────────
// Enough to validate the pipeline end-to-end. Replace / augment with real
// labeled data from the sources above before running production SFT jobs.

const SEED_EXAMPLES: Array<{ code: string; findings: SFTFinding[] }> = [
  {
    code: `// Express route
app.get('/user', (req, res) => {
  const id = req.query.id;
  const q = "SELECT * FROM users WHERE id = " + id;
  db.query(q, (err, rows) => res.json(rows));
});`,
    findings: [
      { line: 4, severity: 'CRITICAL', confidence: 0.98, type: 'sql_injection', message: 'Unsanitized user input concatenated directly into SQL query. Use parameterized queries.' },
    ],
  },
  {
    code: `app.get('/search', (req, res) => {
  const term = req.query.q;
  res.send('<p>Results for: ' + term + '</p>');
});`,
    findings: [
      { line: 3, severity: 'HIGH', confidence: 0.95, type: 'xss', message: 'Unescaped user input rendered directly into HTML response, enabling reflected XSS.' },
    ],
  },
  {
    code: `const path = require('path');
app.get('/file', (req, res) => {
  const name = req.query.name;
  const full = path.join(__dirname, 'uploads', name);
  res.sendFile(full);
});`,
    findings: [
      { line: 4, severity: 'HIGH', confidence: 0.92, type: 'path_traversal', message: 'User-controlled filename joined to base path without sanitization. Attacker can read arbitrary files via ../../etc/passwd.' },
    ],
  },
  {
    code: `const API_KEY = "sk-prod-abc123xyz789";
const DB_PASS = "hunter2";

async function callOpenAI(prompt) {
  return fetch("https://api.openai.com/v1/chat/completions", {
    headers: { Authorization: \`Bearer \${API_KEY}\` },
    body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
  });
}`,
    findings: [
      { line: 1, severity: 'CRITICAL', confidence: 0.99, type: 'exposed_secret', message: 'API key hardcoded in source. Anyone with repo access has production credentials.' },
      { line: 2, severity: 'CRITICAL', confidence: 0.99, type: 'exposed_secret', message: 'Database password hardcoded in source.' },
    ],
  },
  {
    code: `app.post('/upload', upload.single('file'), (req, res) => {
  const cmd = \`convert \${req.file.path} output.jpg\`;
  exec(cmd, (err, stdout) => res.send(stdout));
});`,
    findings: [
      { line: 2, severity: 'CRITICAL', confidence: 0.97, type: 'command_injection', message: 'User-controlled file path interpolated into shell command. Attacker can execute arbitrary OS commands.' },
    ],
  },
  {
    code: `function hashPassword(password) {
  return crypto.createHash('md5').update(password).digest('hex');
}`,
    findings: [
      { line: 2, severity: 'HIGH', confidence: 0.93, type: 'weak_crypto', message: 'MD5 is cryptographically broken. Use bcrypt, scrypt, or Argon2 for password hashing.' },
    ],
  },
  {
    code: `app.post('/login', (req, res) => {
  const { user, pass } = req.body;
  const q = \`SELECT * FROM users WHERE username='\${user}' AND password='\${pass}'\`;
  db.query(q, (err, rows) => {
    if (rows.length) res.json({ token: generateToken(rows[0]) });
    else res.status(401).end();
  });
});`,
    findings: [
      { line: 3, severity: 'CRITICAL', confidence: 0.99, type: 'sql_injection', message: 'Username and password interpolated into SQL. An attacker can bypass auth with user\' OR \'1\'=\'1.' },
      { line: 3, severity: 'HIGH', confidence: 0.85, type: 'plaintext_password', message: 'Password compared in SQL suggests plaintext storage. Passwords must be hashed.' },
    ],
  },
  {
    code: `app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});`,
    findings: [
      { line: 2, severity: 'HIGH', confidence: 0.88, type: 'cors_misconfiguration', message: 'Wildcard origin combined with Allow-Credentials: true is invalid and rejected by browsers, but the intent is dangerous. Enumerate allowed origins explicitly.' },
    ],
  },
  {
    code: `function deserialize(data: string) {
  return eval('(' + data + ')');
}`,
    findings: [
      { line: 2, severity: 'CRITICAL', confidence: 0.99, type: 'unsafe_eval', message: 'eval() on untrusted input allows arbitrary code execution. Use JSON.parse() instead.' },
    ],
  },
  // Negative examples — clean code, no findings
  {
    code: `import { hash, compare } from 'bcrypt';

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return compare(plain, hashed);
}`,
    findings: [],
  },
  {
    code: `import { db } from './db';

export async function getUserById(id: number) {
  const rows = await db.query('SELECT id, name, email FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}`,
    findings: [],
  },
  {
    code: `import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.json({ limit: '10kb' }));`,
    findings: [],
  },
];

function buildDataset(): void {
  const examples = SEED_EXAMPLES.map(({ code, findings }) =>
    makeExample(INSTRUCTION, code, findings)
  );

  const { train, val } = splitDataset(examples);
  mkdirSync('data', { recursive: true });

  writeFileSync('data/security_train.jsonl', toJsonl(train), 'utf8');
  writeFileSync('data/security_val.jsonl', toJsonl(val), 'utf8');

  console.log(`Security dataset: ${train.length} train, ${val.length} val`);
  console.log('Written to data/security_train.jsonl and data/security_val.jsonl');
  console.log('\nNEXT: augment with real data from Devign/Big-Vul/CVEfixes (target: 100+ examples).');
}

buildDataset();
