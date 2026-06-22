# BugTrap

Automated multi-agent code-review co-pilot. Detects hardcoded secrets and produces
mechanical fixes or precise human-reviewable diffs.

---

## Secret Detector → Fix Agent → Apply pipeline

### How it works

```
source file
    │
    ▼
Secret Detector  (src/secretDetector.js)
    │   reads agents/secret-detector-agent.md
    │   calls Gemini → JSON findings
    │
    ▼
Fix Agent        (src/fixAgent.js)
    │   reads agents/fix-agent.md
    │   calls Gemini with findings → JSON fixes
    │   classifies each fix as:
    │     "auto"    — mechanical env-var replacement, safe to write
    │     "suggest" — multi-line / complex / low-confidence → human diff only
    │
    ▼
Apply Fixes      (src/applyFixes.js)
        for "auto":    writes <file>.bugtrap-fixed  +  appends to .env.example
        for "suggest": prints unified diff, touches nothing
```

### Run the test chain

```bash
# Requires: GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION in .env.local
# and: gcloud auth application-default login

node src/test.js
```

Runs a sample file with two planted secrets through the full pipeline (dry-run —
no files are written unless you pass `--apply`).

### Apply auto-fixes to a real file

```bash
# 1. Detect secrets
node -e "
  import('./src/secretDetector.js').then(async m => {
    const fs = await import('fs');
    const code = fs.readFileSync('path/to/file.js', 'utf-8');
    const r = await m.scanForSecrets('path/to/file.js', code);
    fs.writeFileSync('detector-out.json', JSON.stringify(r));
    console.log(r.summary);
  });
"

# 2. Generate fixes
node -e "
  import('./src/fixAgent.js').then(async m => {
    const fs = await import('fs');
    const code = fs.readFileSync('path/to/file.js', 'utf-8');
    const det  = JSON.parse(fs.readFileSync('detector-out.json', 'utf-8'));
    const r    = await m.generateFixes('path/to/file.js', code, det.findings);
    fs.writeFileSync('fixes.json', JSON.stringify(r, null, 2));
    console.log(r.summary);
  });
"

# 3a. Dry-run (default — shows what would change, writes nothing)
node src/applyFixes.js fixes.json

# 3b. Apply (writes .bugtrap-fixed files and appends to .env.example)
node src/applyFixes.js fixes.json --apply
```

### Safety rules

| Fix type | Writes files? | Human approval needed? | Rotation warning? |
|---|---|---|---|
| `auto` | Yes — to `<file>.bugtrap-fixed` (never in-place) | No | Always |
| `suggest` | Never | Yes — shows diff only | When credential detected |

Secrets that were ever hardcoded in a file are marked `rotation_required: true`.
Rotating them (invalidating the old value in the upstream service) is mandatory
regardless of whether the fix is applied — the value may already be in git history.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
