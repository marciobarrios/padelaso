import { ImageResponse } from "next/og";

export const alt = "Padelaso — El tercer set empieza aquí";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "72px 78px",
        background: "#f6efde",
        color: "#14291f",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34, fontWeight: 800 }}>
          <span style={{ color: "#ff6b35", fontSize: 44 }}>●</span> Padelaso
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 78,
            lineHeight: 0.92,
            letterSpacing: -5,
            fontWeight: 900,
          }}
        >
          <span>El tercer set</span>
          <span>empieza aquí.</span>
        </div>
        <div style={{ fontSize: 26, color: "#3f5148" }}>Partidos, momentazos y estadísticas entre amigos.</div>
      </div>
      <div style={{ width: 290, height: 290, borderRadius: 999, background: "#d7ff54", border: "4px solid #14291f", boxShadow: "20px 20px 0 #95e3c1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 120 }}>🎾</div>
    </div>,
    size,
  );
}
