"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000").replace(/\/$/, "");

type CollectionItem = {
  collectionId: string;
  name: string | null;
  description?: string | null;
  image?: string | null;
  cachedAt?: string | null;
};

type CollectionsResponse = {
  items: CollectionItem[];
  limit: number;
  offset: number;
  total?: number | null;
};

export default function CollectionsPage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [limit] = useState(30);
  const [offset, setOffset] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [hasMore, setHasMore] = useState(true);

  // debounce search typing (prevents spam)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  async function fetchCollections(reset: boolean) {
    try {
      setError(null);
      setLoading(true);

      const nextOffset = reset ? 0 : offset;
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(nextOffset));
      if (debounced) params.set("query", debounced);

      const url = `${API_BASE}/collections?${params.toString()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());

      const json = (await res.json()) as CollectionsResponse;

      const newItems = json.items || [];
      setItems((prev) => (reset ? newItems : [...prev, ...newItems]));
      setOffset(nextOffset + newItems.length);

      // if we got fewer than limit, no more pages
      setHasMore(newItems.length === limit);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // (re)load when debounced query changes
  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    fetchCollections(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

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
    h1: { margin: 0, fontSize: 34 },

    card: {
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: 12,
      padding: 16,
      background: "rgba(0,0,0,0.55)",
      marginTop: 16,
    },
    label: { fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 6, display: "block" },
    input: {
      width: "100%",
      padding: "12px 12px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(0,0,0,0.55)",
      color: "#eaeaea",
      outline: "none",
    },

    muted: { color: "rgba(255,255,255,0.62)" },
    error: {
      marginTop: 12,
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid rgba(255,80,80,0.35)",
      background: "rgba(255,80,80,0.08)",
      color: "#ffd1d1",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
    },

    grid: {
      marginTop: 16,
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: 14,
    },

    item: {
      display: "block",
      padding: 12,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.03)",
      textDecoration: "none",
      color: "#eaeaea",
    },
    itemTop: { display: "flex", gap: 12, alignItems: "flex-start" },
    img: {
      width: 52,
      height: 52,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.18)",
      objectFit: "cover",
      background: "rgba(255,255,255,0.04)",
      flex: "0 0 52px",
    },
    noImg: {
      width: 52,
      height: 52,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.18)",
      display: "grid",
      placeItems: "center",
      fontSize: 11,
      color: "rgba(255,255,255,0.55)",
      background: "rgba(255,255,255,0.04)",
      flex: "0 0 52px",
    },
    name: { fontSize: 14, fontWeight: 700, margin: 0, lineHeight: 1.2 },
    id: { marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.55)" },
    desc: {
      marginTop: 10,
      fontSize: 12,
      color: "rgba(255,255,255,0.70)",
      lineHeight: 1.35,
      display: "-webkit-box",
      WebkitLineClamp: 3,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
    },

    row: { marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
    button: {
      padding: "11px 14px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.22)",
      background: "rgba(255,255,255,0.06)",
      color: "#fff",
      cursor: "pointer",
    },
    link: { color: "#cfcfcf", textDecoration: "underline" },

    // responsive
    grid2: {
      marginTop: 16,
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 14,
    },
    grid1: {
      marginTop: 16,
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 14,
    },
  };

  // simple responsive: use 3/2/1 columns based on window width without causing SSR issues
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

  const gridStyle = useMemo(() => {
    if (cols === 1) return styles.grid1;
    if (cols === 2) return styles.grid2;
    return styles.grid;
  }, [cols, styles.grid, styles.grid1, styles.grid2]);

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <SiteHeader />

        <div style={styles.card}>
          <h1 style={styles.h1}>Collections</h1>
          <div style={{ ...styles.muted, marginTop: 8 }}>
            Search for collections and jump straight into your progress.
          </div>
        </div>

        <div style={styles.card}>
          <label style={styles.label}>Search collections</label>
          <input
            style={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a name…"
          />

          <div style={styles.row}>
            <span style={styles.muted}>
              {loading ? "Loading…" : `Showing ${items.length} result(s)`}
              {debounced ? ` for “${debounced}”` : ""}
            </span>
          </div>

          {error && <div style={styles.error}>{error}</div>}
        </div>

        <div style={gridStyle}>
          {items.map((c) => {
            const name = c.name?.trim() ? c.name.trim() : `Collection ${c.collectionId}`;

            const href = `/progress?collectionId=${encodeURIComponent(
              c.collectionId
            )}&collectionName=${encodeURIComponent(name)}`;

            return (
              <Link key={c.collectionId} href={href} style={styles.item}>
                <div style={styles.itemTop}>
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt="" style={styles.img} loading="lazy" decoding="async" />
                  ) : (
                    <div style={styles.noImg}>No image</div>
                  )}

                  <div style={{ minWidth: 0 }}>
                    <p style={styles.name}>{name}</p>
                    <div style={styles.id}>ID: {c.collectionId}</div>
                  </div>
                </div>

                {c.description && <div style={styles.desc}>{c.description}</div>}
              </Link>
            );
          })}
        </div>

        <div style={styles.card}>
          <div style={styles.row}>
            <button style={styles.button} onClick={() => fetchCollections(false)} disabled={loading || !hasMore}>
              {hasMore ? (loading ? "Loading…" : "Load more") : "No more results"}
            </button>

            <span style={styles.muted}>
              Click a collection to open Progress.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}