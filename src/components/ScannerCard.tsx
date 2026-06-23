"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

const mono = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

/**
 * The hero's interactive scanner card. A faithful React port of the
 * Sidecode-Landing export's two-agent scan state machine
 * (READY → scanning → agent meters → findings rail → verdict gate),
 * plus the card's 3D tilt. The cycle starts when the card scrolls into view
 * and loops; honors prefers-reduced-motion (settles instantly to BLOCKED).
 * All timers / rAF / listeners are cleaned up on unmount.
 */

type FindingRow = {
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

// Two agents (Security + Bug), matching the export verbatim.
const FINDINGS: FindingRow[] = [
  {
    c: "var(--sec)",
    tag: "SECURITY",
    sev: "CRITICAL",
    sevc: "var(--sec)",
    conf: "0.97",
    votes: "2 of 2",
    ln: "L5",
    t: "SQL injection via string concatenation",
    d: "User input flows into a raw query. Use a parameterized statement.",
  },
  {
    c: "var(--bug)",
    tag: "BUG",
    sev: "HIGH",
    sevc: "var(--bug)",
    conf: "0.91",
    votes: "1 of 2",
    ln: "L6",
    t: "Missing await on async db.query()",
    d: "rows resolves to a Promise; the downstream null-check never sees data.",
  },
];

function findingsHTML(): string {
  return FINDINGS.map(
    (rr, i) =>
      '<div style="display:flex;gap:12px;padding:13px 16px;border-bottom:1px solid var(--line);opacity:0;transform:translateY(8px);transition:opacity .4s,transform .4s" data-find="' +
      i +
      '">' +
      '<span style="width:3px;border-radius:2px;background:' +
      rr.c +
      ';flex:none"></span>' +
      '<div style="flex:1;min-width:0">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">' +
      '<span style="font-family:\'JetBrains Mono\',monospace;font-size:10px;font-weight:700;letter-spacing:.06em;color:' +
      rr.sevc +
      '">' +
      rr.sev +
      "</span>" +
      '<span style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--tx3)">' +
      rr.ln +
      "</span>" +
      '<span style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:' +
      rr.c +
      '">' +
      rr.tag +
      "</span>" +
      '<span style="margin-left:auto;font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--tx3)">' +
      rr.votes +
      " agents</span>" +
      "</div>" +
      '<div style="font-size:13.5px;font-weight:600;color:var(--tx);margin-bottom:2px">' +
      rr.t +
      "</div>" +
      '<div style="font-size:12px;color:var(--tx2);line-height:1.45">' +
      rr.d +
      "</div>" +
      '<div style="margin-top:7px;height:3px;border-radius:2px;background:rgba(255,255,255,.06);overflow:hidden"><div style="height:100%;width:' +
      parseFloat(rr.conf) * 100 +
      "%;background:" +
      rr.c +
      ';border-radius:2px"></div></div>' +
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--tx3);margin-top:4px">confidence ' +
      rr.conf +
      "</div>" +
      "</div>" +
      "</div>",
  ).join("");
}

const lnStyle: CSSProperties = { padding: "0 16px", color: "#6E6E6E" };
const lnStyleLight: CSSProperties = { padding: "0 16px", color: "#D4D4D4" };
const numStyle: CSSProperties = {
  display: "inline-block",
  width: 26,
  color: "#45454c",
};

