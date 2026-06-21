import Image from "next/image";
import CanvasBackground from "@/components/CanvasBackground";
import ScannerCard from "@/components/ScannerCard";
import PageInteractions from "@/components/PageInteractions";
import LandingNav from "@/components/landing/LandingNav";
import HeroCTA from "@/components/landing/HeroCTA";

const mono = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

export default function Home() {
  return (
    <div className="bt-root">
      <CanvasBackground />
      <LandingNav />
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(900px 600px at 78% 8%,rgba(131,200,24,.10),transparent 60%),radial-gradient(700px 500px at 10% 90%,rgba(84,184,255,.06),transparent 60%)",
        }}
      />

      {/* HERO */}
      <header
        className="bt-hero"
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1280,
          margin: "0 auto",
          padding: "78px 32px 64px",
          display: "grid",
          gridTemplateColumns: "1.02fr 1.08fr",
          gap: 54,
          alignItems: "center",
        }}
      >
        <div>
          <h1
            data-reveal
            data-reveal-delay="60"
            style={{
              fontSize: 64,
              lineHeight: 1.02,
              fontWeight: 800,
              letterSpacing: "-.035em",
              margin: "0 0 20px",
            }}
          >
            Ship fast.
            <br />
            Merge with
            <br />
            <span style={{ position: "relative", whiteSpace: "nowrap" }}>
              <span
                style={{
                  background:
                    "linear-gradient(100deg,var(--lime),var(--lime-bright),var(--lime))",
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  animation: "bt-grad 5s linear infinite",
                }}
              >
                confidence.
              </span>
            </span>
          </h1>
          <p
            data-reveal
            data-reveal-delay="120"
            style={{
              fontSize: 19,
              lineHeight: 1.55,
              color: "var(--tx2)",
              margin: "0 0 34px",
              maxWidth: 460,
              fontWeight: 400,
            }}
          >
            AI ships code faster than humans can review it. BugTrap reviews every
            change and hands you one clear verdict before it merges.
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
              href="#"
              className="bt-ghost-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                background: "rgba(255,255,255,.04)",
                border: "1px solid var(--line2)",
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
        className="bt-sec"
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
          className="bt-stats"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 1,
            background: "var(--line)",
            border: "1px solid var(--line)",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <Stat to="3" label="specialist agents per review" />
          <Stat
            to="1"
            label="reconciled verdict, no noise"
            color="var(--lime)"
          />
          <Stat
            to="28"
            prefix="<"
            suffix="s"
            label="typical scan, file to verdict"
          />
          <Stat to="100" suffix="%" label="of diffs reviewed, every push" />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section
        id="how"
        className="bt-sec"
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
          <h2
            style={{
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: "-.03em",
              margin: "0 0 16px",
              lineHeight: 1.05,
            }}
          >
            Three lenses. One verdict.
          </h2>
          <p
            style={{
              fontSize: 18,
              color: "var(--tx2)",
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            Every change is inspected in parallel from three distinct angles. A
            coordinating agent reconciles the findings — deduping overlaps and
            resolving severity disagreements — into a single prioritized call.
          </p>
        </div>

        <div
          data-reveal
          className="bt-how-grid"
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "0.85fr 1.4fr 0.85fr",
            gap: 24,
            alignItems: "center",
          }}
        >
          {/* animated flow connectors */}
          <FlowConnector left="25%" />
          <FlowConnector left="71%" dotDelay=".4s" />

          {/* input */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              zIndex: 2,
            }}
          >
            <InputCard title="File" sub="single source file" />
            <InputCard title="Function" sub="a focused unit" />
            <InputCard title="Pull request" sub="full diff & context" />
          </div>

          {/* agents */}
          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 14,
              padding: 24,
              border: "1px solid var(--line2)",
              borderRadius: 18,
              background:
                "linear-gradient(180deg,rgba(131,200,24,.04),transparent)",
              boxShadow: "0 0 40px -18px rgba(131,200,24,.35)",
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
                color: "var(--lime)",
              }}
            >
              PARALLEL ANALYSIS
            </div>
            <AgentRow
              color="var(--sec)"
              rgb="255,93,108"
              title="Security agent"
              sub="injection, secrets, authz, unsafe data flow"
              marginTop={22}
              icon={<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />}
            />
            <AgentRow
              color="var(--cor)"
              rgb="131,200,24"
              title="Correctness agent"
              sub="logic, edge cases, async, error handling"
              shimmerDelay=".5s"
              ringDelay=".8s"
              icon={
                <>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </>
              }
            />
            <AgentRow
              color="var(--read)"
              rgb="84,184,255"
              title="Readability agent"
              sub="clarity, naming, structure, maintainability"
              shimmerDelay="1s"
              ringDelay="1.6s"
              icon={
                <>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </>
              }
            />
          </div>

          {/* coordinator + verdict */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              zIndex: 2,
            }}
          >
            <div
              style={{
                padding: 20,
                border: "1px solid var(--lime)",
                borderRadius: 16,
                background: "rgba(131,200,24,.06)",
                position: "relative",
                overflow: "hidden",
                boxShadow: "0 0 36px -14px rgba(131,200,24,.5)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -34,
                  right: -34,
                  width: 110,
                  height: 110,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle,rgba(131,200,24,.28),transparent 70%)",
                  animation: "bt-glow 3s infinite",
                }}
              />
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
                    border: "1px dashed rgba(131,200,24,.45)",
                    animation: "bt-orbit 9s linear infinite",
                  }}
                />
                <Image
                  src="/BugTrap-logo.png"
                  alt=""
                  width={30}
                  height={30}
                  style={{
                    width: 30,
                    height: 30,
                    objectFit: "contain",
                    animation: "bt-bob 3.4s ease-in-out infinite",
                    filter: "drop-shadow(0 0 8px rgba(131,200,24,.6))",
                  }}
                />
              </div>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 5 }}>
                Coordinator
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: "var(--tx2)",
                  lineHeight: 1.5,
                }}
              >
                Reconciles the three reports — merges duplicates, settles
                severity conflicts, ranks by impact.
              </div>
            </div>
            <div
              style={{
                padding: "18px 20px",
                border: "1px solid var(--line2)",
                borderRadius: 16,
                background: "var(--surf2)",
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
                  background: "var(--lime)",
                  boxShadow: "0 0 12px var(--lime)",
                  flex: "none",
                  animation: "bt-glow 2.2s infinite",
                }}
              />
              <div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 15,
                    letterSpacing: ".02em",
                  }}
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
        className="bt-sec"
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
            style={{
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: "-.03em",
              margin: 0,
              lineHeight: 1.05,
              maxWidth: 620,
            }}
          >
            A report you can act on, not a wall of warnings.
          </h2>
        </div>
        <div
          className="bt-feat-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 18,
          }}
        >
          {/* consensus (span 2) */}
          <div
            data-reveal
            className="feat"
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
            <div
              style={{
                fontSize: 13,
                fontFamily: mono,
                color: "var(--lime)",
                marginBottom: 18,
              }}
            >
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
              When 2 of 3 agents flag the same line, you know it’s real. When
              they disagree on severity, the coordinator shows its reasoning
              instead of hiding it.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Pill
                bg="rgba(255,93,108,.1)"
                border="rgba(255,93,108,.25)"
                color="#ff8a95"
                icon={<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />}
              >
                security
              </Pill>
              <Pill
                bg="rgba(131,200,24,.1)"
                border="rgba(131,200,24,.25)"
                color="var(--lime)"
                icon={
                  <>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </>
                }
              >
                correctness
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
                  background: "rgba(255,255,255,.05)",
                  border: "1px solid var(--line2)",
                  color: "var(--tx3)",
                }}
              >
                2 of 3 flagged
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
                  color: "var(--lime)",
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
              <SevBar label="HIGH" color="#f0b454" width="62%" />
              <SevBar label="LOW" color="var(--read)" width="30%" />
            </div>
          </div>

          {/* inline PR comments */}
          <div data-reveal className="feat" style={featCard}>
            <div style={featEyebrow}>INLINE PR COMMENTS</div>
            <h3 style={featH3}>Comments land on the line.</h3>
            <p style={{ ...featP, marginBottom: 0 }}>
              Findings post as inline review comments, right where the code
              lives — no context-switching.
            </p>
          </div>

          {/* the gate */}
          <div
            data-reveal
            className="feat"
            style={{
              padding: 26,
              border: "1px solid var(--line)",
              borderRadius: 16,
              background:
                "linear-gradient(160deg,rgba(131,200,24,.08),var(--surf) 60%)",
              transition: "transform .3s,border-color .3s,box-shadow .3s",
            }}
          >
            <div style={featEyebrow}>THE GATE</div>
            <h3 style={featH3}>Safe to merge, or blocked. No maybes.</h3>
            <p style={featP}>
              BugTrap sits in your CI/CD as a gate. Green means ship. Red means
              here’s exactly what to fix first.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 16px",
                  borderRadius: 11,
                  background: "rgba(131,200,24,.12)",
                  border: "1px solid rgba(131,200,24,.35)",
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: "var(--lime)",
                  }}
                />
                <span
                  style={{
                    fontWeight: 700,
                    fontFamily: mono,
                    fontSize: 13,
                    color: "var(--lime)",
                  }}
                >
                  SAFE TO MERGE
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 16px",
                  borderRadius: 11,
                  background: "rgba(255,93,108,.1)",
                  border: "1px solid rgba(255,93,108,.3)",
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: "var(--sec)",
                  }}
                />
                <span
                  style={{
                    fontWeight: 700,
                    fontFamily: mono,
                    fontSize: 13,
                    color: "#ff8a95",
                  }}
                >
                  BLOCKED · 1 CRITICAL
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY GEMINI */}
      <section
        className="bt-sec"
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1200,
          margin: "0 auto",
          padding: "110px 32px 40px",
        }}
      >
        <div
          data-reveal
          className="bt-why-panel"
          style={{
            border: "1px solid var(--line)",
            borderRadius: 22,
            background:
              "radial-gradient(700px 400px at 80% 0%,rgba(131,200,24,.1),transparent 60%),var(--surf)",
            padding: 54,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <Image
            src="/BugTrap-logo.png"
            alt=""
            width={200}
            height={200}
            style={{
              position: "absolute",
              top: -30,
              right: -26,
              width: 200,
              height: 200,
              objectFit: "contain",
              opacity: 0.06,
              transform: "rotate(8deg)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -60,
              left: -40,
              width: 220,
              height: 220,
              borderRadius: "50%",
              background:
                "radial-gradient(circle,rgba(131,200,24,.1),transparent 70%)",
              animation: "bt-glow 4s infinite",
              pointerEvents: "none",
            }}
          />
          <div style={{ maxWidth: 640, position: "relative" }}>
            <Eyebrow noMargin>BUILT ON GOOGLE’S AI STACK</Eyebrow>
            <h2
              style={{
                fontSize: 40,
                fontWeight: 800,
                letterSpacing: "-.03em",
                margin: "0 0 18px",
                lineHeight: 1.08,
              }}
            >
              Production-grade reasoning, orchestrated to agree.
            </h2>
            <p
              style={{
                fontSize: 17,
                color: "var(--tx2)",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              A single model guesses. A coordinated panel deliberates. BugTrap
              leans on the Gemini API for deep code reasoning, the Agent
              Development Kit to orchestrate the panel, and Vertex AI for
              enterprise-grade scale and governance.
            </p>
          </div>
          <div
            className="bt-stack-grid"
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
                    width: 22,
                    height: 22,
                    background:
                      "linear-gradient(135deg,var(--lime-bright),var(--lime))",
                    borderRadius: 6,
                    transform: "rotate(45deg)",
                    boxShadow: "0 0 14px rgba(131,200,24,.6)",
                    animation: "bt-bob 3s ease-in-out infinite",
                  }}
                />
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 7 }}>
                Gemini API
              </div>
              <div style={stackBody}>
                Long-context code reasoning that understands the whole change,
                not just the line.
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
                    border: "1px dashed rgba(131,200,24,.4)",
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
                Google ADK
              </div>
              <div style={stackBody}>
                Orchestrates the three specialists and the coordinator as one
                reliable workflow.
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
                    borderLeft: "13px solid transparent",
                    borderRight: "13px solid transparent",
                    borderBottom: "23px solid var(--lime)",
                    filter: "drop-shadow(0 0 8px rgba(131,200,24,.55))",
                    animation: "bt-bob 3.4s ease-in-out infinite .4s",
                  }}
                />
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 7 }}>
                Vertex AI
              </div>
              <div style={stackBody}>
                Scales to every PR with the security, governance, and
                reliability teams require.
              </div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ height: 60 }} />

      <PageInteractions />
    </div>
  );
}

