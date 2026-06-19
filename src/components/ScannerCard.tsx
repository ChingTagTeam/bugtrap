"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

const mono = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

type Finding = {
  c: string;
  tag: string;
  sev: string;
  sevc: string;
  conf: string;
  votes: string;
  ln: string;
  t: string;
  d: string;
};

const FINDINGS: Finding[] = [
  {
    c: "var(--sec)",
    tag: "SECURITY",
    sev: "CRITICAL",
    sevc: "var(--sec)",
    conf: "0.97",
    votes: "3 of 3",
    ln: "L5",
    t: "SQL injection via string concatenation",
    d: "User input flows into a raw query. Use a parameterized statement.",
  },
  {
    c: "var(--cor)",
    tag: "CORRECTNESS",
    sev: "HIGH",
    sevc: "#f0b454",
    conf: "0.91",
    votes: "2 of 3",
    ln: "L6",
    t: "Missing await on async db.query()",
    d: "rows resolves to a Promise; downstream null-check never sees data.",
  },
  {
    c: "var(--read)",
    tag: "READABILITY",
    sev: "LOW",
    sevc: "var(--read)",
    conf: "0.58",
    votes: "2 of 3",
    ln: "L8",
    t: "Loose equality and bare 404",
    d: "Use === and a structured error response for clarity.",
  },
];

const lnStyle: CSSProperties = {
  padding: "0 16px",
  color: "#cfcfd4",
};
const numStyle: CSSProperties = {
  display: "inline-block",
  width: 26,
  color: "#45454c",
};
const kw: CSSProperties = { color: "#c98fff" };
const str: CSSProperties = { color: "#9fe06a" };
const fn: CSSProperties = { color: "#7cc7ff" };
const num: CSSProperties = { color: "#f0b454" };
const bugLine: CSSProperties = {
  padding: "0 16px",
  color: "#cfcfd4",
  position: "relative",
  transition: "background .3s",
};

/**
 * The interactive hero scanner card. Sweeps a scan beam over a code block,
 * fills three agent meters, populates the findings rail, and resolves the
 * verdict gate to BLOCKED — then loops. Ported from the dc-script state
 * machine (runScanCycle/resetScan/setBlocked) into refs + effects.
 */
