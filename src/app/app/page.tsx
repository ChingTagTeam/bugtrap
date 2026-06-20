'use client';

import { useState, useRef } from 'react';
import type {
  AgentName,
  AgentStatus,
  Finding,
  RankedFinding,
  Verdict,
  PatchOutput,
  SSEEvent,
  Disagreement,
} from '@/lib/types';
import Image from 'next/image';
import Link from 'next/link';

type InputMode = 'paste' | 'pr';

const AGENT_LABELS: Record<AgentName, string> = {
  security: 'SECURITY',
  correctness: 'CORRECTNESS',
  readability: 'READABILITY',
};

const AGENT_COLOR: Record<AgentName, string> = {
  security: '#ff5d6c',
  correctness: '#83C818',
  readability: '#54b8ff',
};

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#ff5d6c',
  HIGH: '#ff8c42',
  MEDIUM: '#f4c430',
  LOW: '#54b8ff',
  INFO: '#8b8fa8',
};

interface AgentState {
  status: AgentStatus;
  findings: Finding[];
  errorMsg?: string;
}

const INITIAL_AGENTS: Record<AgentName, AgentState> = {
  security: { status: 'idle', findings: [] },
  correctness: { status: 'idle', findings: [] },
  readability: { status: 'idle', findings: [] },
};

