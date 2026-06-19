# BugTrap — Project Specification

Automated multi-agent code-review co-pilot for the "vibe-coding" era. You give it code (a file, a function, or a GitHub PR); a panel of specialized AI reviewers inspects it in parallel; a coordinator reconciles their findings into one prioritized verdict; a fixer agent patches the issues. Built on Gemini + Vertex AI + ADK + Firebase + the GitHub API.

---

## 1. Competition fit

| Hard requirement | How BugTrap satisfies it |
|---|---|
| Use a Google technology (Gemini required) | Every agent runs Gemini, served through Vertex AI |
| Multi-agent system, >= 2 specialized sub-agents | Three specialist reviewers (security, correctness, readability), run in parallel |
| A coordinating agent that synthesizes (not concatenates) | Coordinator dedupes, resolves severity conflicts, weights by confidence, emits one verdict |
| Input is a file, function, or PR | Paste box for file/function; GitHub PR diff fetch via Octokit |
| Output is a structured review report | Typed findings + ranked verdict, stored and rendered |

Google techs claimed: **Gemini + ADK + Vertex AI + Firebase** (four), plus the GitHub API for repo connection.

---

## 2. Features

### Core (qualifies us, build first)
1. **Three input modes** — paste a file, paste a function, or point at a GitHub PR.
2. **Three parallel specialist reviewers** — security, correctness, readability.
3. **Coordinator reconciliation** — dedupe overlapping findings, resolve severity disagreements, weight by confidence, produce one prioritized verdict.
4. **Structured report** — typed findings (line, severity, confidence, message), ordered worst-first.
5. **Verdict gate** — a single headline: "Safe to merge" or "Blocked on N critical findings."
6. **Live per-agent progress** — each reviewer and the coordinator stream their status to the UI as they work (the landing-page scanner card is the visual).

### Depth boosters (where the technical-depth score is won)
7. **Disagreement surfacing** — "2 of 3 agents flagged this line; security HIGH, correctness LOW; coordinator ruled HIGH because ..."
8. **Inter-agent context passing** — the security agent's findings inform what the correctness agent prioritizes.
9. **Confidence scores per finding** — each agent self-reports confidence; the coordinator weights synthesis by it.
10. **Graceful degradation** — if one agent times out, the coordinator still produces a verdict from the rest and notes the gap.
11. **Three tuned specialists** — security, correctness, and readability each run a Gemini model fine-tuned on task-specific data via Vertex AI (see Section 5).
12. **Eval-backed tuning** — ADK's evaluation harness scores base vs tuned models on the planted-bug repo, so each tuned model is kept only if it measurably wins, and we get a hard number for the writeup.

### Fixer + demo boosters (applicability score)
13. **Patch agent** — generates fixed code / a diff for the findings.
14. **Auto-fix PR** — Octokit opens a PR with the fix.
15. **Inline PR review comments** — findings posted on the exact lines via Octokit.
16. **Commit status check** — pass/fail status set on the PR, so BugTrap acts as a real CI merge gate.
17. **Known-good demo repo** — a small repo with planted, diverse bugs so every agent fires reliably on stage.

---

## 3. Technical architecture

### Stack
- **Front end:** Next.js (App Router) + TypeScript + Tailwind. Landing page (done) + app page (input + live results). Talks to the backend over SSE.
- **Backend:** Node/TypeScript service on **Cloud Run** (or Firebase App Hosting backend, which is Cloud Run underneath). One streaming endpoint.
- **Orchestration:** **ADK (TypeScript)** — `ParallelAgent`, `SequentialAgent`, `LlmAgent`.
- **Model:** **Gemini** via the Gen AI SDK with `GOOGLE_GENAI_USE_VERTEXAI=true` so calls are served on **Vertex AI**. Structured output for typed findings.
- **Training:** **Vertex AI supervised fine-tuning** for all three reviewer agents.
- **Data / auth:** **Firebase** — Firestore (reviews, findings, verdicts), Firebase Auth (login).
- **Repo connection:** **GitHub API** via Octokit (PR diff in; comments + status + fix PR out).

### What we use from ADK (and what we skip)
Use, because each directly helps:
- **Workflow agents (Parallel + Sequential)** — the orchestration itself: fan out the three reviewers, then run coordinator and patch in sequence.
- **Shared session state (`output_key`)** — agents hand findings to each other and to the coordinator with no glue code; this is how inter-agent context passing works.
- **Callbacks (before/after agent)** — fire the per-agent live progress events to the SSE stream, and catch an agent error to trigger graceful degradation.
- **Function tools** — wrap the Octokit calls (fetch diff, post comment, set status, open PR) as typed, traced tools.
- **Built-in evaluation** — run base vs tuned models against the planted-bug demo repo to decide whether each tuned model is kept, and to produce a hard metric for the writeup.