export default function ScannerCard() {
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const statusDot = useRef<HTMLSpanElement | null>(null);
  const statusTxt = useRef<HTMLSpanElement | null>(null);
  const secBar = useRef<HTMLDivElement | null>(null);
  const bugBar = useRef<HTMLDivElement | null>(null);
  const secCount = useRef<HTMLSpanElement | null>(null);
  const bugCount = useRef<HTMLSpanElement | null>(null);
  const beam = useRef<HTMLDivElement | null>(null);
  const line5 = useRef<HTMLDivElement | null>(null);
  const line6 = useRef<HTMLDivElement | null>(null);
  const findings = useRef<HTMLDivElement | null>(null);
  const verdict = useRef<HTMLDivElement | null>(null);
  const verdictIcon = useRef<HTMLDivElement | null>(null);
  const verdictSpin = useRef<HTMLSpanElement | null>(null);
  const verdictTitle = useRef<HTMLDivElement | null>(null);
  const verdictSub = useRef<HTMLDivElement | null>(null);
  const verdictTag = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timers: number[] = [];
    let loopTimer = 0;

    const setStatus = (txt: string, color: string) => {
      if (statusTxt.current) {
        statusTxt.current.textContent = txt;
        statusTxt.current.style.color = color;
      }
      if (statusDot.current) {
        statusDot.current.style.background = color;
        statusDot.current.style.boxShadow = "0 0 8px " + color;
      }
    };

    const showFindings = () => {
      const f = findings.current;
      if (f && !f.dataset.built) {
        f.innerHTML = findingsHTML();
        f.dataset.built = "1";
      }
    };
    const revealFinding = (i: number) => {
      const el = findings.current?.querySelector<HTMLElement>(
        '[data-find="' + i + '"]',
      );
      if (el) {
        el.style.opacity = "1";
        el.style.transform = "none";
      }
    };

    const setBlocked = () => {
      if (verdictSpin.current) verdictSpin.current.style.display = "none";
      if (verdictIcon.current) {
        verdictIcon.current.style.background = "rgba(242,109,120,.14)";
        verdictIcon.current.style.borderColor = "rgba(242,109,120,.4)";
        verdictIcon.current.innerHTML =
          '<span style="color:#f58b94;font-size:18px;font-weight:800">!</span>';
      }
      if (verdictTitle.current) {
        verdictTitle.current.textContent = "Blocked · 1 critical, 1 high";
        verdictTitle.current.style.color = "#f58b94";
      }
      if (verdictSub.current)
        verdictSub.current.textContent = "fix L5 before this can merge";
      if (verdict.current)
        verdict.current.style.background = "rgba(242,109,120,.07)";
      if (verdictTag.current) {
        verdictTag.current.textContent = "BLOCKED";
        verdictTag.current.style.background = "rgba(242,109,120,.14)";
        verdictTag.current.style.color = "#f58b94";
        verdictTag.current.style.borderColor = "rgba(242,109,120,.4)";
      }
      setStatus("BLOCKED", "#F26D78");
    };

    const setFinal = () => {
      if (secBar.current) secBar.current.style.width = "100%";
      if (bugBar.current) bugBar.current.style.width = "100%";
      if (secCount.current) secCount.current.textContent = "1";
      if (bugCount.current) bugCount.current.textContent = "1";
      if (line5.current) {
        line5.current.style.background = "rgba(242,109,120,.12)";
        line5.current.style.boxShadow = "inset 3px 0 0 var(--sec)";
      }
      if (line6.current) {
        line6.current.style.background = "rgba(232,163,61,.12)";
        line6.current.style.boxShadow = "inset 3px 0 0 var(--bug)";
      }
      showFindings();
      findings.current
        ?.querySelectorAll<HTMLElement>("[data-find]")
        .forEach((el) => {
          el.style.opacity = "1";
          el.style.transform = "none";
        });
      setBlocked();
    };

    const resetScan = () => {
      if (beam.current) {
        beam.current.style.transition = "none";
        beam.current.style.opacity = "0";
        beam.current.style.top = "0px";
      }
      [secBar.current, bugBar.current].forEach((b) => {
        if (b) b.style.width = "0%";
      });
      if (secCount.current) secCount.current.textContent = "0";
      if (bugCount.current) bugCount.current.textContent = "0";
      [line5.current, line6.current].forEach((el) => {
        if (el) {
          el.style.background = "transparent";
          el.style.boxShadow = "none";
        }
      });
      if (findings.current?.dataset.built) {
        findings.current
          .querySelectorAll<HTMLElement>("[data-find]")
          .forEach((el) => {
            el.style.opacity = "0";
            el.style.transform = "translateY(8px)";
          });
      }
      if (verdictSpin.current) verdictSpin.current.style.display = "block";
      if (verdictIcon.current) {
        verdictIcon.current.style.background = "rgba(255,255,255,.05)";
        verdictIcon.current.style.borderColor = "var(--line)";
        verdictIcon.current.innerHTML =
          '<span style="width:16px;height:16px;border-radius:50%;border:2px solid var(--tx3);border-top-color:var(--in);display:block;animation:bt-spin .8s linear infinite"></span>';
      }
      if (verdictTitle.current) {
        verdictTitle.current.textContent =
          "Coordinator reconciling 2 agents…";
        verdictTitle.current.style.color = "var(--tx2)";
      }
      if (verdictSub.current)
        verdictSub.current.textContent =
          "deduping overlaps · resolving severity";
      if (verdict.current) verdict.current.style.background = "#2D2D30";
      if (verdictTag.current) {
        verdictTag.current.textContent = "SCANNING";
        verdictTag.current.style.background = "rgba(255,255,255,.05)";
        verdictTag.current.style.color = "var(--tx3)";
        verdictTag.current.style.borderColor = "var(--line)";
      }
      setStatus("SCANNING", "#5C8AF0");
    };

    const runScanCycle = () => {
      if (reduced) return;
      resetScan();
      const b = beam.current;
      const codeH = b?.parentElement?.offsetHeight ?? 0;
      timers.push(
        window.setTimeout(() => {
          if (b) {
            b.style.opacity = "1";
            b.style.transition = "top 3s cubic-bezier(.45,.05,.3,1)";
            b.style.top = codeH - 30 + "px";
          }
        }, 350),
      );

      const fill = (el: HTMLDivElement | null, to: number, delay: number) =>
        timers.push(
          window.setTimeout(() => {
            if (el) el.style.width = to + "%";
          }, delay),
        );
      fill(secBar.current, 45, 700);
      fill(secBar.current, 100, 2600);
      fill(bugBar.current, 30, 1000);
      fill(bugBar.current, 100, 2900);

      const hit = (
        el: HTMLDivElement | null,
        color: string,
        glow: string,
        delay: number,
      ) =>
        timers.push(
          window.setTimeout(() => {
            if (el) {
              el.style.background = glow;
              el.style.boxShadow = "inset 3px 0 0 " + color;
            }
          }, delay),
        );
      hit(line5.current, "var(--sec)", "rgba(242,109,120,.12)", 1450);
      hit(line6.current, "var(--bug)", "rgba(232,163,61,.12)", 2100);

      timers.push(
        window.setTimeout(() => {
          if (secCount.current) secCount.current.textContent = "1";
        }, 1500),
      );
      timers.push(
        window.setTimeout(() => {
          if (bugCount.current) bugCount.current.textContent = "1";
        }, 2150),
      );
      timers.push(
        window.setTimeout(() => {
          if (beam.current) beam.current.style.opacity = "0";
        }, 3400),
      );
      timers.push(window.setTimeout(() => showFindings(), 3500));
      timers.push(window.setTimeout(() => revealFinding(0), 3650));
      timers.push(window.setTimeout(() => revealFinding(1), 3900));
      timers.push(window.setTimeout(() => setBlocked(), 4400));

      loopTimer = window.setTimeout(() => runScanCycle(), 9500);
    };

    // Reduced motion: resolve straight to the blocked end-state.
    if (reduced) {
      setFinal();
    } else {
      // Start the cycle when the card scrolls into view (once).
      const wrap = tiltRef.current;
      let started = false;
      const startObs = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !started) {
              started = true;
              runScanCycle();
              obs.disconnect();
            }
          });
        },
        { rootMargin: "0px 0px -30% 0px" },
      );
      if (wrap) startObs.observe(wrap);

      // Tilt
      const inner = innerRef.current;
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
      wrap?.addEventListener("mousemove", onMove);
      wrap?.addEventListener("mouseleave", onLeave);

      return () => {
        startObs.disconnect();
        wrap?.removeEventListener("mousemove", onMove);
        wrap?.removeEventListener("mouseleave", onLeave);
        timers.forEach((t) => clearTimeout(t));
        clearTimeout(loopTimer);
      };
    }

    return () => {
      timers.forEach((t) => clearTimeout(t));
      clearTimeout(loopTimer);
    };
  }, []);

  return (
    <div
      ref={tiltRef}
      data-reveal
      data-reveal-delay="120"
      style={{ position: "relative", perspective: 1400 }}
    >
      <div
        ref={innerRef}
        style={{
          position: "relative",
          borderRadius: 14,
          background: "var(--surf)",
          border: "1px solid var(--line)",
          boxShadow: "0 40px 90px -36px rgba(0,0,0,.8)",
          transformStyle: "preserve-3d",
          transition: "transform .15s ease-out",
          overflow: "hidden",
        }}
      >
        {/* card header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "11px 14px",
            borderBottom: "1px solid var(--line)",
            background: "#2D2D30",
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
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    background: "#3C3C3C",
                  }}
                />
              ))}
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
              ref={statusDot}
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--tx3)",
              }}
            />
            <span ref={statusTxt}>READY</span>
          </div>
        </div>

        {/* agent meters (TWO) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 1,
            background: "var(--line)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <Meter
            color="var(--sec)"
            label="SECURITY"
            countRef={secCount}
            barRef={secBar}
          />
          <Meter
            color="var(--bug)"
            label="BUG"
            countRef={bugCount}
            barRef={bugBar}
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
            background: "#1E1E1E",
          }}
        >
          <div
            ref={beam}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 54,
              pointerEvents: "none",
              opacity: 0,
              background:
                "linear-gradient(180deg,transparent,rgba(92,138,240,.14) 70%,rgba(92,138,240,.32))",
              borderBottom: "1.5px solid var(--in)",
              boxShadow: "0 0 26px rgba(92,138,240,.4)",
              zIndex: 3,
            }}
          />
          <div style={{ position: "relative", zIndex: 2 }}>
            <div style={lnStyle}>
              <span style={numStyle}>1</span>
              <span style={{ color: "#C586C0" }}>import</span> {"{ db } "}
              <span style={{ color: "#C586C0" }}>from</span>{" "}
              <span style={{ color: "#CE9178" }}>&quot;./db&quot;</span>;
            </div>
            <div style={lnStyle}>
              <span style={numStyle}>2</span>
            </div>
            <div style={lnStyleLight}>
              <span style={numStyle}>3</span>
              <span style={{ color: "#C586C0" }}>export async function</span>{" "}
              <span style={{ color: "#DCDCAA" }}>getUser</span>(req, res) {"{"}
            </div>
            <div style={lnStyleLight}>
              <span style={numStyle}>4</span> {"  "}
              <span style={{ color: "#C586C0" }}>const</span> id = req.params.id;
            </div>
            <div
              ref={line5}
              style={{
                ...lnStyleLight,
                position: "relative",
                transition: "background .3s,box-shadow .3s",
              }}
            >
              <span style={numStyle}>5</span> {"  "}
              <span style={{ color: "#C586C0" }}>const</span> query ={" "}
              <span style={{ color: "#CE9178" }}>
                &quot;SELECT * FROM users WHERE id = &quot;
              </span>{" "}
              + id;
            </div>
            <div
              ref={line6}
              style={{
                ...lnStyleLight,
                position: "relative",
                transition: "background .3s,box-shadow .3s",
              }}
            >
              <span style={numStyle}>6</span> {"  "}
              <span style={{ color: "#C586C0" }}>const</span> rows = db.
              <span style={{ color: "#DCDCAA" }}>query</span>(query);
            </div>
            <div style={lnStyle}>
              <span style={numStyle}>7</span>
            </div>
            <div style={lnStyleLight}>
              <span style={numStyle}>8</span> {"  "}
              <span style={{ color: "#C586C0" }}>if</span> (rows =={" "}
              <span style={{ color: "#C586C0" }}>null</span>){" "}
              <span style={{ color: "#C586C0" }}>return</span> res.
              <span style={{ color: "#DCDCAA" }}>send</span>(
              <span style={{ color: "#B5CEA8" }}>404</span>);
            </div>
            <div style={lnStyleLight}>
              <span style={numStyle}>9</span> {"  "}
              <span style={{ color: "#C586C0" }}>const</span> user = rows[
              <span style={{ color: "#B5CEA8" }}>0</span>];
            </div>
            <div style={lnStyleLight}>
              <span style={numStyle}>10</span> {"  "}res.
              <span style={{ color: "#DCDCAA" }}>json</span>({"{"} id: user.id,
              name: user.name {"}"});
            </div>
            <div style={lnStyleLight}>
              <span style={numStyle}>11</span>
              {"}"}
            </div>
          </div>
        </div>

        {/* findings rail */}
        <div
          ref={findings}
          style={{
            borderTop: "1px solid var(--line)",
            background: "var(--surf)",
            height: 170,
            overflowY: "auto",
          }}
          className="bt-scroll"
        />

        {/* verdict gate */}
        <div
          ref={verdict}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 13,
            padding: "14px 16px",
            borderTop: "1px solid var(--line)",
            background: "#2D2D30",
            transition: "background .4s",
          }}
        >
          <div
            ref={verdictIcon}
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              flex: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,.05)",
              border: "1px solid var(--line)",
              transition: "all .4s",
            }}
          >
            <span
              ref={verdictSpin}
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "2px solid var(--tx3)",
                borderTopColor: "var(--in)",
                animation: "bt-spin .8s linear infinite",
                display: "block",
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              ref={verdictTitle}
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "-.01em",
                color: "var(--tx2)",
              }}
            >
              Coordinator reconciling 2 agents…
            </div>
            <div
              ref={verdictSub}
              style={{
                fontSize: 12,
                color: "var(--tx3)",
                fontFamily: mono,
                marginTop: 2,
              }}
            >
              deduping overlaps · resolving severity
            </div>
          </div>
          <div
            ref={verdictTag}
            style={{
              fontFamily: mono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".08em",
              padding: "6px 11px",
              borderRadius: 7,
              background: "rgba(255,255,255,.05)",
              color: "var(--tx3)",
              border: "1px solid var(--line)",
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
  color,
  label,
  countRef,
  barRef,
}: {
  color: string;
  label: string;
  countRef: React.RefObject<HTMLSpanElement | null>;
  barRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div style={{ background: "var(--surf)", padding: "11px 14px" }}>
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
            fontFamily: mono,
            fontSize: 11,
            fontWeight: 600,
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