export default function AppPage() {
  const [inputMode, setInputMode] = useState<InputMode>('paste');
  const [code, setCode] = useState('');
  const [prUrl, setPrUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [coordinatorRunning, setCoordinatorRunning] = useState(false);
  const [agents, setAgents] = useState<Record<AgentName, AgentState>>(INITIAL_AGENTS);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [patch, setPatch] = useState<PatchOutput | null>(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [githubStatus, setGithubStatus] = useState<{
    comments?: number;
    status?: 'success' | 'failure';
    fixPr?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const setAgentPatch = (agent: AgentName, patch: Partial<AgentState>) =>
    setAgents((prev) => ({ ...prev, [agent]: { ...prev[agent], ...patch } }));

  const canScan =
    inputMode === 'paste' ? code.trim().length > 0 : prUrl.trim().length > 0;

  async function scan() {
    if (!canScan || scanning) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setScanning(true);
    setCoordinatorRunning(false);
    setAgents(INITIAL_AGENTS);
    setVerdict(null);
    setPatch(null);
    setPatchLoading(false);
    setReviewId(null);
    setGithubStatus({});
    setError(null);

    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          inputMode === 'paste' ? { mode: 'paste', code } : { mode: 'pr', prUrl }
        ),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) throw new Error(`Request failed: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            handleEvent(JSON.parse(line.slice(6)) as SSEEvent);
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(String(err));
    } finally {
      setScanning(false);
      setCoordinatorRunning(false);
    }
  }

  function handleEvent(event: SSEEvent) {
    switch (event.type) {
      case 'agent_start':
        setAgentPatch(event.agent, { status: 'running' });
        break;
      case 'agent_complete':
        setAgentPatch(event.agent, { status: 'complete', findings: event.findings });
        break;
      case 'agent_error':
        setAgentPatch(event.agent, { status: 'error', errorMsg: event.message });
        break;
      case 'coordinator_start':
        setCoordinatorRunning(true);
        break;
      case 'verdict':
        setCoordinatorRunning(false);
        setVerdict(event.verdict);
        break;
      case 'patch_start':
        setPatchLoading(true);
        break;
      case 'patch_complete':
        setPatchLoading(false);
        setPatch(event.patch);
        break;
      case 'saved':
        setReviewId(event.reviewId);
        break;
      case 'github_comments':
        setGithubStatus((s) => ({ ...s, comments: event.count }));
        break;
      case 'github_status':
        setGithubStatus((s) => ({ ...s, status: event.state }));
        break;
      case 'github_fix_pr':
        setGithubStatus((s) => ({ ...s, fixPr: event.prUrl }));
        break;
      case 'error':
        setError(event.message);
        break;
    }
  }

  const anyAgentActive = (Object.values(agents) as AgentState[]).some(
    (a) => a.status !== 'idle'
  );
  const totalFindings = verdict?.rankedFindings.length ?? 0;

  return (
    <div style={{ minHeight: '100vh', background: '#0d0e12', color: '#e8e9f0', fontFamily: 'Archivo, sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #1e2030', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <Image src="/BugTrap-logo.png" alt="BugTrap" width={28} height={28} />
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#e8e9f0', letterSpacing: '0.04em' }}>BUGTRAP</span>
        </Link>
      </nav>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px' }}>
        {/* Input mode tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: '#13141a', borderRadius: '6px', padding: '4px', width: 'fit-content' }}>
          {(['paste', 'pr'] as InputMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setInputMode(m)}
              style={{
                padding: '8px 20px',
                background: inputMode === m ? '#1e2030' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: inputMode === m ? '#e8e9f0' : '#8b8fa8',
                fontFamily: 'Archivo, sans-serif',
                fontWeight: 600,
                fontSize: '12px',
                letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              {m === 'paste' ? 'PASTE CODE' : 'GITHUB PR'}
            </button>
          ))}
        </div>

        {/* Input area */}
        <section style={{ marginBottom: '40px' }}>
          {inputMode === 'paste' ? (
            <>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#8b8fa8', marginBottom: '10px' }}>
                PASTE YOUR CODE
              </label>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="// Paste a file, function, or snippet..."
                spellCheck={false}
                style={{
                  width: '100%',
                  minHeight: '240px',
                  background: '#13141a',
                  border: '1px solid #1e2030',
                  borderRadius: '6px',
                  padding: '16px',
                  color: '#e8e9f0',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  resize: 'vertical',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#83C818'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#1e2030'; }}
              />
            </>
          ) : (
            <>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#8b8fa8', marginBottom: '10px' }}>
                GITHUB PR URL
              </label>
              <input
                type="url"
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/pull/123"
                style={{
                  width: '100%',
                  background: '#13141a',
                  border: '1px solid #1e2030',
                  borderRadius: '6px',
                  padding: '14px 16px',
                  color: '#e8e9f0',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#83C818'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#1e2030'; }}
              />
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#8b8fa8' }}>
                BugTrap will fetch the diff, post inline review comments, set a commit status, and open a fix PR.
              </p>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button
              onClick={scan}
              disabled={!canScan || scanning}
              style={{
                background: scanning || !canScan ? '#1e2030' : '#83C818',
                color: scanning || !canScan ? '#8b8fa8' : '#0d0e12',
                border: 'none',
                borderRadius: '4px',
                padding: '10px 24px',
                fontFamily: 'Archivo, sans-serif',
                fontWeight: 700,
                fontSize: '13px',
                letterSpacing: '0.08em',
                cursor: scanning || !canScan ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {scanning ? 'SCANNING...' : 'SCAN →'}
            </button>
          </div>
        </section>

        {/* Agent progress */}
        {anyAgentActive && (
          <section style={{ marginBottom: '40px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#8b8fa8', marginBottom: '16px' }}>
              ANALYSIS PROGRESS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(Object.entries(agents) as [AgentName, AgentState][]).map(([name, state]) => (
                <AgentRow key={name} name={name} state={state} />
              ))}
              {coordinatorRunning && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', background: '#13141a', borderRadius: '6px', border: '1px solid #1e2030' }}>
                  <div style={{ width: '90px', flexShrink: 0 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', fontWeight: 700, color: '#83C818', letterSpacing: '0.08em' }}>COORD.</span>
                  </div>
                  <div style={{ flex: 1, height: '4px', background: '#1e2030', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '2px', background: '#83C818', width: '70%', opacity: 0.7, transition: 'width 0.6s ease' }} />
                  </div>
                  <div style={{ width: '120px', flexShrink: 0, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#8b8fa8' }}>
                    reconciling...
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Disagreements */}
        {verdict && verdict.disagreements.length > 0 && (
          <section style={{ marginBottom: '40px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#8b8fa8', marginBottom: '16px' }}>
              AGENT DISAGREEMENTS — {verdict.disagreements.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {verdict.disagreements.map((d, i) => (
                <DisagreementRow key={i} d={d} />
              ))}
            </div>
          </section>
        )}

        {/* Findings */}
        {verdict && verdict.rankedFindings.length > 0 && (
          <section style={{ marginBottom: '40px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#8b8fa8', marginBottom: '16px' }}>
              FINDINGS — {totalFindings} ISSUE{totalFindings !== 1 ? 'S' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {verdict.rankedFindings.map((f, i) => (
                <FindingRow key={i} finding={f} />
              ))}
            </div>
          </section>
        )}

        {/* Verdict gate */}
        {verdict && !scanning && <VerdictGate verdict={verdict} reviewId={reviewId} githubStatus={githubStatus} />}

        {/* Patch */}
        {(patchLoading || patch) && (
          <section style={{ marginTop: '32px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#8b8fa8', marginBottom: '16px' }}>
              AUTOMATED FIX
            </div>
            {patchLoading && !patch && (
              <div style={{ color: '#8b8fa8', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>generating fix...</div>
            )}
            {patch && (
              <div style={{ background: '#13141a', border: '1px solid #1e2030', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e2030', fontSize: '13px', color: '#c8c9d8' }}>
                  {patch.description}
                </div>
                <pre style={{ margin: 0, padding: '16px', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', lineHeight: '1.6', color: '#e8e9f0', overflowX: 'auto', maxHeight: '400px' }}>
                  {patch.fixedCode}
                </pre>
              </div>
            )}
          </section>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: '#1a0f10', border: '1px solid #ff5d6c', borderRadius: '6px', padding: '16px', color: '#ff5d6c', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', marginTop: '24px' }}>
            ERROR: {error}
          </div>
        )}
      </main>
    </div>
  );
}

function AgentRow({ name, state }: { name: AgentName; state: AgentState }) {
  const color = state.status === 'error' ? '#8b8fa8' : AGENT_COLOR[name];
  const label = AGENT_LABELS[name];
  const count = state.findings.length;

  const statusLabel =
    state.status === 'idle' ? 'waiting' :
    state.status === 'running' ? 'scanning...' :
    state.status === 'error' ? `degraded (${state.errorMsg ?? 'error'})` :
    `${count} finding${count !== 1 ? 's' : ''}`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', background: '#13141a', borderRadius: '6px', border: '1px solid #1e2030' }}>
      <div style={{ width: '90px', flexShrink: 0 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', fontWeight: 700, color, letterSpacing: '0.08em' }}>{label}</span>
      </div>
      <div style={{ flex: 1, height: '4px', background: '#1e2030', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          borderRadius: '2px',
          background: state.status === 'error' ? '#8b8fa8' : color,
          width: state.status === 'idle' ? '0%' : state.status === 'running' ? '60%' : '100%',
          transition: 'width 0.6s ease',
          opacity: state.status === 'running' ? 0.7 : 1,
        }} />
      </div>
      <div style={{ width: '160px', flexShrink: 0, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#8b8fa8' }}>
        {statusLabel}
      </div>
    </div>
  );
}

function FindingRow({ finding }: { finding: RankedFinding }) {
  const color = SEVERITY_COLOR[finding.severity] ?? '#8b8fa8';
  const agentColor = AGENT_COLOR[finding.agent];
  const confidence = Math.round(finding.confidence * 100);

  return (
    <div style={{ background: '#13141a', border: '1px solid #1e2030', borderRadius: '6px', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', fontWeight: 700, color, letterSpacing: '0.08em' }}>
          [{finding.severity}]
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#8b8fa8' }}>
          {finding.type}
        </span>
        {finding.line && (
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#8b8fa8' }}>
            line {finding.line}
          </span>
        )}
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#8b8fa8' }}>
          {confidence}% confidence
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: agentColor, letterSpacing: '0.06em' }}>
          {finding.agent.toUpperCase()}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: '13px', color: '#c8c9d8', lineHeight: '1.5' }}>
        {finding.message}
      </p>
    </div>
  );
}

function DisagreementRow({ d }: { d: Disagreement }) {
  return (
    <div style={{ background: '#13141a', border: '1px solid #2a1f10', borderRadius: '6px', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#f4c430', fontWeight: 700 }}>
          ⚡ DISAGREEMENT
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#8b8fa8' }}>
          {d.type}
        </span>
        {d.line && (
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#8b8fa8' }}>
            line {d.line}
          </span>
        )}
      </div>
      <div style={{ fontSize: '12px', color: '#8b8fa8', marginBottom: '4px', fontFamily: 'JetBrains Mono, monospace' }}>
        {d.agents.map((a) => `${a}: ${d.severities[a] ?? '?'}`).join(' · ')} → coordinator ruled{' '}
        <span style={{ color: SEVERITY_COLOR[d.coordinatorRuling] ?? '#e8e9f0', fontWeight: 700 }}>{d.coordinatorRuling}</span>
      </div>
      <p style={{ margin: 0, fontSize: '13px', color: '#c8c9d8', lineHeight: '1.5' }}>
        {d.reason}
      </p>
    </div>
  );
}

function VerdictGate({
  verdict,
  reviewId,
  githubStatus,
}: {
  verdict: Verdict;
  reviewId: string | null;
  githubStatus: { comments?: number; status?: 'success' | 'failure'; fixPr?: string };
}) {
  const blocked = !verdict.safe;
  const accentColor = blocked ? '#ff5d6c' : '#83C818';

  return (
    <section style={{ marginTop: '40px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#8b8fa8', marginBottom: '16px' }}>
        VERDICT
      </div>
      <div style={{ border: `1px solid ${accentColor}`, borderRadius: '8px', padding: '24px', background: blocked ? 'rgba(255,93,108,0.06)' : 'rgba(131,200,24,0.06)' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '18px', fontWeight: 700, color: accentColor, marginBottom: '10px', letterSpacing: '0.04em' }}>
          {blocked
            ? `⛔ BLOCKED ON ${verdict.blockedOn} CRITICAL FINDING${verdict.blockedOn !== 1 ? 'S' : ''}`
            : '✓ SAFE TO MERGE'}
        </div>
        <p style={{ margin: 0, color: '#c8c9d8', fontSize: '14px', lineHeight: '1.6' }}>
          {verdict.summary}
        </p>
        <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '16px', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#8b8fa8' }}>
          {reviewId && <span>review id: {reviewId}</span>}
          {githubStatus.comments !== undefined && (
            <span>✓ {githubStatus.comments} inline comment{githubStatus.comments !== 1 ? 's' : ''} posted</span>
          )}
          {githubStatus.status && (
            <span>✓ commit status: {githubStatus.status}</span>
          )}
          {githubStatus.fixPr && (
            <a href={githubStatus.fixPr} target="_blank" rel="noreferrer" style={{ color: '#83C818' }}>
              ✓ fix PR opened →
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