export default function ScannerCard() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  const statusDotRef = useRef<HTMLSpanElement | null>(null);
  const statusTxtRef = useRef<HTMLSpanElement | null>(null);

  const secBarRef = useRef<HTMLDivElement | null>(null);
  const corBarRef = useRef<HTMLDivElement | null>(null);
  const readBarRef = useRef<HTMLDivElement | null>(null);
  const secCountRef = useRef<HTMLSpanElement | null>(null);
  const corCountRef = useRef<HTMLSpanElement | null>(null);
  const readCountRef = useRef<HTMLSpanElement | null>(null);

  const beamRef = useRef<HTMLDivElement | null>(null);
  const line6Ref = useRef<HTMLDivElement | null>(null);
  const line7Ref = useRef<HTMLDivElement | null>(null);
  const line9Ref = useRef<HTMLDivElement | null>(null);

  const findingRefs = useRef<Array<HTMLDivElement | null>>([]);

  const verdictRef = useRef<HTMLDivElement | null>(null);
  const verdictIconRef = useRef<HTMLDivElement | null>(null);
  const verdictSpinRef = useRef<HTMLSpanElement | null>(null);
  const verdictBangRef = useRef<HTMLSpanElement | null>(null);
  const verdictTitleRef = useRef<HTMLDivElement | null>(null);
  const verdictSubRef = useRef<HTMLDivElement | null>(null);
  const verdictTagRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let loopTimer: ReturnType<typeof setTimeout> | undefined;
    let started = false;

    const lineEls = () => [line6Ref.current, line7Ref.current, line9Ref.current];
    const barEls = () => [secBarRef.current, corBarRef.current, readBarRef.current];

    const setStatusState = (txt: string, color: string) => {
      if (statusTxtRef.current) {
        statusTxtRef.current.textContent = txt;
        statusTxtRef.current.style.color = color;
      }
      if (statusDotRef.current) {
        statusDotRef.current.style.background = color;
        statusDotRef.current.style.boxShadow = "0 0 8px " + color;
      }
    };

    const revealFinding = (i: number) => {
      const el = findingRefs.current[i];
      if (el) {
        el.style.opacity = "1";
        el.style.transform = "none";
      }
    };

    const setBlocked = () => {
      if (verdictSpinRef.current) verdictSpinRef.current.style.display = "none";
      if (verdictBangRef.current) verdictBangRef.current.style.display = "block";
      if (verdictIconRef.current) {
        verdictIconRef.current.style.background = "rgba(255,93,108,.14)";
        verdictIconRef.current.style.borderColor = "rgba(255,93,108,.4)";
      }
      if (verdictTitleRef.current) {
        verdictTitleRef.current.textContent = "Blocked · 1 critical, 1 high";
        verdictTitleRef.current.style.color = "#ff8a95";
      }
      if (verdictSubRef.current)
        verdictSubRef.current.textContent = "fix L5 before this can merge";
      if (verdictRef.current)
        verdictRef.current.style.background = "rgba(255,93,108,.06)";
      if (verdictTagRef.current) {
        verdictTagRef.current.textContent = "BLOCKED";
        verdictTagRef.current.style.background = "rgba(255,93,108,.14)";
        verdictTagRef.current.style.color = "#ff8a95";
        verdictTagRef.current.style.borderColor = "rgba(255,93,108,.4)";
      }
      setStatusState("BLOCKED", "#ff5d6c");
    };

    const setFinal = () => {
      // resolved end-state for reduced motion
      barEls().forEach((b) => {
        if (b) b.style.width = "100%";
      });
      if (secCountRef.current) secCountRef.current.textContent = "1";
      if (corCountRef.current) corCountRef.current.textContent = "1";
      if (readCountRef.current) readCountRef.current.textContent = "2";
      const colors = [
        "rgba(255,93,108,.12)",
        "rgba(131,200,24,.12)",
        "rgba(84,184,255,.10)",
      ];
      const bord = ["var(--sec)", "var(--cor)", "var(--read)"];
      lineEls().forEach((el, i) => {
        if (!el) return;
        el.style.background = colors[i];
        el.style.boxShadow = "inset 3px 0 0 " + bord[i];
      });
      // reveal findings so the resolved content is visible without motion
      FINDINGS.forEach((_, i) => revealFinding(i));
      setBlocked();
    };

    const resetScan = () => {
      if (beamRef.current) {
        beamRef.current.style.transition = "none";
        beamRef.current.style.opacity = "0";
        beamRef.current.style.top = "0px";
      }
      barEls().forEach((b) => {
        if (b) b.style.width = "0%";
      });
      if (secCountRef.current) secCountRef.current.textContent = "0";
      if (corCountRef.current) corCountRef.current.textContent = "0";
      if (readCountRef.current) readCountRef.current.textContent = "0";
      lineEls().forEach((el) => {
        if (!el) return;
        el.style.background = "transparent";
        el.style.boxShadow = "none";
      });
      findingRefs.current.forEach((el) => {
        if (el) {
          el.style.opacity = "0";
          el.style.transform = "translateY(8px)";
        }
      });
      if (verdictSpinRef.current) verdictSpinRef.current.style.display = "block";
      if (verdictBangRef.current) verdictBangRef.current.style.display = "none";
      if (verdictIconRef.current) {
        verdictIconRef.current.style.background = "rgba(255,255,255,.05)";
        verdictIconRef.current.style.borderColor = "var(--line2)";
      }
      if (verdictTitleRef.current) {
        verdictTitleRef.current.textContent =
          "Coordinator reconciling 3 agents…";
        verdictTitleRef.current.style.color = "var(--tx2)";
      }
      if (verdictSubRef.current)
        verdictSubRef.current.textContent =
          "deduping overlaps · resolving severity";
      if (verdictRef.current) verdictRef.current.style.background = "#1c1c1f";
      if (verdictTagRef.current) {
        verdictTagRef.current.textContent = "SCANNING";
        verdictTagRef.current.style.background = "rgba(255,255,255,.05)";
        verdictTagRef.current.style.color = "var(--tx3)";
        verdictTagRef.current.style.borderColor = "var(--line2)";
      }
      setStatusState("SCANNING", "#83C818");
    };

    const runScanCycle = () => {
      resetScan();
      const beam = beamRef.current;
      if (!beam || !beam.parentElement) return;
      const codeH = beam.parentElement.offsetHeight;

      timers.push(
        setTimeout(() => {
          beam.style.opacity = "1";
          beam.style.transition = "top 3s cubic-bezier(.45,.05,.3,1)";
          beam.style.top = codeH - 30 + "px";
        }, 350),
      );

      const fill = (
        bar: HTMLDivElement | null,
        to: number,
        delay: number,
      ) =>
        timers.push(
          setTimeout(() => {
            if (bar) bar.style.width = to + "%";
          }, delay),
        );
      fill(secBarRef.current, 40, 700);
      fill(secBarRef.current, 100, 2600);
      fill(corBarRef.current, 30, 900);
      fill(corBarRef.current, 100, 2800);
      fill(readBarRef.current, 25, 1100);
      fill(readBarRef.current, 100, 3000);

      const hit = (
        el: HTMLDivElement | null,
        color: string,
        glow: string,
        delay: number,
      ) =>
        timers.push(
          setTimeout(() => {
            if (el) {
              el.style.background = glow;
              el.style.boxShadow = "inset 3px 0 0 " + color;
            }
          }, delay),
        );
      hit(line6Ref.current, "var(--sec)", "rgba(255,93,108,.12)", 1450);
      hit(line7Ref.current, "var(--cor)", "rgba(131,200,24,.12)", 1900);
      hit(line9Ref.current, "var(--read)", "rgba(84,184,255,.10)", 2600);

      timers.push(
        setTimeout(() => {
          if (secCountRef.current) secCountRef.current.textContent = "1";
        }, 1500),
      );
      timers.push(
        setTimeout(() => {
          if (corCountRef.current) corCountRef.current.textContent = "1";
        }, 1950),
      );
      timers.push(
        setTimeout(() => {
          if (readCountRef.current) readCountRef.current.textContent = "2";
        }, 2650),
      );

      timers.push(
        setTimeout(() => {
          if (beamRef.current) beamRef.current.style.opacity = "0";
        }, 3400),
      );
      timers.push(setTimeout(() => revealFinding(0), 3650));
      timers.push(setTimeout(() => revealFinding(1), 3850));
      timers.push(setTimeout(() => revealFinding(2), 4050));
      timers.push(setTimeout(() => setBlocked(), 4500));

      loopTimer = setTimeout(() => runScanCycle(), 9500);
    };

    if (reduced) {
      setStatusState("BLOCKED", "#ff5d6c");
      setFinal();
      return;
    }

    const wrap = wrapRef.current;
    const inner = innerRef.current;

    // mouse-tilt
    const onMove = (ev: MouseEvent) => {
      if (!wrap || !inner) return;
      const r = wrap.getBoundingClientRect();
      const px = (ev.clientX - r.left) / r.width - 0.5;
      const py = (ev.clientY - r.top) / r.height - 0.5;
      inner.style.transform =
        "rotateY(" + px * 7 + "deg) rotateX(" + -py * 7 + "deg)";
    };
    const onLeave = () => {
      if (inner) inner.style.transform = "rotateY(0deg) rotateX(0deg)";
    };
    if (wrap) {
      wrap.addEventListener("mousemove", onMove);
      wrap.addEventListener("mouseleave", onLeave);
    }

    // start the scan loop when the card scrolls into view
    let scanObs: IntersectionObserver | undefined;
    if (wrap) {
      scanObs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !started) {
              started = true;
              runScanCycle();
              scanObs?.disconnect();
            }
          });
        },
        { rootMargin: "0px 0px -30% 0px" },
      );
      scanObs.observe(wrap);
    }

    return () => {
      timers.forEach((t) => clearTimeout(t));
      if (loopTimer) clearTimeout(loopTimer);
      scanObs?.disconnect();
      if (wrap) {
        wrap.removeEventListener("mousemove", onMove);
        wrap.removeEventListener("mouseleave", onLeave);
      }
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      data-reveal
      data-reveal-delay="120"
      style={{ position: "relative", perspective: "1400px" }}
    >
      <div
        ref={innerRef}
        style={{
          position: "relative",
          borderRadius: 16,
          background: "linear-gradient(180deg,#202024,#1a1a1d)",
          border: "1px solid var(--line2)",
          boxShadow:
            "0 40px 90px -30px rgba(0,0,0,.7),0 0 0 1px rgba(131,200,24,.04)",
          transformStyle: "preserve-3d",
          transition: "transform .15s ease-out",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 16,
            pointerEvents: "none",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
          }}
        />

        {/* card header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "13px 16px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              fontFamily: mono,
              fontSize: 12.5,
              color: "var(--tx2)",
            }}
          >
            <span style={{ display: "flex", gap: 6 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  background: "#3a3a40",
                }}
              />
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  background: "#3a3a40",
                }}
              />
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  background: "#3a3a40",
                }}
              />
            </span>
            <span style={{ marginLeft: 6 }}>api/users.ts</span>
          </div>
          <div
            style={{
              fontFamily: mono,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: ".08em",
              color: "var(--tx3)",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <span
              ref={statusDotRef}
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--tx3)",
              }}
            />
            <span ref={statusTxtRef}>READY</span>
          </div>
        </div>

        {/* agent meters */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 1,
            background: "var(--line)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <Meter
            label="SECURITY"
            color="var(--sec)"
            countRef={secCountRef}
            barRef={secBarRef}
          />
          <Meter
            label="CORRECTNESS"
            color="var(--cor)"
            countRef={corCountRef}
            barRef={corBarRef}
          />
          <Meter
            label="READABILITY"
            color="var(--read)"
            countRef={readCountRef}
            barRef={readBarRef}
          />
        </div>

        {/* code with scan beam */}
        <div
          style={{
            position: "relative",
            padding: "14px 0",
            fontFamily: mono,
            fontSize: 13,
            lineHeight: 1.85,
            background: "#161618",
          }}
        >
          <div
            ref={beamRef}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 54,
              pointerEvents: "none",
              opacity: 0,
              background:
                "linear-gradient(180deg,transparent,rgba(131,200,24,.13) 70%,rgba(131,200,24,.34))",
              borderBottom: "1.5px solid var(--lime)",
              boxShadow: "0 0 30px rgba(131,200,24,.4)",
              zIndex: 3,
            }}
          />
          <div style={{ position: "relative", zIndex: 2 }}>
            <div style={{ ...lnStyle, color: "#6f6f76" }}>
              <span style={numStyle}>1</span>
              <span style={kw}>import</span> {"{ db } "}
              <span style={kw}>from</span> <span style={str}>&quot;./db&quot;</span>;
            </div>
            <div style={{ ...lnStyle, color: "#6f6f76" }}>
              <span style={numStyle}>2</span>
            </div>
            <div style={lnStyle}>
              <span style={numStyle}>3</span>
              <span style={kw}>export async function</span>{" "}
              <span style={fn}>getUser</span>(req, res) {"{"}
            </div>
            <div style={lnStyle}>
              <span style={numStyle}>4</span>
              {"  "}
              <span style={kw}>const</span> id = req.params.id;
            </div>
            <div ref={line6Ref} style={bugLine}>
              <span style={numStyle}>5</span>
              {"  "}
              <span style={kw}>const</span> query ={" "}
              <span style={str}>
                &quot;SELECT * FROM users WHERE id = &quot;
              </span>{" "}
              + id;
            </div>
            <div ref={line7Ref} style={bugLine}>
              <span style={numStyle}>6</span>
              {"  "}
              <span style={kw}>const</span> rows = db.
              <span style={fn}>query</span>(query);
            </div>
            <div style={{ ...lnStyle, color: "#6f6f76" }}>
              <span style={numStyle}>7</span>
            </div>
            <div ref={line9Ref} style={bugLine}>
              <span style={numStyle}>8</span>
              {"  "}
              <span style={kw}>if</span> (rows == <span style={kw}>null</span>){" "}
              <span style={kw}>return</span> res.<span style={fn}>send</span>(
              <span style={num}>404</span>);
            </div>
            <div style={lnStyle}>
              <span style={numStyle}>9</span>
              {"  "}
              <span style={kw}>const</span> user = rows[<span style={num}>0</span>];
            </div>
            <div style={lnStyle}>
              <span style={numStyle}>10</span>
              {"  "}res.<span style={fn}>json</span>({"{ "}id: user.id, name:
              user.name {"}"});
            </div>
            <div style={lnStyle}>
              <span style={numStyle}>11</span>
              {"}"}
            </div>
          </div>
        </div>

        {/* findings rail */}
        <div
          style={{
            borderTop: "1px solid var(--line)",
            background: "#1a1a1d",
            height: 188,
            overflowY: "auto",
          }}
        >
          {FINDINGS.map((r, i) => (
            <div
              key={r.tag}
              ref={(el) => {
                findingRefs.current[i] = el;
              }}
              style={{
                display: "flex",
                gap: 12,
                padding: "13px 16px",
                borderBottom: "1px solid var(--line)",
                opacity: 0,
                transform: "translateY(8px)",
                transition: "opacity .4s,transform .4s",
              }}
            >
              <span
                style={{
                  width: 3,
                  borderRadius: 2,
                  background: r.c,
                  flex: "none",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontFamily: mono,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: ".06em",
                      color: r.sevc,
                    }}
                  >
                    {r.sev}
                  </span>
                  <span
                    style={{ fontFamily: mono, fontSize: 10, color: "var(--tx3)" }}
                  >
                    {r.ln}
                  </span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: r.c }}>
                    {r.tag}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontFamily: mono,
                      fontSize: 10,
                      color: "var(--tx3)",
                    }}
                  >
                    {r.votes} agents
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--tx)",
                    marginBottom: 2,
                  }}
                >
                  {r.t}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--tx2)",
                    lineHeight: 1.45,
                  }}
                >
                  {r.d}
                </div>
                <div
                  style={{
                    marginTop: 7,
                    height: 3,
                    borderRadius: 2,
                    background: "rgba(255,255,255,.06)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: parseFloat(r.conf) * 100 + "%",
                      background: r.c,
                      borderRadius: 2,
                    }}
                  />
                </div>
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 10,
                    color: "var(--tx3)",
                    marginTop: 4,
                  }}
                >
                  confidence {r.conf}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* verdict gate */}
        <div
          ref={verdictRef}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 13,
            padding: "14px 16px",
            borderTop: "1px solid var(--line)",
            background: "#1c1c1f",
            transition: "background .4s",
          }}
        >
          <div
            ref={verdictIconRef}
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              flex: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,.05)",
              border: "1px solid var(--line2)",
              transition: "all .4s",
            }}
          >
            <span
              ref={verdictSpinRef}
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "2px solid var(--tx3)",
                borderTopColor: "var(--lime)",
                animation: "bt-spin .8s linear infinite",
              }}
            />
            <span
              ref={verdictBangRef}
              style={{
                display: "none",
                color: "#ff8a95",
                fontSize: 18,
                fontWeight: 800,
              }}
            >
              !
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              ref={verdictTitleRef}
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "-.01em",
                color: "var(--tx2)",
              }}
            >
              Coordinator reconciling 3 agents&hellip;
            </div>
            <div
              ref={verdictSubRef}
              style={{
                fontSize: 12,
                color: "var(--tx3)",
                fontFamily: mono,
                marginTop: 2,
              }}
            >
              deduping overlaps &middot; resolving severity
            </div>
          </div>
          <div
            ref={verdictTagRef}
            style={{
              fontFamily: mono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".08em",
              padding: "6px 11px",
              borderRadius: 7,
              background: "rgba(255,255,255,.05)",
              color: "var(--tx3)",
              border: "1px solid var(--line2)",
              whiteSpace: "nowrap",
              transition: "all .4s",
            }}
          >
            PENDING
          </div>
        </div>
      </div>
    </div>
  );
}

function Meter({
  label,
  color,
  countRef,
  barRef,
}: {
  label: string;
  color: string;
  countRef: React.RefObject<HTMLSpanElement | null>;
  barRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div style={{ background: "#1c1c1f", padding: "11px 13px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginBottom: 8,
        }}
      >
        <span
          style={{ width: 8, height: 8, borderRadius: 2, background: color }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".04em",
            color: "var(--tx2)",
          }}
        >
          {label}
        </span>
        <span
          ref={countRef}
          style={{
            marginLeft: "auto",
            fontFamily: mono,
            fontSize: 11,
            color: "var(--tx3)",
          }}
        >
          0
        </span>
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 3,
          background: "rgba(255,255,255,.06)",
          overflow: "hidden",
        }}
      >
        <div
          ref={barRef}
          style={{
            height: "100%",
            width: "0%",
            background: color,
            borderRadius: 3,
            transition: "width .25s ease-out",
          }}
        />
      </div>
    </div>
  );
}
