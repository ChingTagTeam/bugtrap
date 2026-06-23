/**
 * applyFixes.js
 *
 * Takes fix-agent output and either dry-runs (default) or applies auto fixes.
 *
 * CLI usage:
 *   node src/applyFixes.js fixes.json             # dry-run — shows what would change
 *   node src/applyFixes.js fixes.json --apply     # writes <file>.sidecode-fixed + .env.example
 *
 * Module usage:
 *   import { applyFixes } from './applyFixes.js';
 *   await applyFixes(fixOutput, { apply: false });
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── helpers ──────────────────────────────────────────────────────────────────

function label(tag, text) {
    console.log(`\n[${tag}] ${text}`);
}

/** Replace content at a specific 1-indexed line with new text. */
function replaceLineInContent(content, lineNumber, newLine) {
    const lines = content.split('\n');
    const idx = lineNumber - 1;
    if (idx < 0 || idx >= lines.length) {
        throw new Error(`Line ${lineNumber} out of range (file has ${lines.length} lines)`);
    }
    lines[idx] = newLine.replace(/\n$/, ''); // strip trailing newline — we rejoin with \n
    return lines.join('\n');
}

/** Naively apply all auto-fix line replacements to file content.
 *  Sorts descending by line so edits don't shift subsequent line numbers. */
function applyAutoFixesToContent(content, fixes) {
    const sorted = [...fixes].sort((a, b) => b.line - a.line);
    let result = content;
    for (const fix of sorted) {
        result = replaceLineInContent(result, fix.line, fix.fixed_snippet);
    }
    return result;
}

/** Collect unique .env.example lines from supporting_changes across all auto fixes. */
function collectEnvLines(autoFixes) {
    const seen = new Set();
    const lines = [];
    for (const fix of autoFixes) {
        for (const sc of (fix.supporting_changes ?? [])) {
            if (sc.file === '.env.example' && !seen.has(sc.change)) {
                seen.add(sc.change);
                lines.push(sc.change);
            }
        }
    }
    return lines;
}

// ─── core ─────────────────────────────────────────────────────────────────────

/**
 * @param {{ fixes: Array, summary: object }} fixOutput - output from generateFixes()
 * @param {{ apply?: boolean, cwd?: string }} options
 *   apply — if true, write .sidecode-fixed files and append to .env.example
 *   cwd   — base directory for resolving file paths (defaults to process.cwd())
 */
export async function applyFixes(fixOutput, { apply = false, cwd = process.cwd() } = {}) {
    const { fixes, summary } = fixOutput;

    if (!fixes || fixes.length === 0) {
        console.log('No fixes to apply.');
        return;
    }

    const mode = apply ? 'APPLY' : 'DRY-RUN';
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  Sidecode Fix Agent — ${mode}`);
    console.log(`  ${summary.auto_fixes} auto  |  ${summary.suggested_fixes} suggested`);
    console.log('═'.repeat(60));

    const autoFixes    = fixes.filter(f => f.fix_type === 'auto');
    const suggestFixes = fixes.filter(f => f.fix_type === 'suggest');

    // ── suggested fixes (never applied automatically) ─────────────────────────
    for (const fix of suggestFixes) {
        label('SUGGEST', `${fix.file}:${fix.line}  [${fix.finding_ref}]`);
        console.log(`  Explanation: ${fix.explanation}`);
        if (fix.rotation_required) {
            console.log('  ⚠️  ROTATION REQUIRED — this credential may be in git history');
        }
        console.log('\n  Proposed diff (review before applying):');
        console.log('  ' + fix.fixed_snippet.split('\n').join('\n  '));
        if (fix.supporting_changes?.length) {
            console.log('\n  Supporting changes needed:');
            for (const sc of fix.supporting_changes) {
                console.log(`    ${sc.file}: ${sc.change}`);
            }
        }
        console.log('\n  ↳ Action required: review the diff above and apply manually.');
    }

    // ── auto fixes — grouped by file ──────────────────────────────────────────
    // Group by file so we read/write each file once.
    const byFile = new Map();
    for (const fix of autoFixes) {
        if (!byFile.has(fix.file)) byFile.set(fix.file, []);
        byFile.get(fix.file).push(fix);
    }

    for (const [file, fileFixes] of byFile) {
        const srcPath = `${cwd}/${file}`;
        const outPath = `${srcPath}.sidecode-fixed`;

        label('AUTO', `${file}  (${fileFixes.length} fix${fileFixes.length !== 1 ? 'es' : ''})`);

        for (const fix of fileFixes.sort((a, b) => a.line - b.line)) {
            console.log(`  line ${fix.line}  [${fix.finding_ref}]`);
            console.log(`    - ${fix.original_snippet.trim()}`);
            console.log(`    + ${fix.fixed_snippet.trim()}`);
            if (fix.rotation_required) {
                console.log('    ⚠️  ROTATION REQUIRED');
            }
        }

        if (apply) {
            if (!existsSync(srcPath)) {
                console.log(`  ✗ Source file not found: ${srcPath} — skipping`);
                continue;
            }
            const original = readFileSync(srcPath, 'utf-8');
            const patched  = applyAutoFixesToContent(original, fileFixes);
            writeFileSync(outPath, patched, 'utf-8');
            console.log(`  ✓ Written: ${outPath}`);
        } else {
            console.log(`  ↳ Dry-run: would write → ${outPath}`);
        }
    }

    // ── .env.example additions ─────────────────────────────────────────────────
    const envLines = collectEnvLines(autoFixes);
    if (envLines.length > 0) {
        const envPath = `${cwd}/.env.example`;
        label('ENV', `.env.example  (+${envLines.length} key${envLines.length !== 1 ? 's' : ''})`);
        for (const line of envLines) {
            console.log(`  + ${line}`);
        }
        if (apply) {
            const header = '\n# ── Sidecode auto-fix additions ──\n';
            appendFileSync(envPath, header + envLines.join('\n') + '\n', 'utf-8');
            console.log(`  ✓ Appended to: ${envPath}`);
        } else {
            console.log(`  ↳ Dry-run: would append to ${envPath}`);
        }
    }

    console.log(`\n${'═'.repeat(60)}`);
    if (!apply && (autoFixes.length > 0 || envLines.length > 0)) {
        console.log('  Re-run with --apply to write the changes.');
    }
    console.log('═'.repeat(60) + '\n');
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args    = process.argv.slice(2);
    const doApply = args.includes('--apply');
    const fixFile = args.find(a => !a.startsWith('--'));

    if (!fixFile) {
        console.error('Usage: node src/applyFixes.js <fixes.json> [--apply]');
        process.exit(1);
    }

    const fixOutput = JSON.parse(readFileSync(fixFile, 'utf-8'));
    await applyFixes(fixOutput, { apply: doApply });
}
