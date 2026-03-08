"use client";

import React from "react";
import SiteHeader from "@/components/SiteHeader";

export default function UnderDevelopmentPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(120,102,213,0.18), transparent 28%), #070707",
        color: "#eaeaea",
        padding: 24,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <SiteHeader />

        <div
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 20,
            padding: 24,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
            boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
            marginBottom: 28,
            display: "flex",
            justifyContent: "center",
          }}
        >
          {/* Image */}
          <img
            src="/underdevelopment.png"
            alt="Under Development"
            style={{
              maxWidth: "900px",
              width: "100%",
              borderRadius: 16,
              boxShadow: "0 20px 80px rgba(0,0,0,0.6)",
              display: "block",
            }}
          />
        </div>
      </div>
    </div>
  );
}