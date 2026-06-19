"use client";

import { useEffect } from "react";

/**
 * Wires the page's scroll/pointer micro-interactions onto the server-rendered
 * markup: data-reveal fade-ins, .counter count-ups, and [data-magnetic] CTAs.
 * Renders nothing. Ported from the dc-script setupReveal/setupCounters/
 * setupMagnetic + onScrollTick logic; all observers/listeners cleaned up.
 */
export default function PageInteractions() {
  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const cleanups: Array<() => void> = [];
    const rafs: number[] = [];

    // ── Reveal ──────────────────────────────────────────────────────
    const revealEls = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    revealEls.forEach((el) => {
      const d = parseInt(el.getAttribute("data-reveal-delay") || "0", 10);
      el.style.transition =
        "opacity .7s cubic-bezier(.22,.61,.36,1) " +
        d +
        "ms, transform .7s cubic-bezier(.22,.61,.36,1) " +
        d +
        "ms";
    });

    if (reduced) {
      revealEls.forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
    } else if (revealEls.length) {
      const revealObs = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const el = entry.target as HTMLElement;
              el.style.opacity = "1";
              el.style.transform = "none";
              obs.unobserve(el);
            }
          });
        },
        { rootMargin: "0px 0px -8% 0px" },
      );
      revealEls.forEach((el) => revealObs.observe(el));
      cleanups.push(() => revealObs.disconnect());
    }

    // ── Counters ────────────────────────────────────────────────────
    const counterEls = Array.from(
      document.querySelectorAll<HTMLElement>(".counter"),
    );
    const runCounter = (el: HTMLElement) => {
      const to = parseFloat(el.getAttribute("data-to") || "0");
      const pre = el.getAttribute("data-prefix") || "";
      const suf = el.getAttribute("data-suffix") || "";
      if (reduced) {
        el.textContent = pre + to + suf;
        return;
      }
      const dur = 1400;
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = pre + Math.round(to * e) + suf;
        if (p < 1) rafs.push(requestAnimationFrame(tick));
      };
      rafs.push(requestAnimationFrame(tick));
    };

    if (reduced) {
      counterEls.forEach((el) => runCounter(el));
    } else if (counterEls.length) {
      const counterObs = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              runCounter(entry.target as HTMLElement);
              obs.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -15% 0px" },
      );
      counterEls.forEach((el) => counterObs.observe(el));
      cleanups.push(() => counterObs.disconnect());
    }

    // ── Magnetic buttons ────────────────────────────────────────────
    if (!reduced) {
      document
        .querySelectorAll<HTMLElement>("[data-magnetic]")
        .forEach((el) => {
          const onMove = (ev: MouseEvent) => {
            const r = el.getBoundingClientRect();
            const x = ev.clientX - r.left - r.width / 2;
            const y = ev.clientY - r.top - r.height / 2;
            el.style.transform =
              "translate(" + x * 0.25 + "px," + y * 0.35 + "px)";
            el.style.boxShadow = "0 10px 40px rgba(131,200,24,.45)";
          };
          const onLeave = () => {
            el.style.transform = "translate(0,0)";
            el.style.boxShadow = "";
          };
          el.addEventListener("mousemove", onMove);
          el.addEventListener("mouseleave", onLeave);
          cleanups.push(() => {
            el.removeEventListener("mousemove", onMove);
            el.removeEventListener("mouseleave", onLeave);
          });
        });
    }

    return () => {
      rafs.forEach((id) => cancelAnimationFrame(id));
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