/* ── small presentational helpers (server components) ──────────────── */

function Eyebrow({
  children,
  noMargin,
}: {
  children: React.ReactNode;
  noMargin?: boolean;
}) {
  return (
    <div
      style={{
        fontFamily: mono,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: ".18em",
        color: "var(--lime)",
        marginBottom: noMargin ? 18 : 16,
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
          background: "var(--lime)",
          boxShadow: "0 0 8px var(--lime)",
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

function FlowConnector({
  left,
  dotDelay,
}: {
  left: string;
  dotDelay?: string;
}) {
  return (
    <div
      className="bt-flow-conn"
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
            "repeating-linear-gradient(90deg,rgba(131,200,24,.55) 0 6px,transparent 6px 12px)",
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
          background: "var(--lime-bright)",
          boxShadow: "0 0 11px var(--lime)",
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
        style={{
          width: 9,
          height: 9,
          borderRadius: 2,
          background: "var(--tx2)",
        }}
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
        background: `rgba(${rgb},.05)`,
        transition: "transform .25s",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(105deg,transparent 35%,rgba(${rgb},.16) 50%,transparent 65%)`,
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
  color: "var(--lime)",
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
  border: "1px solid var(--line2)",
  borderRadius: 15,
  background: "rgba(255,255,255,.02)",
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
  background: "rgba(131,200,24,.1)",
  border: "1px solid rgba(131,200,24,.25)",
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
  background: "var(--lime)",
};
const dotDim: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "var(--lime)",
  opacity: 0.55,
};