Skip, no advantage here: long-term memory / Vertex Memory Bank (reviews are stateless), bidirectional audio/video, the planner, artifact management, multi-model switching.

> TS caveat: the eval framework is strongest in Python ADK. If we stay TypeScript, confirm it exists in the port, or run a simple test script over the demo repo and cite that metric instead. Workflow agents, session state, callbacks, and function tools are solid in TS.

### Data flow
```
front end (paste or PR link)
   -> Cloud Run endpoint
   -> if PR: Octokit fetches the diff
   -> ADK SequentialAgent:
        1. ParallelAgent[ security, correctness, readability ]   (each writes typed JSON to shared state)
        2. Coordinator LlmAgent  (reconcile -> verdict)
        3. Patch agent            (generate fixes)
   -> verdict + findings saved to Firestore
   -> streamed to the front end via SSE (per-agent progress via ADK callbacks)
   -> if PR: Octokit posts inline comments, sets pass/fail status, opens fix PR
```

### Why each tech (for the written summary)
- **ADK** — native multi-agent orchestration in TypeScript; parallel fan-out, sequential synthesis, shared-state handoff, lifecycle callbacks for live progress, and a built-in evaluation harness, all first-class.
- **Gemini** — the reasoning engine inside every agent.
- **Vertex AI** — serves Gemini (one flag), trains and hosts the three tuned reviewer models, and is the production deployment path.
- **Firebase** — zero-ops data, auth, and hosting for a fast, reliable demo.
- **GitHub API** — turns the system into a real pre-merge CI gate, not a toy.

---

## 4. The agents

| Agent | Job | Model | Reads | Writes |
|---|---|---|---|---|
| **Security** | Find vulnerabilities (injection, authz, secrets, unsafe calls) | **Tuned Gemini** (Vertex SFT) | code / diff | `security_report` (typed findings + confidence) |
| **Correctness** | Find bugs, broken logic, edge cases | **Tuned Gemini** (Vertex SFT) | code / diff + `security_report` | `correctness_report` |
| **Readability** | Naming, structure, documentation, anti-patterns | **Tuned Gemini** (Vertex SFT) | code / diff | `readability_report` |
| **Coordinator** | Dedupe, resolve severity conflicts, weight by confidence, rank, emit verdict | Base Gemini (prompted) | all three reports | `verdict` (ranked findings + safe/blocked) |
| **Patch** | Generate fixed code / diff for the findings | Base Gemini (prompted) | code + `verdict` | `patch` (diff) |

Composition (ADK, TypeScript sketch):
```ts
const swarm = new ParallelAgent({ name: "ReviewSwarm",
  subAgents: [security, correctness, readability] });

const pipeline = new SequentialAgent({ name: "BugTrap",
  subAgents: [swarm, coordinator, patch] });
```

Every agent returns **structured JSON** via Gemini structured output, so there is no prose parsing and the contracts between agents are typed end to end.

---

## 5. Training plan (what, how, and the honest scope)

### What we train
**All three reviewer agents** — security, correctness, and readability — each fine-tuned on its own task-specific dataset via Vertex AI supervised fine-tuning. The coordinator and patch agents stay on prompted base Gemini (their jobs are reasoning over existing findings, not pattern-detection a tuned model improves).

The three datasets differ a lot in how easy the labels are to get. Be honest about that internally and budget time accordingly: security has the most real labeled data, correctness has some, readability has the least and will lean on a generated/curated set.

### Why tuning helps here
A model tuned on labeled examples learns to detect its category more consistently and to emit findings in our exact JSON shape every time. That is precisely what supervised fine-tuning is for: a well-defined task with labeled data and a fixed output format. Three tuned specialists is also a strong "we used Vertex AI for training, not just inference" story for the writeup.

### Data sources per agent (real, public where possible)
**Security** (strongest real data)
- **Devign / Big-Vul** — function-level vulnerable-vs-non-vulnerable code labeled from real CVEs.
- **OWASP Benchmark** — labeled test cases across common vulnerability classes.
- **SARD / Juliet** — large labeled suites of flawed and fixed code across languages.
- **CVEfixes** — CVE-linked commits pairing vulnerable code with its fix.

**Correctness** (some real data)
- **Defects4J** — reproducible real bugs with their fixes (Java).
- **QuixBugs / BugsInPy** — small labeled bug datasets (multi-language / Python).
- **GitHub bugfix commits** — mine "fix:" commits to pair buggy code with the corrected version.

