"use client";

import { useEffect, useRef } from "react";

type Point = { x: number; y: number; vx: number; vy: number; r: number };

/**
 * Fixed full-viewport particle field with a sweeping scan band.
 * Ported from the dc-script `setupCanvas` loop; cleaned up on unmount.
 */
export default function CanvasBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let w = 0;
    let h = 0;
    let pts: Point[] = [];
    const dprCap = 2;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(64, Math.floor((w * h) / 28000));
      pts = [];
      for (let i = 0; i < count; i++) {
        pts.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          r: Math.random() * 1.5 + 0.6,
        });
      }
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    if (reduced) {
      ctx.fillStyle = "rgba(92,138,240,.3)";
      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 7);
        ctx.fill();
      });
      return () => window.removeEventListener("resize", resize);
    }

    let raf = 0;
    let scanY = -120;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 17000) {
            const a = (1 - d2 / 17000) * 0.14;
            ctx.strokeStyle = "rgba(92,138,240," + a + ")";
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        const near = Math.abs(p.y - scanY) < 90;
        ctx.beginPath();
        ctx.fillStyle = near ? "rgba(130,168,246,.85)" : "rgba(92,138,240,.36)";
        ctx.arc(p.x, p.y, near ? p.r + 0.8 : p.r, 0, 7);
        ctx.fill();
      }
      scanY += 1.4;
      if (scanY > h + 120) scanY = -120;
      const grad = ctx.createLinearGradient(0, scanY - 70, 0, scanY + 4);
      grad.addColorStop(0, "rgba(92,138,240,0)");
      grad.addColorStop(1, "rgba(92,138,240,.04)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, scanY - 70, w, 74);
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
