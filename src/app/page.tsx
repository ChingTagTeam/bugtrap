import Image from "next/image";
import CanvasBackground from "@/components/CanvasBackground";
import ScannerCard from "@/components/ScannerCard";
import PageInteractions from "@/components/PageInteractions";
import LandingNav from "@/components/landing/LandingNav";
import HeroCTA from "@/components/landing/HeroCTA";
import LiveCompanionGraph from "@/components/landing/LiveCompanionGraph";

const mono = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

/**
 * Sidecode landing page — a faithful React reproduction of
 * design/Sidecode-Landing.html. Server-rendered markup; client interactivity
 * (canvas, scanner state machine, live-companion graph, reveals, counters,
 * magnetic buttons, tilt, card hovers) lives in the client components and
 * PageInteractions. Copy, layout, spacing, fonts, colors, and motion match
 * the export.
 */
export default function Home() {
  return (
    <div className="sc-root">
      <CanvasBackground />
      <LandingNav />

      <span id="top" />

      {/* HERO */}
      <header
        className="sc-hero-grid"
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1280,
          margin: "0 auto",
          padding: "140px 32px 64px",
          display: "grid",
          gridTemplateColumns: "1.02fr 1.08fr",
          gap: 54,
          alignItems: "center",
        }}
      >
        <div>
          <h1
            className="sc-h1-big"
            data-reveal
            style={{
              fontSize: 62,
              lineHeight: 1.03,
              fontWeight: 800,
              letterSpacing: "-.035em",
              margin: "8px 0 20px",
            }}
          >
            Review that
            <br />
            rides <span style={{ color: "var(--in)" }}>side by side.</span>
          </h1>
          <p
            data-reveal
            data-reveal-delay="120"
            style={{
              fontSize: 18.5,
              lineHeight: 1.55,
              color: "var(--tx2)",
              margin: "0 0 34px",
              maxWidth: 466,
              fontWeight: 400,
            }}
          >
            Connect a repo. Sidecode maps it live and re-scans every push,
            finding problems, drafting fixes, opening the PR.
          </p>
          <div
            data-reveal
            data-reveal-delay="180"
            style={{
              display: "flex",
              gap: 14,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <HeroCTA />
            <a
              href="#how"
              className="bt-ghost-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                background: "transparent",
                border: "1px solid var(--line)",
                color: "var(--tx)",
                textDecoration: "none",
                fontSize: 16,
                fontWeight: 600,
                padding: "15px 24px",
                borderRadius: 11,
                transition: "background .2s,border-color .2s",
              }}
            >
              See how it works
            </a>
          </div>
        </div>

        {/* INTERACTIVE SCANNER CARD */}
        <ScannerCard />
      </header>

      {/* STATS BAND */}
      <section
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1200,
          margin: "30px auto 0",
          padding: "0 32px",
        }}
      >
        <div
          data-reveal
          className="sc-stats-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 1,
            background: "var(--line)",
            border: "1px solid var(--line)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <Stat to="2" label="specialist agents per review" />
          <Stat to="1" label="reconciled verdict, no noise" color="var(--in)" />
          <Stat to="28" prefix="<" suffix="s" label="from push to verdict" />
          <Stat to="100" suffix="%" label="of changed files re-scanned" />
        </div>
      </section>

      {/* LIVE COMPANION (centerpiece) */}
      <section
        id="live"
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1180,
          margin: "0 auto",
          padding: "120px 32px 40px",
        }}
      >
        <div
          data-reveal
          style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 52px" }}
        >
          <Eyebrow>LIVE COMPANION</Eyebrow>
          <h2 className="sc-h2-big" style={h2Big}>
            Your repo, alive on a graph.
          </h2>
          <p style={leadP}>
            Connect a repo and Sidecode maps it node by node. Push a change and
            it re-scans only what moved — the touched file lights up, a finding
            lands, a fix is drafted, and the node goes green when it’s safe to
            merge.
          </p>
        </div>

        <LiveCompanionGraph />
      </section>

      {/* HOW IT WORKS */}
      <section
        id="how"
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1200,
          margin: "0 auto",
          padding: "120px 32px 40px",
        }}
      >
        <div
          data-reveal
          style={{ textAlign: "center", maxWidth: 680, margin: "0 auto 64px" }}
        >
          <Eyebrow>THE REVIEW LOOP</Eyebrow>
          <h2 className="sc-h2-big" style={h2Big}>
            Two lenses. One verdict.
          </h2>
          <p style={leadP}>
            Every changed file is inspected in parallel by two specialists. A
            coordinating agent reconciles their findings — deduping overlaps and
            resolving severity disagreements — into a single prioritized call.
          </p>
        </div>

        <div
          data-reveal
          className="sc-how-grid"
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "0.85fr 1.4fr 0.85fr",
            gap: 24,
            alignItems: "center",
          }}
        >
          <FlowConnector left="25%" />
          <FlowConnector left="71%" dotDelay=".4s" />

          {/* input */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: 14, zIndex: 2 }}
          >
            <InputCard title="Changed file" sub="on every push" />
            <InputCard title="Diff & context" sub="graph neighbors" />
            <InputCard title="Pull request" sub="full review pass" />
          </div>

          {/* agents */}
          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 14,
              padding: 24,
              border: "1px solid var(--line)",
              borderRadius: 18,
              background: "var(--surf)",
              zIndex: 2,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 14,
                left: "50%",
                transform: "translateX(-50%)",
                fontFamily: mono,
                fontSize: 10.5,
                letterSpacing: ".16em",
                color: "var(--in)",
              }}
            >
              PARALLEL ANALYSIS
            </div>
            <AgentRow
              rgb="242,109,120"
              color="var(--sec)"
              title="Security agent"
              sub="vulnerabilities, secrets, exposure, unsafe data flow"
              marginTop={22}
              icon={<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />}
            />
            <AgentRow
              rgb="232,163,61"
              color="var(--bug)"
              title="Bug agent"
              sub="logic errors, edge cases, broken behavior"
              shimmerDelay=".5s"
              ringDelay=".8s"
              icon={
                <>
                  <path d="m8 2 1.88 1.88" />
                  <path d="M14.12 3.88 16 2" />
                  <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
                  <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
                  <path d="M12 20v-9" />
                  <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
                  <path d="M6 13H2" />
                  <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
                  <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
                  <path d="M22 13h-4" />
                  <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
                </>
              }
            />
          </div>

          {/* coordinator + verdict */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: 16, zIndex: 2 }}
          >
            <div
              style={{
                padding: 20,
                border: "1px solid var(--in)",
                borderRadius: 16,
                background: "rgba(92,138,240,.06)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: 44,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 13,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    inset: -6,
                    borderRadius: "50%",
                    border: "1px dashed rgba(92,138,240,.45)",
                    animation: "bt-orbit 9s linear infinite",
                  }}
                />
                <Image
                  src="/Sidecode-logo.png"
                  alt=""
                  width={30}
                  height={30}
                  style={{
                    width: 30,
                    height: 30,
                    objectFit: "contain",
                    animation: "bt-bob 3.4s ease-in-out infinite",
                  }}
                />
              </div>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 5 }}>
                Coordinator
              </div>
              <div
                style={{ fontSize: 13.5, color: "var(--tx2)", lineHeight: 1.5 }}
              >
                Reconciles the two reports — merges duplicates, settles severity
                conflicts, ranks by impact.
              </div>
            </div>
            <div
              style={{
                padding: "18px 20px",
                border: "1px solid var(--line)",
                borderRadius: 16,
                background: "var(--elev)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  background: "var(--safe)",
                  boxShadow: "0 0 12px var(--safe)",
                  flex: "none",
                  animation: "bt-glow 2.2s infinite",
                }}
              />
              <div>
                <div
                  style={{ fontWeight: 800, fontSize: 15, letterSpacing: ".02em" }}
                >
                  SAFE TO MERGE / BLOCKED
                </div>
                <div style={{ fontSize: 12.5, color: "var(--tx3)" }}>
                  one decisive gate
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section
        id="features"
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1200,
          margin: "0 auto",
          padding: "110px 32px 40px",
        }}
      >
        <div data-reveal style={{ marginBottom: 56 }}>
          <Eyebrow>WHAT YOU GET BACK</Eyebrow>
          <h2
            className="sc-h2-big"
            style={{ ...h2Big, margin: 0, maxWidth: 620, textAlign: "left" }}
          >
            A report you can act on, not a wall of warnings.
          </h2>
        </div>
        <div
          className="sc-feat-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 18,
          }}
        >
          {/* consensus (span 2) */}
          <div
            data-reveal
            className="feat sc-feat-wide"
            style={{
              gridColumn: "span 2",
              padding: 26,
              border: "1px solid var(--line)",
              borderRadius: 16,
              background: "var(--surf)",
              transition: "transform .3s,border-color .3s,box-shadow .3s",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div style={{ ...featEyebrow, marginBottom: 18 }}>
              CONSENSUS &amp; DISAGREEMENT
            </div>
            <h3
              style={{
                fontSize: 22,
                fontWeight: 700,
                margin: "0 0 10px",
                letterSpacing: "-.02em",
              }}
            >
              See where the agents agree — and where they don’t.
            </h3>
            <p
              style={{
                color: "var(--tx2)",
                fontSize: 15,
                lineHeight: 1.55,
                margin: "0 0 20px",
                maxWidth: 460,
              }}
            >
              When both agents flag the same line, you know it’s real. When they
              disagree on severity, the coordinator shows its reasoning instead
              of hiding it.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Pill
                bg="rgba(242,109,120,.1)"
                border="rgba(242,109,120,.25)"
                color="#f58b94"
                icon={<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />}
              >
                security
              </Pill>
              <Pill
                bg="rgba(232,163,61,.1)"
                border="rgba(232,163,61,.25)"
                color="var(--bug)"
                icon={
                  <>
                    <path d="M12 20v-9" />
                    <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
                    <path d="m8 2 1.88 1.88" />
                    <path d="M14.12 3.88 16 2" />
                  </>
                }
              >
                bug
              </Pill>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontFamily: mono,
                  fontSize: 12.5,
                  padding: "7px 12px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid var(--line)",
                  color: "var(--tx3)",
                }}
              >
                both flagged
              </span>
            </div>
          </div>

          {/* confidence */}
          <div data-reveal className="feat" style={featCard}>
            <div style={featEyebrow}>CONFIDENCE</div>
            <h3 style={featH3}>A score on every finding.</h3>
            <p style={featP}>
              Each issue carries a calibrated confidence so you can triage
              signal from noise instantly.
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span
                style={{
                  fontFamily: mono,
                  fontSize: 38,
                  fontWeight: 700,
                  color: "var(--in)",
                }}
              >
                0.97
              </span>
              <span style={{ color: "var(--tx3)", fontSize: 13 }}>
                confidence
              </span>
            </div>
          </div>

          {/* severity order */}
          <div data-reveal className="feat" style={featCard}>
            <div style={featEyebrow}>SEVERITY ORDER</div>
            <h3 style={featH3}>Prioritized, not alphabetized.</h3>
            <p style={{ ...featP, marginBottom: 16 }}>
              Critical blockers float to the top; nits sink. Fix what matters
              first.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <SevBar label="CRIT" color="var(--sec)" width="100%" />
              <SevBar label="HIGH" color="var(--bug)" width="62%" />
              <SevBar label="LOW" color="var(--warn)" width="30%" />
            </div>
          </div>

          {/* on the graph */}
          <div data-reveal className="feat" style={featCard}>
            <div style={featEyebrow}>ON THE GRAPH</div>
            <h3 style={featH3}>Findings land on the node.</h3>
            <p style={{ ...featP, marginBottom: 0 }}>
              Issues surface right on the file in the graph and post as inline
              PR comments — no context-switching.
            </p>
          </div>

          {/* the gate */}
          <div data-reveal className="feat" style={featCard}>
            <div style={featEyebrow}>THE GATE</div>
            <h3 style={featH3}>Safe to merge, or blocked. No maybes.</h3>
            <p style={featP}>
              Sidecode sits in your CI/CD as a gate. Green means ship. Red means
              here’s exactly what to fix first.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <GateRow
                bg="rgba(78,201,168,.1)"
                border="rgba(78,201,168,.35)"
                dot="var(--safe)"
                color="var(--safe)"
              >
                SAFE TO MERGE
              </GateRow>
              <GateRow
                bg="rgba(242,109,120,.1)"
                border="rgba(242,109,120,.3)"
                dot="var(--sec)"
                color="#f58b94"
              >
                BLOCKED · 1 CRITICAL
              </GateRow>
            </div>
          </div>
        </div>
      </section>

      {/* WHY GEMINI + VERTEX + ADK */}
      <section
        id="why"
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1200,
          margin: "0 auto",
          padding: "110px 32px 40px",
        }}
      >
        <div
          className="sc-why-pad"
          data-reveal
          style={{
            border: "1px solid var(--line)",
            borderRadius: 22,
            background: "var(--surf)",
            padding: 54,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <Image
            src="/Sidecode-logo.png"
            alt=""
            width={190}
            height={190}
            style={{
              position: "absolute",
              top: -24,
              right: -20,
              width: 190,
              height: 190,
              objectFit: "contain",
              opacity: 0.05,
              transform: "rotate(6deg)",
              pointerEvents: "none",
            }}
          />
          <div style={{ maxWidth: 660, position: "relative" }}>
            <Eyebrow>BUILT ON GOOGLE’S AI STACK</Eyebrow>
            <h2
              className="sc-h2-big"
              style={{
                ...h2Big,
                fontSize: 40,
                margin: "0 0 18px",
                lineHeight: 1.08,
                textAlign: "left",
              }}
            >
              Why Gemini + Vertex + ADK.
            </h2>
            <p
              style={{
                fontSize: 17,
                color: "var(--tx2)",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              A single model guesses. A coordinated panel deliberates. Sidecode
              runs its reasoning on Gemini, serves and tunes it on Vertex AI, and
              orchestrates the panel with Google’s ADK — parallel agents, a
              coordinator, and live progress on every push.
            </p>
          </div>
          <div
            className="sc-stack-grid"
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 18,
              marginTop: 40,
            }}
          >
            <div className="stackcard" style={stackCard}>
              <div style={stackIconWrap}>
                <span style={stackIconBg} />
                <span
                  style={{
                    position: "relative",
                    width: 20,
                    height: 20,
                    background: "var(--in)",
                    borderRadius: 5,
                    transform: "rotate(45deg)",
                    animation: "bt-bob 3s ease-in-out infinite",
                  }}
                />
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 7 }}>
                Gemini — the engine
              </div>
              <div style={stackBody}>
                Long-context reasoning that understands the whole change, not
                just the line.
              </div>
            </div>
            <div className="stackcard" style={stackCard}>
              <div style={stackIconWrap}>
                <span style={stackIconBg} />
                <span
                  style={{
                    position: "relative",
                    width: 0,
                    height: 0,
                    borderLeft: "12px solid transparent",
                    borderRight: "12px solid transparent",
                    borderBottom: "21px solid var(--in)",
                    animation: "bt-bob 3.4s ease-in-out infinite .3s",
                  }}
                />
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 7 }}>
                Vertex AI — served &amp; tuned
              </div>
              <div style={stackBody}>
                Hosts and tunes the models at every-PR scale with the governance
                teams require.
              </div>
            </div>
            <div className="stackcard" style={stackCard}>
              <div style={stackIconWrap}>
                <span style={stackIconBg} />
                <span
                  style={{
                    position: "absolute",
                    inset: -5,
                    borderRadius: "50%",
                    border: "1px dashed rgba(92,138,240,.4)",
                    animation: "bt-orbit 8s linear infinite",
                  }}
                />
                <span
                  style={{
                    position: "relative",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 4,
                  }}
                >
                  <span style={dotFull} />
                  <span style={dotDim} />
                  <span style={dotDim} />
                  <span style={dotFull} />
                </span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 7 }}>
                ADK — orchestration
              </div>
              <div style={stackBody}>
                Runs the two specialists and the coordinator as one reliable
                workflow with live progress.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1200,
          margin: "80px auto 0",
          padding: "40px 32px 56px",
          borderTop: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Image
            src="/Sidecode-logo.png"
            alt="Sidecode"
            width={34}
            height={34}
            style={{ width: 34, height: 34, objectFit: "contain" }}
          />
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 18,
                letterSpacing: "-.025em",
                lineHeight: 1.1,
              }}
            >
              Sidecode
            </div>
            <div
              style={{
                fontFamily: mono,
                fontSize: 11.5,
                color: "var(--tx3)",
                marginTop: 2,
              }}
            >
              a live code companion
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 26,
            flexWrap: "wrap",
          }}
        >
          <FooterLink href="#live">Live companion</FooterLink>
          <FooterLink href="#how">How it works</FooterLink>
          <FooterLink href="#features">Features</FooterLink>
          <span
            style={{ fontFamily: mono, fontSize: 11.5, color: "var(--tx3)" }}
          >
            review that rides along as you ship
          </span>
        </div>
      </footer>

      <PageInteractions />
    </div>
  );
}

