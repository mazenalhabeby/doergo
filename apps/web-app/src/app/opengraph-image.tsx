import { ImageResponse } from "next/og";

// Branded 1200×630 social/preview card. Shown when the homepage is shared on
// social, in chat, and in some AI answer previews. Runs on the Node runtime
// (default) — reliable for the self-hosted standalone server.
export const alt = "HBCField — Field Service Management";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0e1116 0%, #0b1f18 60%, #072019 100%)",
          color: "#f2f2f0",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "#059669",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontWeight: 800,
              color: "#fff",
            }}
          >
            H
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>HBCField</div>
        </div>
        <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5, maxWidth: 900 }}>
          Field service management, unified.
        </div>
        <div style={{ fontSize: 30, color: "#9aa4ad", marginTop: 24, maxWidth: 860 }}>
          Task dispatch · GPS tracking · time & attendance · reporting — web & mobile.
        </div>
        <div style={{ position: "absolute", bottom: 70, left: 80, fontSize: 24, color: "#4b9e83" }}>
          hbcfield.com
        </div>
      </div>
    ),
    { ...size },
  );
}
