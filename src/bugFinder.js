import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GoogleGenAI } from '@google/genai';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the system instruction once at module load
const SYSTEM_PROMPT = readFileSync(
    join(__dirname, '../agents/bug-finder-agent.md'),
    'utf-8'
);

const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
});

export async function findBugs(filePath, fileContents) {
    const resp = await ai.models.generateContent({
        model: process.env.TUNED_MODEL_CORRECTNESS ?? 'gemini-2.5-pro',
        config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: 'application/json', // forces clean JSON output
            temperature: 0,                       // deterministic, no creativity
        },
        contents: `Review this file for correctness and logic bugs.

FILE: ${filePath}

\`\`\`
${fileContents}
\`\`\``,
    });

    // Parse the JSON the agent returns
    const raw = resp.text;
    try {
        return JSON.parse(raw);
    } catch (err) {
        console.error('Failed to parse bug-finder output:', raw);
        throw err;
    }
}
