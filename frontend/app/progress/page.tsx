"use client";

import React, { Suspense, useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";

const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000").replace(/\/$/, "");

type ProgressResponse = {
  address: string;
  collectionId: string;

  collectionName?: string | null;
  collectionDescription?: string | null;
  collectionImage?: string | null;

  totalTokens: number;
  ownedCount: number;
  missingCount: number;
  completionPct: number;

  owned: string[];
  missing: string[];

  note?: string | null;
  cached?: boolean;
};

type TokenMetaItem = {
  tokenId: string;
  name: string | null;
  image: string | null;
  uri?: string | null;
  cached?: boolean;
};

type TokenMetaResponse = {
  collectionId: string;
  items: TokenMetaItem[];
};

const DEFAULT_WALLET = "";
const DEFAULT_COLLECTION_ID = "";

const INITIAL_PER_LIST = 80;
const LOAD_MORE_STEP = 100;
const COOLDOWN_MS = 10_000;
const FORCE_REFRESH_MS = 10 * 60 * 1000;

const LS_WALLET_KEY = "ect.wallet";
const LS_COLLECTION_ID_KEY = "ect.collectionId";
const LS_COLLECTION_NAME_KEY = "ect.collectionName";
const LS_FORCE_REFRESH_UNTIL_KEY = "ect.progress.forceRefreshUntil";

type SelectedToken = {
  tokenId: string;
  list: "owned" | "missing";
  name: string;
  image: string | null;
  uri?: string | null;
};

function ProgressPageInner() {
  const searchParams = useSearchParams();

  const [wallet, setWallet] = useState(DEFAULT_WALLET);
  const [collectionNameInput, setCollectionNameInput] = useState<string>("");
  const [collectionId, setCollectionId] = useState<string>(DEFAULT_COLLECTION_ID);

  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<ProgressResponse | null>(null);
  const [tokenMeta, setTokenMeta] = useState<Record<string, TokenMetaItem>>({});
  const tokenMetaRef = useRef<Record<string, TokenMetaItem>>({});

  const [ownedVisible, setOwnedVisible] = useState(INITIAL_PER_LIST);
  const [missingVisible, setMissingVisible] = useState(INITIAL_PER_LIST);

  const [ownedCooldownUntil, setOwnedCooldownUntil] = useState<number>(0);
  const [missingCooldownUntil, setMissingCooldownUntil] = useState<number>(0);
  const [forceRefreshUntil, setForceRefreshUntil] = useState<number>(0);

  const [nowTick, setNowTick] = useState(Date.now());
  const tickTimerRef = useRef<any>(null);
  const autoLoadedRef = useRef(false);

  const [selected, setSelected] = useState<SelectedToken | null>(null);

  useEffect(() => {
    tokenMetaRef.current = tokenMeta;
  }, [tokenMeta]);

  function saveInputsToLocal(w: string, cid: string, cname: string) {
    try {
      localStorage.setItem(LS_WALLET_KEY, w);
      localStorage.setItem(LS_COLLECTION_ID_KEY, cid);
      if (cname) localStorage.setItem(LS_COLLECTION_NAME_KEY, cname);
    } catch {
      // ignore
    }
  }

  function saveForceRefreshUntil(ts: number) {
    try {
      localStorage.setItem(LS_FORCE_REFRESH_UNTIL_KEY, String(ts));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    try {
      const savedWallet = localStorage.getItem(LS_WALLET_KEY);
      const savedCid = localStorage.getItem(LS_COLLECTION_ID_KEY);
      const savedCname = localStorage.getItem(LS_COLLECTION_NAME_KEY);
      const savedForceUntil = localStorage.getItem(LS_FORCE_REFRESH_UNTIL_KEY);

      if (savedWallet && savedWallet.trim()) setWallet(savedWallet.trim());
      if (savedCid && savedCid.trim()) setCollectionId(savedCid.trim());

      if (savedCname && savedCname.trim()) {
        setCollectionNameInput(savedCname.trim());
      } else if (savedCid && savedCid.trim()) {
        setCollectionNameInput(`Collection ${savedCid.trim()}`);
      }

      if (savedForceUntil) {
        const ts = Number(savedForceUntil);
        if (Number.isFinite(ts) && ts > Date.now()) {
          setForceRefreshUntil(ts);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const cid = searchParams.get("collectionId");
    const cname = searchParams.get("collectionName");
    const w = searchParams.get("wallet");

    if (w && w.trim()) setWallet(w.trim());

    if (cid && cid.trim()) {
      setCollectionId(cid.trim());
      setCollectionNameInput((prev) => (prev?.trim() ? prev : `Collection ${cid.trim()}`));
    }

    if (cname && cname.trim()) {
      setCollectionNameInput(cname.trim());
    }
  }, [searchParams]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const needsTick =
      (ownedCooldownUntil && ownedCooldownUntil > Date.now()) ||
      (missingCooldownUntil && missingCooldownUntil > Date.now()) ||
      (forceRefreshUntil && forceRefreshUntil > Date.now());

    if (!needsTick) {
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
      return;
    }

    if (!tickTimerRef.current) {
      tickTimerRef.current = setInterval(() => setNowTick(Date.now()), 250);
    }

    return () => {
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };
  }, [ownedCooldownUntil, missingCooldownUntil, forceRefreshUntil]);

  const ownedList = useMemo(() => (data?.owned || []).slice(0, ownedVisible), [data, ownedVisible]);
  const missingList = useMemo(
    () => (data?.missing || []).slice(0, missingVisible),
    [data, missingVisible]
  );

  async function fetchTokenMeta(ids: string[], force: boolean) {
    if (!ids.length) return;

    const currentMeta = tokenMetaRef.current;
    const need = force ? ids : ids.filter((t) => !currentMeta[t]);
    if (!need.length) return;

    setMetaLoading(true);
    try {
      const c = collectionId.trim();

      const chunks: string[][] = [];
      for (let i = 0; i < need.length; i += 110) chunks.push(need.slice(i, i + 110));

      const merged: Record<string, TokenMetaItem> = {};

      for (const chunk of chunks) {
        const metaUrl = `${API_BASE}/tokens/meta/${encodeURIComponent(
          c
        )}?ids=${encodeURIComponent(chunk.join(","))}&refresh=${force ? "true" : "false"}`;

        const metaRes = await fetch(metaUrl, { cache: "no-store" });
        if (!metaRes.ok) throw new Error(await metaRes.text());

        const metaJson = (await metaRes.json()) as TokenMetaResponse;
        for (const it of metaJson.items || []) merged[it.tokenId] = it;
      }

      tokenMetaRef.current = { ...tokenMetaRef.current, ...merged };
      setTokenMeta((prev) => ({ ...prev, ...merged }));
    } finally {
      setMetaLoading(false);
    }
  }

  async function fetchProgress(force: boolean) {
    setError(null);
    setLoading(true);
    setMetaLoading(false);

    try {
      const w = wallet.trim();
      const cid = collectionId.trim();
      const cname = collectionNameInput.trim();

      if (!w) throw new Error("No wallet address found.");
      if (!cid) throw new Error("No collection selected.");

      saveInputsToLocal(w, cid, cname);

      setOwnedVisible(INITIAL_PER_LIST);
      setMissingVisible(INITIAL_PER_LIST);
      setSelected(null);

      const progUrl = `${API_BASE}/progress/${encodeURIComponent(w)}/${encodeURIComponent(
        cid
      )}?refresh=${force ? "true" : "false"}`;

      const progRes = await fetch(progUrl, { cache: "no-store" });
      if (!progRes.ok) throw new Error(await progRes.text());

      const progJson = (await progRes.json()) as ProgressResponse;
      setData(progJson);

      if (progJson.collectionName && progJson.collectionName.trim()) {
        setCollectionNameInput(progJson.collectionName.trim());
        saveInputsToLocal(w, cid, progJson.collectionName.trim());
      }

      tokenMetaRef.current = {};
      setTokenMeta({});

      const ids = [
        ...(progJson.owned || []).slice(0, INITIAL_PER_LIST),
        ...(progJson.missing || []).slice(0, INITIAL_PER_LIST),
      ];
      const uniq = Array.from(new Set(ids));
      await fetchTokenMeta(uniq, force);

      if (force) {
        const until = Date.now() + FORCE_REFRESH_MS;
        setForceRefreshUntil(until);
        saveForceRefreshUntil(until);
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
      setData(null);
      tokenMetaRef.current = {};
      setTokenMeta({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoLoadedRef.current) return;

    const hasWallet = !!wallet.trim();
    const hasCollection = !!collectionId.trim();

    if (hasWallet && hasCollection) {
      autoLoadedRef.current = true;
      fetchProgress(false);
    }
  }, [wallet, collectionId]);

  function secondsLeft(until: number) {
    const ms = until - nowTick;
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  }

  function formatCooldown(until: number) {
    const secs = secondsLeft(until);
    if (secs <= 0) return "Ready";
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}:${String(rem).padStart(2, "0")}`;
  }

  async function onLoadMoreOwned() {
    if (!data) return;
    const now = Date.now();
    if (ownedCooldownUntil > now) return;

    const next = Math.min((data.owned || []).length, ownedVisible + LOAD_MORE_STEP);
    const newIds = (data.owned || []).slice(ownedVisible, next);

    setOwnedVisible(next);
    setOwnedCooldownUntil(Date.now() + COOLDOWN_MS);
    await fetchTokenMeta(newIds, false);
  }

  async function onLoadMoreMissing() {
    if (!data) return;
    const now = Date.now();
    if (missingCooldownUntil > now) return;

    const next = Math.min((data.missing || []).length, missingVisible + LOAD_MORE_STEP);
    const newIds = (data.missing || []).slice(missingVisible, next);

    setMissingVisible(next);
    setMissingCooldownUntil(Date.now() + COOLDOWN_MS);
    await fetchTokenMeta(newIds, false);
  }

  function openToken(tokenId: string, list: "owned" | "missing") {
    const meta = tokenMetaRef.current[tokenId];
    const name = meta?.name?.trim() ? meta.name : `Token #${tokenId}`;
    const image = meta?.image?.trim() ? meta.image : null;
    const uri = meta?.uri?.trim() ? meta.uri : null;
    setSelected({ tokenId, list, name, image, uri });
  }

  async function copyText(txt: string) {
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

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

    card: {
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: 12,
      padding: 16,
      background: "rgba(0,0,0,0.55)",
      marginTop: 16,
    },

    row: { marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
    buttonSmall: {
      padding: "9px 12px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.22)",
      background: "rgba(255,255,255,0.06)",
      color: "#fff",
      cursor: "pointer",
      fontSize: 13,
    },
    buttonSmallDanger: {
      padding: "8px 10px",
      borderRadius: 10,
      border: "1px solid rgba(255,140,140,0.35)",
      background: "rgba(255,80,80,0.10)",
      color: "#fff",
      cursor: "pointer",
      fontSize: 12,
      whiteSpace: "nowrap",
    },
    buttonSmallDisabled: {
      padding: "8px 10px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.03)",
      color: "rgba(255,255,255,0.55)",
      cursor: "not-allowed",
      fontSize: 12,
      whiteSpace: "nowrap",
    },
    muted: { color: "rgba(255,255,255,0.62)" },
    error: {
      marginTop: 16,
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid rgba(255,80,80,0.35)",
      background: "rgba(255,80,80,0.08)",
      color: "#ffd1d1",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
    },

    metaRow: { display: "flex", gap: 14, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" },
    metaLeft: { display: "flex", gap: 14, alignItems: "flex-start", minWidth: 0, flex: 1 },
    metaRight: { display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" },
    cover: {
      width: 88,
      height: 88,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.18)",
      objectFit: "cover",
      background: "rgba(255,255,255,0.04)",
      flex: "0 0 88px",
    },
    noCover: {
      width: 88,
      height: 88,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.18)",
      display: "grid",
      placeItems: "center",
      color: "rgba(255,255,255,0.55)",
      fontSize: 12,
      background: "rgba(255,255,255,0.04)",
      flex: "0 0 88px",
    },
    title: { fontSize: 22, fontWeight: 700, margin: "2px 0" },
    mono: {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      overflowWrap: "anywhere",
      marginTop: 6,
    },

    stats: { marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 },
    stat: {
      padding: 12,
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(0,0,0,0.35)",
    },
    statLabel: { color: "rgba(255,255,255,0.62)", fontSize: 12, marginBottom: 6 },
    statValue: { fontSize: 20, fontWeight: 700 },

    lists: { marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 },
    listHeader: { fontSize: 18, fontWeight: 700, marginBottom: 12 },
    listBox: {
      height: 360,
      overflow: "auto",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      background: "rgba(255,255,255,0.03)",
    },

    tokenRow: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      padding: "10px 12px",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      cursor: "pointer",
      userSelect: "none",
      contentVisibility: "auto",
      containIntrinsicSize: "60px",
    },
    tokenRowHover: { background: "rgba(255,255,255,0.04)" },
    thumb: {
      width: 38,
      height: 38,
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.18)",
      objectFit: "cover",
      background: "rgba(255,255,255,0.04)",
      flex: "0 0 38px",
    },
    placeholder: {
      width: 38,
      height: 38,
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.04)",
      flex: "0 0 38px",
    },
    tokenName: {
      fontSize: 14,
      fontWeight: 600,
      color: "rgba(255,255,255,0.92)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: 360,
    },
    tokenSub: { marginTop: 2, fontSize: 12, color: "rgba(255,255,255,0.55)" },

    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.55)",
      zIndex: 2000,
      display: "flex",
      justifyContent: "flex-end",
    },
    drawer: {
      width: 420,
      maxWidth: "92vw",
      height: "100%",
      background: "rgba(10,10,10,0.98)",
      borderLeft: "1px solid rgba(255,255,255,0.16)",
      padding: 16,
      overflow: "auto",
    },
    drawerTop: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 12,
    },
    drawerTitle: { fontSize: 16, fontWeight: 800 },
    closeBtn: {
      padding: "8px 10px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.22)",
      background: "rgba(255,255,255,0.06)",
      color: "#fff",
      cursor: "pointer",
    },
    bigImage: {
      width: "100%",
      height: 320,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.16)",
      objectFit: "cover",
      background: "rgba(255,255,255,0.04)",
    },
    drawerSection: {
      marginTop: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 12,
      padding: 12,
      background: "rgba(255,255,255,0.03)",
    },
    kv: { display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, alignItems: "start" },
    k: { color: "rgba(255,255,255,0.62)", fontSize: 12 },
    vMono: {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 12,
      overflowWrap: "anywhere",
    },
    vText: { fontSize: 14, color: "rgba(255,255,255,0.92)", overflowWrap: "anywhere" },
  };

  const ownedCanLoadMore = data ? ownedVisible < (data.owned || []).length : false;
  const missingCanLoadMore = data ? missingVisible < (data.missing || []).length : false;

  const ownedWait = secondsLeft(ownedCooldownUntil);
  const missingWait = secondsLeft(missingCooldownUntil);
  const forceWait = secondsLeft(forceRefreshUntil);

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <SiteHeader />

        {error && <div style={styles.error}>{error}</div>}

        {data && (
          <>
            <div style={styles.card}>
              <div style={styles.metaRow}>
                <div style={styles.metaLeft}>
                  {data.collectionImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.collectionImage} alt="" style={styles.cover} loading="lazy" decoding="async" />
                  ) : (
                    <div style={styles.noCover}>No image</div>
                  )}

                  <div style={{ minWidth: 0 }}>
                    <div style={styles.muted}>Collection</div>
                    <div style={styles.title}>
                      {data.collectionName || collectionNameInput || `Collection ${data.collectionId}`}
                    </div>
                    <div style={styles.muted}>
                      ID: {data.collectionId}
                      {data ? ` • Status: ${data.cached ? "CACHED" : "LIVE"} • Tokens loaded ${Object.keys(tokenMeta).length}` : ""}
                    </div>
                  </div>
                </div>

                <div style={styles.metaRight}>
                  <button
                    type="button"
                    style={forceWait > 0 || loading || metaLoading ? styles.buttonSmallDisabled : styles.buttonSmallDanger}
                    onClick={() => fetchProgress(true)}
                    disabled={forceWait > 0 || loading || metaLoading}
                    title="Bypass cache for both progress and token thumbnails"
                  >
                    {forceWait > 0 ? `Refresh in ${formatCooldown(forceRefreshUntil)}` : "Force refresh"}
                  </button>
                </div>
              </div>

              {data.collectionDescription && (
                <p style={{ marginTop: 12, color: "rgba(255,255,255,0.78)", lineHeight: 1.45 }}>
                  {data.collectionDescription}
                </p>
              )}

              <div style={{ marginTop: 12, ...styles.muted }}>Connected Wallet</div>
              <div style={styles.mono}>{data.address}</div>

              <div style={styles.stats}>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>Total</div>
                  <div style={styles.statValue}>{data.totalTokens}</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>Owned</div>
                  <div style={styles.statValue}>{data.ownedCount}</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>Missing</div>
                  <div style={styles.statValue}>{data.missingCount}</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>Completion</div>
                  <div style={styles.statValue}>{data.completionPct}%</div>
                </div>
              </div>

              <div style={{ marginTop: 10, ...styles.muted, fontSize: 12 }}>
                {data.note || "owned/missing lists truncated to 5000 each"}
              </div>
            </div>

            <div style={styles.lists}>
              <div style={styles.card}>
                <div style={styles.listHeader}>Owned ({data.ownedCount})</div>
                <div style={styles.listBox}>
                  {ownedList.map((tid) => (
                    <TokenRow
                      key={`o-${tid}`}
                      tokenId={tid}
                      meta={tokenMeta[tid]}
                      styles={styles}
                      onClick={() => openToken(tid, "owned")}
                    />
                  ))}
                </div>

                <div style={{ ...styles.row, marginTop: 12 }}>
                  {ownedCanLoadMore ? (
                    <button
                      type="button"
                      style={ownedWait > 0 || metaLoading ? styles.buttonSmallDisabled : styles.buttonSmall}
                      disabled={ownedWait > 0 || metaLoading}
                      onClick={onLoadMoreOwned}
                    >
                      {ownedWait > 0 ? `Wait ${ownedWait}s…` : `Load ${LOAD_MORE_STEP} more thumbnails`}
                    </button>
                  ) : (
                    <span style={styles.muted}>All owned tokens loaded.</span>
                  )}
                  <span style={styles.muted}>
                    Showing {ownedList.length} / {(data.owned || []).length}
                  </span>
                </div>
              </div>

              <div style={styles.card}>
                <div style={styles.listHeader}>Missing ({data.missingCount})</div>
                <div style={styles.listBox}>
                  {missingList.map((tid) => (
                    <TokenRow
                      key={`m-${tid}`}
                      tokenId={tid}
                      meta={tokenMeta[tid]}
                      styles={styles}
                      onClick={() => openToken(tid, "missing")}
                    />
                  ))}
                </div>

                <div style={{ ...styles.row, marginTop: 12 }}>
                  {missingCanLoadMore ? (
                    <button
                      type="button"
                      style={missingWait > 0 || metaLoading ? styles.buttonSmallDisabled : styles.buttonSmall}
                      disabled={missingWait > 0 || metaLoading}
                      onClick={onLoadMoreMissing}
                    >
                      {missingWait > 0 ? `Wait ${missingWait}s…` : `Load ${LOAD_MORE_STEP} more thumbnails`}
                    </button>
                  ) : (
                    <span style={styles.muted}>All missing tokens loaded.</span>
                  )}
                  <span style={styles.muted}>
                    Showing {missingList.length} / {(data.missing || []).length}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {!data && !loading && !error && (
          <div style={styles.card}>
            <div style={styles.muted}>
              No collection loaded yet. Open a collection from the Collections page to load progress.
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div style={styles.overlay} onMouseDown={() => setSelected(null)} aria-hidden="true">
          <div style={styles.drawer} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={styles.drawerTop}>
              <div style={styles.drawerTitle}>{selected.list === "owned" ? "Owned token" : "Missing token"}</div>
              <button style={styles.closeBtn} onClick={() => setSelected(null)}>
                Close
              </button>
            </div>

            <DrawerImage src={selected.image} alt={selected.name} style={styles.bigImage} />

            <div style={styles.drawerSection}>
              <div style={styles.kv}>
                <div style={styles.k}>Name</div>
                <div style={styles.vText}>{selected.name}</div>

                <div style={styles.k}>Token ID</div>
                <div style={styles.vMono}>{selected.tokenId}</div>

                <div style={styles.k}>Collection</div>
                <div style={styles.vMono}>{collectionId}</div>

                {selected.uri ? (
                  <>
                    <div style={styles.k}>Metadata URI</div>
                    <div style={styles.vMono}>{selected.uri}</div>
                  </>
                ) : null}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <button style={styles.buttonSmall} onClick={() => copyText(selected.tokenId)}>
                  Copy token ID
                </button>
                {selected.image && (
                  <button style={styles.buttonSmall} onClick={() => copyText(selected.image!)}>
                    Copy image URL
                  </button>
                )}
                {selected.uri && (
                  <button style={styles.buttonSmall} onClick={() => copyText(selected.uri!)}>
                    Copy metadata URI
                  </button>
                )}
              </div>

              <div style={{ marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                Tip: Press <b>Esc</b> or click outside to close.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TokenRow({
  tokenId,
  meta,
  styles,
  onClick,
}: {
  tokenId: string;
  meta?: { tokenId: string; name: string | null; image: string | null; uri?: string | null };
  styles: Record<string, React.CSSProperties>;
  onClick: () => void;
}) {
  const name = meta?.name?.trim() ? meta.name : `Token #${tokenId}`;
  const img = meta?.image?.trim() ? meta.image : null;

  const [hover, setHover] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  return (
    <div
      style={{ ...styles.tokenRow, ...(hover ? styles.tokenRowHover : {}) }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      {img && !imgBroken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img}
          alt={name}
          style={styles.thumb}
          loading="lazy"
          decoding="async"
          onError={() => setImgBroken(true)}
        />
      ) : (
        <div style={styles.placeholder} />
      )}

      <div style={{ minWidth: 0 }}>
        <div style={styles.tokenName}>{name}</div>
        <div style={styles.tokenSub}>#{tokenId}</div>
      </div>
    </div>
  );
}

function DrawerImage({
  src,
  alt,
  style,
}: {
  src: string | null;
  alt: string;
  style: React.CSSProperties;
}) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return <div style={{ ...style, display: "grid", placeItems: "center" }}>No image</div>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={style}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}

export default function ProgressPage() {
  return (
    <Suspense
      fallback={
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
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <SiteHeader />
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 12,
                padding: 16,
                background: "rgba(0,0,0,0.55)",
                marginTop: 16,
                color: "rgba(255,255,255,0.72)",
              }}
            >
              Loading progress page...
            </div>
          </div>
        </div>
      }
    >
      <ProgressPageInner />
    </Suspense>
  );
}