/* ── small presentational helpers (server components) ──────────────── */

const h2Big: React.CSSProperties = {
  fontSize: 44,
  fontWeight: 800,
  letterSpacing: "-.03em",
  margin: "0 0 16px",
  lineHeight: 1.05,
};
const leadP: React.CSSProperties = {
  fontSize: 18,
  color: "var(--tx2)",
  lineHeight: 1.55,
  margin: 0,
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: mono,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: ".18em",
        color: "var(--in)",
        marginBottom: 16,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "var(--in)",
          boxShadow: "0 0 8px var(--in)",
          animation: "bt-glow 2s infinite",
        }}
      />
      {children}
    </div>
  );
}

function Stat({
  to,
  label,
  prefix = "",
  suffix = "",
  color,
}: {
  to: string;
  label: string;
  prefix?: string;
  suffix?: string;
  color?: string;
}) {
  return (
    <div style={{ background: "var(--bg)", padding: "30px 26px" }}>
      <div
        className="counter"
        data-to={to}
        data-prefix={prefix}
        data-suffix={suffix}
        style={{
          fontSize: 42,
          fontWeight: 800,
          letterSpacing: "-.03em",
          ...(color ? { color } : {}),
        }}
      >
        0
      </div>
      <div
        style={{
          color: "var(--tx2)",
          fontSize: 14,
          marginTop: 4,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function FlowConnector({ left, dotDelay }: { left: string; dotDelay?: string }) {
  return (
    <div
      className="sc-flow-conn"
      style={{
        position: "absolute",
        top: "50%",
        left,
        width: "6%",
        height: 18,
        transform: "translateY(-50%)",
        zIndex: 3,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: 2,
          transform: "translateY(-50%)",
          background:
            "repeating-linear-gradient(90deg,rgba(92,138,240,.55) 0 6px,transparent 6px 12px)",
          backgroundSize: "18px 2px",
          animation: "bt-dash .55s linear infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "var(--in2)",
          boxShadow: "0 0 11px var(--in)",
          transform: "translateY(-50%)",
          animation:
            "bt-flow 1.7s linear infinite" + (dotDelay ? " " + dotDelay : ""),
        }}
      />
    </div>
  );
}

function InputCard({ title, sub }: { title: string; sub: string }) {
  return (
    <div
      className="flow-input"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "16px 18px",
        border: "1px solid var(--line)",
        borderRadius: 13,
        background: "var(--surf)",
        transition: "transform .25s,border-color .25s",
      }}
    >
      <span
        style={{ width: 9, height: 9, borderRadius: 2, background: "var(--tx2)" }}
      />
      <div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--tx3)", fontFamily: mono }}>
          {sub}
        </div>
      </div>
    </div>
  );
}

function AgentRow({
  color,
  rgb,
  title,
  sub,
  icon,
  marginTop = 0,
  shimmerDelay = "0s",
  ringDelay = "0s",
}: {
  color: string;
  rgb: string;
  title: string;
  sub: string;
  icon: React.ReactNode;
  marginTop?: number;
  shimmerDelay?: string;
  ringDelay?: string;
}) {
  return (
    <div
      className="agent-card"
      style={{
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        gap: 13,
        padding: "15px 17px",
        marginTop,
        border: `1px solid rgba(${rgb},.3)`,
        borderRadius: 13,
        background: `rgba(${rgb},.06)`,
        transition: "transform .25s",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(105deg,transparent 35%,rgba(${rgb},.14) 50%,transparent 65%)`,
          transform: "translateX(-120%)",
          animation: `bt-shimmer 4.2s ease-in-out infinite ${shimmerDelay}`,
          pointerEvents: "none",
        }}
      />
      <span
        style={{
          position: "relative",
          width: 34,
          height: 34,
          borderRadius: 9,
          background: `rgba(${rgb},.14)`,
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "none",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 9,
            border: `1px solid rgba(${rgb},.5)`,
            animation: `bt-ring 2.4s ease-out infinite ${ringDelay}`,
          }}
        />
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: "relative" }}
        >
          {icon}
        </svg>
      </span>
      <div style={{ flex: 1, position: "relative" }}>
        <div style={{ fontWeight: 700, fontSize: 15.5 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--tx2)" }}>{sub}</div>
      </div>
    </div>
  );
}

function Pill({
  bg,
  border,
  color,
  icon,
  children,
}: {
  bg: string;
  border: string;
  color: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontFamily: mono,
        fontSize: 12.5,
        padding: "7px 12px",
        borderRadius: 8,
        background: bg,
        border: `1px solid ${border}`,
        color,
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon}
      </svg>
      {children}
    </span>
  );
}

function SevBar({
  label,
  color,
  width,
}: {
  label: string;
  color: string;
  width: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span style={{ width: 54, fontFamily: mono, fontSize: 11, color }}>
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: color,
          maxWidth: width,
        }}
      />
    </div>
  );
}

function GateRow({
  bg,
  border,
  dot,
  color,
  children,
}: {
  bg: string;
  border: string;
  dot: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 16px",
        borderRadius: 11,
        background: bg,
        border: `1px solid ${border}`,
      }}
    >
      <span
        style={{ width: 9, height: 9, borderRadius: "50%", background: dot }}
      />
      <span
        style={{ fontWeight: 700, fontFamily: mono, fontSize: 13, color }}
      >
        {children}
      </span>
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      style={{
        textDecoration: "none",
        color: "var(--tx2)",
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      {children}
    </a>
  );
}

/* shared style objects */
const featCard: React.CSSProperties = {
  padding: 26,
  border: "1px solid var(--line)",
  borderRadius: 16,
  background: "var(--surf)",
  transition: "transform .3s,border-color .3s,box-shadow .3s",
};
const featEyebrow: React.CSSProperties = {
  fontSize: 13,
  fontFamily: mono,
  color: "var(--in)",
  marginBottom: 18,
};
const featH3: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  margin: "0 0 10px",
  letterSpacing: "-.02em",
};
const featP: React.CSSProperties = {
  color: "var(--tx2)",
  fontSize: 14.5,
  lineHeight: 1.55,
  margin: "0 0 18px",
};
const stackCard: React.CSSProperties = {
  padding: "26px 24px",
  border: "1px solid var(--line)",
  borderRadius: 15,
  background: "var(--elev)",
  transition: "transform .3s,border-color .3s,box-shadow .3s",
};
const stackIconWrap: React.CSSProperties = {
  position: "relative",
  width: 46,
  height: 46,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 16,
};
const stackIconBg: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: 12,
  background: "rgba(92,138,240,.1)",
  border: "1px solid rgba(92,138,240,.25)",
};
const stackBody: React.CSSProperties = {
  color: "var(--tx2)",
  fontSize: 14,
  lineHeight: 1.5,
};
const dotFull: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "var(--in)",
};
const dotDim: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "var(--in)",
  opacity: 0.55,
};
