import { ImageResponse } from "next/og";

export const alt = "Sidecode — Ship fast. Merge with confidence.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(900px 600px at 78% 8%, rgba(92,138,240,0.18), transparent 60%), #1e1e1e",
          padding: "72px 80px",
          color: "#d4d4d4",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "#5C8AF0",
              boxShadow: "0 0 24px rgba(92,138,240,0.7)",
            }}
          />
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Sidecode
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
            }}
          >
            Ship fast.
          </div>
          <div
            style={{
              display: "flex",
              gap: 22,
              fontSize: 84,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
            }}
          >
            <span>Merge with</span>
            <span style={{ color: "#82a8f6" }}>confidence.</span>
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 30,
              color: "#9d9d9d",
              maxWidth: 880,
              lineHeight: 1.4,
            }}
          >
            Three specialist agents review every change and hand you one clear
            verdict before it merges.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            fontSize: 22,
            color: "#6e6e6e",
            fontFamily: "monospace",
          }}
        >
          <span style={{ color: "#f26d78" }}>security</span>
          <span>·</span>
          <span style={{ color: "#5C8AF0" }}>correctness</span>
          <span>·</span>
          <span style={{ color: "#e8a33d" }}>readability</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
