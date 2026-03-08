"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

const ACCENT = "#7866d5";

function AdSlot({
  label,
  height = 120,
}: {
  label: string;
  height?: number;
}) {
  const styles: Record<string, React.CSSProperties> = {
    box: {
      height,
      borderRadius: 14,
      border: "1px dashed rgba(255,255,255,0.22)",
      background: "rgba(255,255,255,0.03)",
      display: "grid",
      placeItems: "center",
      color: "rgba(255,255,255,0.65)",
      fontSize: 13,
      userSelect: "none",
    },
    pill: {
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(0,0,0,0.35)",
    },
  };

  return (
    <div style={styles.box}>
      <div style={styles.pill}>{label}</div>
    </div>
  );
}

export default function HomePage() {
  const [cols, setCols] = useState(3);

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      setCols(w < 720 ? 1 : w < 980 ? 2 : 3);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      background:
        "radial-gradient(circle at top, rgba(120,102,213,0.18), transparent 28%), #070707",
      color: "#eaeaea",
      padding: 24,
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    },
    wrap: { maxWidth: 1100, margin: "0 auto" },

    hero: {
      marginTop: 14,
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.18)",
      background: `linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.45)),
                  radial-gradient(circle at 20% 10%, ${ACCENT}25, transparent 55%),
                  rgba(0,0,0,0.55)`,
      padding: 18,
    },
    h1: { margin: 0, fontSize: 36, lineHeight: 1.1 },
    sub: {
      marginTop: 10,
      color: "rgba(255,255,255,0.75)",
      lineHeight: 1.5,
      maxWidth: 820,
    },
    row: { marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
    button: {
      padding: "12px 14px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.22)",
      background: "rgba(255,255,255,0.06)",
      color: "#fff",
      cursor: "pointer",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
    },
    buttonAccent: {
      padding: "12px 14px",
      borderRadius: 12,
      border: `1px solid ${ACCENT}66`,
      background: `${ACCENT}22`,
      color: "#fff",
      cursor: "pointer",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
    },
    muted: { color: "rgba(255,255,255,0.62)" },

    card: {
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: 12,
      padding: 16,
      background: "rgba(0,0,0,0.55)",
      marginTop: 16,
    },

    grid: {
      marginTop: 16,
      display: "grid",
      gridTemplateColumns: cols === 1 ? "1fr" : cols === 2 ? "1fr 1fr" : "1fr 1fr 1fr",
      gap: 14,
    },
    featureTitle: { margin: 0, fontSize: 16, fontWeight: 800 },
    featureText: { marginTop: 8, color: "rgba(255,255,255,0.72)", lineHeight: 1.45, fontSize: 13 },

    steps: { marginTop: 14, display: "grid", gap: 10 },
    step: {
      display: "flex",
      gap: 12,
      alignItems: "flex-start",
      padding: 12,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.03)",
    },
    badge: {
      width: 28,
      height: 28,
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.18)",
      background: `${ACCENT}22`,
      display: "grid",
      placeItems: "center",
      fontWeight: 800,
      color: "#fff",
      flex: "0 0 28px",
    },
    stepTitle: { margin: 0, fontWeight: 800, fontSize: 14 },
    stepText: { marginTop: 4, color: "rgba(255,255,255,0.72)", lineHeight: 1.45, fontSize: 13 },

    footer: {
      marginTop: 18,
      paddingTop: 14,
      borderTop: "1px solid rgba(255,255,255,0.10)",
      color: "rgba(255,255,255,0.55)",
      fontSize: 12,
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
    },
    link: { color: "#cfcfcf", textDecoration: "underline" },
  };

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <SiteHeader />

        <div style={styles.hero}>
          <h1 style={styles.h1}>Explore. Collect. Complete.</h1>
          <div style={styles.sub}>
            Explore Enjin collections, Collect missing tokens, Complete the full collection.                           
          </div>

          <div style={{ marginTop: 16 }}>
            <AdSlot label="Ad Slot — Top Banner (e.g. 728×90 / 970×90)" height={110} />
          </div>
        </div>

        <div style={styles.grid}>
          <div style={styles.card}>
            <p style={styles.featureTitle}> Completion tracking</p>
            <div style={styles.featureText}>
              See owned vs missing, with a clean split view. Great for collectors chasing sets.
            </div>
          </div>

          <div style={styles.card}>
            <p style={styles.featureTitle}> Under Development</p>
            <div style={styles.featureText}>
              I have had a awesome idea while building this but dont want to give anything away just yet.
            </div>
          </div>

          <div style={styles.card}>
            <p style={styles.featureTitle}> Enjin</p>
            <div style={styles.featureText}>
              Powered by, Running on and always growing.
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>How it works</p>
          <div style={styles.steps}>
            <div style={styles.step}>
              <div style={styles.badge}>1</div>
              <div>
                <p style={styles.stepTitle}>Browse a collection</p>
                <div style={styles.stepText}>Open Collections, search by name, and pick what you want to track. Tracking is under development</div>
              </div>
            </div>

            <div style={styles.step}>
              <div style={styles.badge}>2</div>
              <div>
                <p style={styles.stepTitle}>Check your progress</p>
                <div style={styles.stepText}>
                  Check your wallet. See how close you are to completing another collection.
                </div>
              </div>
            </div>

            <div style={styles.step}>
              <div style={styles.badge}>3</div>
              <div>
                <p style={styles.stepTitle}>Go for 100%</p>
                <div style={styles.stepText}>
                  How far are you? Is it on sale? Can you finish one more collection???
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <AdSlot label="Ad Slot — Footer Banner" height={90} />
        </div>

        <div style={styles.footer}>
          <div>Alpha build • Enjin-only • Built for collectors</div>
          <div>
            <Link href="/collections" style={styles.link}>Collections</Link>{" "}
            •{" "}
            <Link href="/progress" style={styles.link}>Progress</Link>{" "}
            •{" "}
            <Link href="/enjin" style={styles.link}>Enjin</Link>
          </div>
        </div>
      </div>
    </div>
  );
}