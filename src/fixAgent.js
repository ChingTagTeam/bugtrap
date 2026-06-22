import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { GoogleGenAI } from '@google/genai';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SYSTEM_PROMPT = readFileSync(
    join(__dirname, '../agents/fix-agent.md'),
    'utf-8'
);

const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
});

const EXT_TO_LANGUAGE = {
    '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
    '.ts': 'TypeScript', '.tsx': 'TypeScript',
    '.py': 'Python',
    '.json': 'JSON',
    '.yml': 'YAML', '.yaml': 'YAML',
    '.env': 'ENV', '.example': 'ENV',
    '.sh': 'Shell', '.bash': 'Shell',
    '.rb': 'Ruby',
    '.go': 'Go',
    '.java': 'Java',
};

function detectLanguage(filePath) {
    return EXT_TO_LANGUAGE[extname(filePath).toLowerCase()] ?? 'Unknown';
}

/**
 * @param {string} filePath - relative path shown to the agent (used for context)
 * @param {string} fileContents - full source of the file
 * @param {Array}  detectorFindings - the `findings` array from the Secret Detector
 * @returns {Promise<{fixes: Array, summary: {auto_fixes: number, suggested_fixes: number}}>}
 */
export async function generateFixes(filePath, fileContents, detectorFindings) {
    if (!detectorFindings || detectorFindings.length === 0) {
        return { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } };
    }

    const language = detectLanguage(filePath);

    const userTurn =
        `FILE: ${filePath}\n` +
        `LANGUAGE: ${language}\n\n` +
        `${fileContents}\n\n` +
        `FINDINGS:\n${JSON.stringify(detectorFindings, null, 2)}`;

    const resp = await ai.models.generateContent({
        model: process.env.TUNED_MODEL_FIX ?? 'gemini-2.5-pro',
        config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            temperature: 0,
        },
        contents: userTurn,
    });

    const raw = resp.text;
    try {
        return JSON.parse(raw);
    } catch (err) {
        console.error('Fix agent returned invalid JSON:', raw);
        throw err;
    }
}
