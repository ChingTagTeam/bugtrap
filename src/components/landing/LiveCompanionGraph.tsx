"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

const mono = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

/**
 * The "Live companion" centerpiece: a scripted demo of the repo graph that
 * connects, builds out, takes a push, surfaces a finding, drafts a fix, and
 * goes green. A faithful React port of the export's runGraphCycle. Starts on
 * scroll-into-view, loops, and honors prefers-reduced-motion (settles to the
 * safe-to-merge end state instantly). Timers cleaned up on unmount.
 */

const STATIC_NODES = [
  { left: "50%", top: "11.5%", z: 0, label: "routes.ts", strong: false },
  { left: "18.75%", top: "42.5%", z: 0, label: "auth.ts", strong: false },
  { left: "81.25%", top: "42.5%", z: 0, label: "db.ts", strong: false },
  { left: "28.1%", top: "82.5%", z: 0, label: "utils.ts", strong: false },
  { left: "73.4%", top: "82.5%", z: 0, label: "index.ts", strong: false },
];

export default function LiveCompanionGraph() {
  const root = useRef<HTMLDivElement | null>(null);
  const gStatusDot = useRef<HTMLSpanElement | null>(null);
  const gStatusTxt = useRef<HTMLSpanElement | null>(null);
  const gTarget = useRef<HTMLDivElement | null>(null);
  const gBadge = useRef<HTMLDivElement | null>(null);
  const gPush = useRef<HTMLDivElement | null>(null);
  const gPR = useRef<HTMLDivElement | null>(null);
  const gLog = useRef<HTMLSpanElement | null>(null);
  const gLogDot = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const r = root.current;
    if (!r) return;

    const timers: number[] = [];
    let loopTimer = 0;

    const edges = Array.from(r.querySelectorAll<SVGLineElement>(".gedge"));
    const nodes = Array.from(r.querySelectorAll<HTMLElement>(".gnode"));

    edges.forEach((line) => {
      let len = 0;
      try {
        len = line.getTotalLength();
      } catch {
        len = 0;
      }
      if (len) {
        line.style.strokeDasharray = String(len);
        line.style.strokeDashoffset = String(len);
        line.style.transition = "stroke-dashoffset .9s ease, stroke .4s";
      }
    });
    nodes.forEach((n) => {
      n.style.opacity = "0";
      n.style.transform = "scale(.72)";
    });

    const setGState = (txt: string, color: string) => {
      if (gStatusTxt.current) gStatusTxt.current.textContent = txt;
      if (gStatusDot.current) {
        gStatusDot.current.style.background = color;
        gStatusDot.current.style.boxShadow = "0 0 8px " + color;
      }
    };
    const setGEvent = (txt: string, color: string) => {
      if (gLog.current) gLog.current.textContent = txt;
      if (gLogDot.current) {
        gLogDot.current.style.background = color;
        gLogDot.current.style.boxShadow = "0 0 8px " + color;
      }
    };

    const graphFinal = () => {
      nodes.forEach((n) => {
        n.style.opacity = "1";
        n.style.transform = "scale(1)";
      });
      edges.forEach((line) => (line.style.strokeDashoffset = "0"));
      if (gTarget.current) {
        gTarget.current.style.borderColor = "var(--safe)";
        gTarget.current.style.background = "rgba(78,201,168,.12)";
      }
      if (gPR.current) {
        gPR.current.style.opacity = "1";
        gPR.current.style.transform = "translateX(-50%) translateY(0)";
      }
      setGState("SAFE TO MERGE", "#4EC9A8");
      setGEvent(
        "PR #482 opened · api/users.ts · safe to merge",
        "#4EC9A8",
      );
    };

    const graphReset = () => {
      edges.forEach((line) => {
        const len = line.style.strokeDasharray;
        line.style.transition = "none";
        line.style.strokeDashoffset = len;
        line.style.stroke = "#3C3C3C";
      });
      void r.offsetHeight;
      edges.forEach(
        (line) =>
          (line.style.transition = "stroke-dashoffset .9s ease, stroke .4s"),
      );
      nodes.forEach((n) => {
        n.style.opacity = "0";
        n.style.transform = "scale(.72)";
      });
      if (gTarget.current) {
        gTarget.current.style.borderColor = "var(--line)";
        gTarget.current.style.background = "var(--elev)";
        gTarget.current.style.boxShadow = "none";
        gTarget.current.style.color = "var(--tx)";
        gTarget.current.style.animation = "none";
      }
      if (gBadge.current) {
        gBadge.current.style.opacity = "0";
        gBadge.current.style.transform = "scale(.6)";
      }
      if (gPush.current) {
        gPush.current.style.opacity = "0";
        gPush.current.style.transform = "translateX(-50%) translateY(-6px)";
      }
      if (gPR.current) {
        gPR.current.style.opacity = "0";
        gPR.current.style.transform = "translateX(-50%) translateY(8px)";
      }
      setGState("IDLE", "#6E6E6E");
      setGEvent("connect a repository to begin", "#6E6E6E");
    };

    const push = (fn: () => void, d: number) =>
      timers.push(window.setTimeout(fn, d));

    const runGraphCycle = () => {
      if (reduced) return;
      graphReset();

      // phase 1: connect + build graph
      push(() => {
        setGState("CONNECTED", "#5C8AF0");
        setGEvent("repository connected · building graph", "#5C8AF0");
      }, 250);
      nodes.forEach((n, i) =>
        push(() => {
          n.style.opacity = "1";
          n.style.transform = "scale(1)";
        }, 500 + i * 130),
      );
      push(
        () => edges.forEach((line) => (line.style.strokeDashoffset = "0")),
        700,
      );

      // phase 2: push
      push(() => {
        if (gPush.current) {
          gPush.current.style.opacity = "1";
          gPush.current.style.transform = "translateX(-50%) translateY(0)";
        }
        setGState("SCANNING", "#5C8AF0");
        setGEvent("push 3f9a2c1 · re-scanning api/users.ts", "#5C8AF0");
      }, 2400);
      push(() => {
        if (gTarget.current) {
          gTarget.current.style.borderColor = "var(--bug)";
          gTarget.current.style.boxShadow = "0 0 0 4px rgba(232,163,61,.12)";
          gTarget.current.style.animation = "bt-pulse 1.4s ease-out infinite";
        }
      }, 2700);

      // phase 3: finding
      push(() => {
        if (gTarget.current) {
          gTarget.current.style.animation = "none";
          gTarget.current.style.borderColor = "var(--sec)";
          gTarget.current.style.background = "rgba(242,109,120,.12)";
          gTarget.current.style.boxShadow =
            "0 0 22px -4px rgba(242,109,120,.5)";
        }
        if (gBadge.current) {
          gBadge.current.style.background = "var(--sec)";
          gBadge.current.style.opacity = "1";
          gBadge.current.style.transform = "scale(1)";
        }
        setGState("BLOCKED", "#F26D78");
        setGEvent("1 finding on api/users.ts · SQL injection (L5)", "#F26D78");
      }, 4400);

      // phase 4: fix -> green
      push(() => {
        if (gBadge.current) {
          gBadge.current.textContent = "FIXED";
          gBadge.current.style.background = "var(--safe)";
        }
        if (gTarget.current) {
          gTarget.current.style.borderColor = "var(--safe)";
          gTarget.current.style.background = "rgba(78,201,168,.14)";
          gTarget.current.style.boxShadow =
            "0 0 22px -4px rgba(78,201,168,.5)";
        }
        setGEvent("fix drafted · parameterized query", "#4EC9A8");
      }, 6300);
      push(() => {
        if (gPR.current) {
          gPR.current.style.opacity = "1";
          gPR.current.style.transform = "translateX(-50%) translateY(0)";
        }
        if (gTarget.current)
          gTarget.current.style.boxShadow =
            "0 0 18px -6px rgba(78,201,168,.45)";
        setGState("SAFE TO MERGE", "#4EC9A8");
        setGEvent(
          "PR #482 opened · api/users.ts · safe to merge",
          "#4EC9A8",
        );
      }, 7100);

      loopTimer = window.setTimeout(() => runGraphCycle(), 11500);
    };

    if (reduced) {
      graphFinal();
      return;
    }

    let started = false;
    const obs = new IntersectionObserver(
      (entries, o) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !started) {
            started = true;
            runGraphCycle();
            o.disconnect();
          }
        });
      },
      { rootMargin: "0px 0px -25% 0px" },
    );
    obs.observe(r);

    return () => {
      obs.disconnect();
      timers.forEach((t) => clearTimeout(t));
      clearTimeout(loopTimer);
    };
  }, []);

  return (
    <div
      data-reveal
      ref={root}
      style={{
        border: "1px solid var(--line)",
        borderRadius: 16,
        background: "var(--surf)",
        overflow: "hidden",
        boxShadow: "0 30px 80px -40px rgba(0,0,0,.7)",
      }}
    >
      {/* editor header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "11px 16px",
          borderBottom: "1px solid var(--line)",
          background: "#2D2D30",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: mono,
            fontSize: 12.5,
            color: "var(--tx2)",
          }}
        >
          <Image
            src="/Sidecode-logo.png"
            alt=""
            width={17}
            height={17}
            style={{ width: 17, height: 17, objectFit: "contain" }}
          />
          <span>sidecode</span>
          <span style={{ color: "var(--tx3)" }}>·</span>
          <span style={{ color: "var(--tx3)" }}>main</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: mono,
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: ".06em",
            color: "var(--tx3)",
          }}
        >
          <span
            ref={gStatusDot}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--tx3)",
              transition: "background .3s,box-shadow .3s",
            }}
          />
          <span ref={gStatusTxt}>IDLE</span>
        </div>
      </div>

      {/* graph body */}
      <div
        className="sc-graph-body"
        style={{
          position: "relative",
          height: 420,
          background: "#1E1E1E",
          overflow: "hidden",
        }}
      >
        <svg
          viewBox="0 0 640 400"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          {[
            [320, 46, 120, 170],
            [320, 46, 320, 200],
            [320, 46, 520, 170],
            [120, 170, 320, 200],
            [520, 170, 320, 200],
            [320, 200, 180, 330],
            [320, 200, 470, 330],
            [520, 170, 470, 330],
          ].map(([x1, y1, x2, y2], i) => (
            <line
              key={i}
              className="gedge"
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#3C3C3C"
              strokeWidth={1.4}
            />
          ))}
        </svg>

        {STATIC_NODES.slice(0, 2).map((n) => (
          <NodeWrap key={n.label} left={n.left} top={n.top}>
            <div className="gnode" style={nodeStyle}>
              {n.label}
            </div>
          </NodeWrap>
        ))}

        {/* target node */}
        <NodeWrap left="50%" top="50%" z={4}>
          <div
            ref={gTarget}
            className="gnode"
            style={{
              position: "relative",
              fontFamily: mono,
              fontSize: 13,
              fontWeight: 600,
              padding: "11px 16px",
              borderRadius: 10,
              background: "var(--elev)",
              border: "1.5px solid var(--line)",
              color: "var(--tx)",
              whiteSpace: "nowrap",
              transition:
                "opacity .5s,transform .5s,border-color .4s,background .4s,box-shadow .4s",
            }}
          >
            api/users.ts
            <div
              ref={gBadge}
              style={{
                position: "absolute",
                top: -12,
                right: -12,
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".04em",
                padding: "3px 8px",
                borderRadius: 999,
                background: "var(--sec)",
                color: "#1E1E1E",
                opacity: 0,
                transform: "scale(.6)",
                transition: "opacity .35s,transform .35s,background .35s",
              }}
            >
              1 ISSUE
            </div>
          </div>
        </NodeWrap>

        {STATIC_NODES.slice(2).map((n) => (
          <NodeWrap key={n.label} left={n.left} top={n.top}>
            <div className="gnode" style={nodeStyle}>
              {n.label}
            </div>
          </NodeWrap>
        ))}

        {/* push chip */}
        <div
          ref={gPush}
          style={{
            position: "absolute",
            left: "50%",
            top: 24,
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: mono,
            fontSize: 11.5,
            padding: "7px 13px",
            borderRadius: 999,
            background: "var(--surf)",
            border: "1px solid var(--line)",
            color: "var(--tx2)",
            opacity: 0,
            transition: "opacity .4s,transform .4s",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--in)",
            }}
          />
          push <span style={{ color: "var(--tx3)" }}>3f9a2c1</span> ·{" "}
          <span style={{ color: "var(--tx3)" }}>api/users.ts</span>
        </div>

        {/* PR chip */}
        <div
          ref={gPR}
          style={{
            position: "absolute",
            left: "50%",
            bottom: 20,
            transform: "translateX(-50%) translateY(8px)",
            display: "flex",
            alignItems: "center",
            gap: 9,
            fontFamily: mono,
            fontSize: 12,
            padding: "9px 15px",
            borderRadius: 11,
            background: "rgba(78,201,168,.1)",
            border: "1px solid rgba(78,201,168,.4)",
            color: "var(--safe)",
            opacity: 0,
            transition: "opacity .4s,transform .4s",
            whiteSpace: "nowrap",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          fix drafted · PR #482 · safe to merge
        </div>
      </div>

      {/* event log bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "11px 16px",
          borderTop: "1px solid var(--line)",
          background: "#2D2D30",
          fontFamily: mono,
          fontSize: 11.5,
          color: "var(--tx3)",
        }}
      >
        <span
          ref={gLogDot}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--tx3)",
            flex: "none",
            transition: "background .3s,box-shadow .3s",
          }}
        />
        <span ref={gLog} style={{ color: "var(--tx2)" }}>
          connect a repository to begin
        </span>
      </div>
    </div>
  );
}

const nodeStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 12.5,
  padding: "9px 14px",
  borderRadius: 9,
  background: "var(--elev)",
  border: "1px solid var(--line)",
  color: "var(--tx2)",
  whiteSpace: "nowrap",
  transition: "opacity .5s,transform .5s",
};

function NodeWrap({
  left,
  top,
  z = 0,
  children,
}: {
  left: string;
  top: string;
  z?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        transform: "translate(-50%,-50%)",
        ...(z ? { zIndex: z } : {}),
      }}
    >
      {children}
    </div>
  );
}