**Readability** (least real data; curate/generate)
- **Lint/style corpora** — code flagged by ESLint/Pylint/SonarQube paired with the cleaned version (the linter is the labeler).
- **Refactoring commits** — "refactor:"/"rename"/"cleanup" commits as before/after pairs.
- Curate carefully; if labels end up generated, keep the set small and high-quality rather than large and noisy.

For each agent, normalize to our finding JSON format and follow the Vertex guidance: 16 examples minimum, start around 100, scale up if it helps, quality over quantity, plus a validation split.

### Dataset format (Vertex SFT, JSONL)
Each line is one example: the code as the user turn, the desired findings JSON as the model turn. Same shape for all three agents; only the instruction and labels differ.
```json
{"contents":[
  {"role":"user","parts":[{"text":"Review this code for security issues. Return findings JSON.\n\nconst q = \"SELECT * FROM users WHERE id = \" + req.params.id;\nconst rows = db.query(q);"}]},
  {"role":"model","parts":[{"text":"{\"findings\":[{\"line\":1,\"severity\":\"HIGH\",\"confidence\":0.95,\"type\":\"sql_injection\",\"message\":\"Unsanitized input concatenated into SQL query.\"}]}"}]}
]}
```

### Process (run once per agent)
1. Assemble + normalize each dataset to JSONL (`security_{train,val}.jsonl`, `correctness_{train,val}.jsonl`, `readability_{train,val}.jsonl`).
2. Upload to a Cloud Storage bucket in `us-central1`.
3. Launch a Vertex AI supervised fine-tuning job per agent on a current tunable Gemini (e.g. **Gemini 2.5 Flash** — verify the exact tunable model in the console, as the lineup moves and Vertex is folding into the Gemini Enterprise Agent Platform).
4. Vertex returns a tuned model endpoint per agent. Point each agent's `model` at its resource name.
5. Evaluate each tuned model against its validation set vs base Gemini; keep a tuned model only where it actually wins. An agent whose tuned model underperforms stays on base Gemini.

### The rule that keeps us from losing
**Build everything on base Gemini first, make tuning a per-agent swap-in.** Each agent is just a model name. Ship the full product working on prompted base models; as each tuned endpoint finishes and evaluates better, point that agent at it. The live demo must never depend on a tuning job finishing the night before, and the three jobs are independent, so any subset that lands in time is a win.

---

## 6. Build order

**Phase 1 — Core (must ship)**
Scaffold app page -> Cloud Run endpoint -> ADK Parallel[3] + Coordinator on base Gemini (Vertex-served), per-agent progress via callbacks -> structured findings -> Firestore -> SSE live progress -> verdict gate. Paste-input mode only.

**Phase 2 — Win features (committed)**
PR input via Octokit -> disagreement surfacing + confidence in the UI -> inter-agent context passing -> patch agent + auto-fix PR -> inline PR comments + commit status check -> graceful degradation -> demo repo with planted bugs.

**Phase 3 — Tuning + stretch (parallel track)**
Assemble the three datasets -> run the three Vertex SFT jobs -> use ADK eval on the demo repo to compare base vs tuned -> swap each tuned model in as it lands and beats base -> optional: sandbox-verified fixes (run the patch against a test before opening the PR), Vertex Agent Engine deploy story.

The patch agent is committed (Phase 2), not optional. If time runs short, cut from Phase 3 first (tuning degrades gracefully to base Gemini per agent), then trim Phase 2 demo boosters. Phase 1 is non-negotiable; it is the demo.

---

## 7. Risks and fallbacks

| Risk | Fallback |
|---|---|
| A tuning job isn't done / underperforms | That agent stays on base Gemini; jobs are per-agent and independent, so any subset that lands is a win. Tuning becomes a "production path" talking point if none land |
| SSE streaming flaky on the venue network | Pre-recorded demo run + the deterministic planted-bug repo |
| One agent times out live | Graceful degradation already returns a partial verdict and notes the gap |
| GitHub API rate limit / auth issue on stage | Demo the paste-input mode; PR mode as the secondary flow |
| ADK TypeScript edge cases | CustomAgent fallback, or run the orchestration as plain async calls with the same shape |

---

## 8. Google-tech checklist
- [x] Gemini API — engine for every agent
- [x] Vertex AI — serves Gemini, hosts the tuned security model, production deploy path
- [x] ADK — multi-agent orchestration (Parallel + Sequential + Loop)
- [x] Firebase — Firestore + Auth + hosting
- [x] GitHub API — PR input, inline comments, status check, fix PR