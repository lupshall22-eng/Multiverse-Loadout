"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000").replace(/\/$/, "");

const LS_WALLET_KEY = "ect.wallet";

type WalletCollectionItem = {
  collectionId: string;
  name: string;
  description?: string | null;
  image?: string | null;
  ownedCount: number;
  totalTokens: number;
  completionPct: number;
  isIndexed?: boolean;
};

type WalletCollectionsResponse = {
  address: string;
  count: number;
  items: WalletCollectionItem[];
};

type RequestAccountResponse = {
  qrCode: string;
  verificationId: string;
};

type VerifyAccountResponse = {
  verified: boolean;
  address: string | null;
  publicKey?: string | null;
};

export default function MyWalletPage() {
  const [walletInput, setWalletInput] = useState("");
  const [connectedWallet, setConnectedWallet] = useState("");
  const [items, setItems] = useState<WalletCollectionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_WALLET_KEY);
      if (saved && saved.trim()) {
        setWalletInput(saved.trim());
        setConnectedWallet(saved.trim());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!connectedWallet) return;
    void loadWalletCollections(connectedWallet);
  }, [connectedWallet]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  async function loadWalletCollections(address: string) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE}/wallet/${encodeURIComponent(address)}/collections`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(await res.text());

      const json = (await res.json()) as WalletCollectionsResponse;
      setItems(json.items || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load wallet collections.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function connectManual() {
    const w = walletInput.trim();
    if (!w) {
      setError("Please enter a wallet address.");
      return;
    }

    try {
      localStorage.setItem(LS_WALLET_KEY, w);
    } catch {
      // ignore
    }

    setConnectedWallet(w);
    setQrCode(null);
    setVerificationId(null);
    setVerifying(false);
  }

  async function startWalletVerification() {
    setError(null);
    setVerifying(true);
    setQrCode(null);
    setVerificationId(null);

    try {
      const res = await fetch(`${API_BASE}/wallet/request-account`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());

      const json = (await res.json()) as RequestAccountResponse;
      setQrCode(json.qrCode);
      setVerificationId(json.verificationId);

      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }

      pollRef.current = window.setInterval(async () => {
        try {
          const vr = await fetch(
            `${API_BASE}/wallet/verify/${encodeURIComponent(json.verificationId)}`,
            { cache: "no-store" }
          );
          if (!vr.ok) return;

          const vj = (await vr.json()) as VerifyAccountResponse;
          if (vj.verified && vj.address) {
            if (pollRef.current) {
              window.clearInterval(pollRef.current);
              pollRef.current = null;
            }

            try {
              localStorage.setItem(LS_WALLET_KEY, vj.address);
            } catch {
              // ignore
            }

            setWalletInput(vj.address);
            setConnectedWallet(vj.address);
            setQrCode(null);
            setVerificationId(null);
            setVerifying(false);
          }
        } catch {
          // ignore polling hiccups
        }
      }, 3000);
    } catch (e: any) {
      setError(e?.message || "Failed to start wallet verification.");
      setVerifying(false);
    }
  }

  function disconnectWallet() {
    try {
      localStorage.removeItem(LS_WALLET_KEY);
    } catch {
      // ignore
    }

    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    setConnectedWallet("");
    setWalletInput("");
    setItems([]);
    setError(null);
    setQrCode(null);
    setVerificationId(null);
    setVerifying(false);
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
    title: { margin: 0, fontSize: 28, fontWeight: 800 },
    muted: { color: "rgba(255,255,255,0.62)" },
    row: { marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },
    input: {
      width: "100%",
      padding: "12px 12px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(0,0,0,0.55)",
      color: "#eaeaea",
      outline: "none",
    },
    buttonAccent: {
      padding: "11px 14px",
      borderRadius: 10,
      border: "1px solid rgba(120,102,213,0.45)",
      background: "rgba(120,102,213,0.16)",
      color: "#fff",
      cursor: "pointer",
      fontSize: 14,
    },
    buttonDanger: {
      padding: "11px 14px",
      borderRadius: 10,
      border: "1px solid rgba(255,140,140,0.35)",
      background: "rgba(255,80,80,0.10)",
      color: "#fff",
      cursor: "pointer",
      fontSize: 14,
    },
    button: {
      padding: "11px 14px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.22)",
      background: "rgba(255,255,255,0.06)",
      color: "#fff",
      cursor: "pointer",
      fontSize: 14,
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12,
      marginTop: 12,
    },
    walletBox: {
      padding: 12,
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.03)",
      wordBreak: "break-all",
    },
    qrWrap: {
      padding: 12,
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.03)",
      minHeight: 120,
    },
    qrImage: {
      width: "100%",
      maxWidth: 260,
      height: "auto",
      borderRadius: 12,
      display: "block",
      background: "#fff",
      padding: 8,
    },
    list: {
      display: "grid",
      gap: 12,
      marginTop: 16,
    },
    item: {
      display: "flex",
      gap: 12,
      alignItems: "center",
      padding: 14,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.03)",
      textDecoration: "none",
      color: "#fff",
    },
    img: {
      width: 56,
      height: 56,
      borderRadius: 12,
      objectFit: "cover",
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(255,255,255,0.04)",
      flex: "0 0 56px",
    },
    noImg: {
      width: 56,
      height: 56,
      borderRadius: 12,
      display: "grid",
      placeItems: "center",
      border: "1px solid rgba(255,255,255,0.16)",
      color: "rgba(255,255,255,0.55)",
      background: "rgba(255,255,255,0.04)",
      fontSize: 12,
      flex: "0 0 56px",
    },
    itemMain: { minWidth: 0, flex: 1 },
    itemTitle: {
      fontSize: 15,
      fontWeight: 700,
      marginBottom: 4,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
    stats: {
      fontSize: 13,
      color: "rgba(255,255,255,0.68)",
    },
    pct: {
      fontSize: 20,
      fontWeight: 800,
      color: "#fff",
      whiteSpace: "nowrap",
    },
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
    code: {
      marginTop: 8,
      fontSize: 12,
      color: "rgba(255,255,255,0.55)",
      wordBreak: "break-all",
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <SiteHeader />

        <div style={styles.card}>
          <h1 style={styles.title}>My Wallet</h1>
          <div style={{ ...styles.muted, marginTop: 8 }}>
            Connect with Enjin Wallet by scanning a QR code, or paste your wallet address manually.
          </div>

          {!connectedWallet ? (
            <>
              <div style={styles.grid}>
                <div>
                  <div style={{ marginBottom: 6, fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
                    Enter wallet address
                  </div>
                  <input
                    style={styles.input}
                    value={walletInput}
                    onChange={(e) => setWalletInput(e.target.value)}
                    placeholder="Paste your Matrixchain wallet address"
                  />

                  <div style={styles.row}>
                    <button style={styles.buttonAccent} onClick={connectManual}>
                      Connect manually
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
                    Enjin Wallet QR connect
                  </div>

                  <div style={styles.qrWrap}>
                    {!qrCode ? (
                      <>
                        <div style={styles.muted}>
                          Start a wallet verification request, then scan the QR code with Enjin Wallet.
                        </div>
                        <div style={styles.row}>
                          <button
                            style={styles.button}
                            onClick={startWalletVerification}
                            disabled={verifying}
                          >
                            {verifying ? "Starting..." : "Show QR code"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrCode} alt="Enjin Wallet QR" style={styles.qrImage} />
                        <div style={{ marginTop: 10, ...styles.muted }}>
                          Scan this with Enjin Wallet and approve the request.
                        </div>
                        {verificationId && (
                          <div style={styles.code}>Verification ID: {verificationId}</div>
                        )}
                        <div style={styles.row}>
                          <button
                            style={styles.button}
                            onClick={startWalletVerification}
                            disabled={verifying}
                          >
                            New QR
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={styles.row}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ marginBottom: 6, fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
                    Connected wallet
                  </div>
                  <div style={styles.walletBox}>{connectedWallet}</div>
                </div>

                <button style={styles.buttonDanger} onClick={disconnectWallet}>
                  Disconnect
                </button>
              </div>
            </>
          )}

          {error && <div style={styles.error}>{error}</div>}
        </div>

        {connectedWallet && (
          <div style={styles.card}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Collections</div>
            <div style={{ ...styles.muted, marginTop: 6 }}>
              Sorted from highest completion to lowest.
            </div>

            {loading ? (
              <div style={{ marginTop: 16, ...styles.muted }}>
                Loading wallet collections...
              </div>
            ) : items.length === 0 ? (
              <div style={{ marginTop: 16, ...styles.muted }}>
                No collections found for this wallet yet.
              </div>
            ) : (
              <div style={styles.list}>
                {items.map((item) => (
                  <Link
                    key={item.collectionId}
                    href={`/progress?wallet=${encodeURIComponent(
                      connectedWallet
                    )}&collectionId=${encodeURIComponent(
                      item.collectionId
                    )}&collectionName=${encodeURIComponent(item.name)}`}
                    style={styles.item}
                  >
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" style={styles.img} loading="lazy" decoding="async" />
                    ) : (
                      <div style={styles.noImg}>No image</div>
                    )}

                    <div style={styles.itemMain}>
                      <div style={styles.itemTitle}>{item.name}</div>
                      <div style={styles.stats}>
                        Owned: {item.ownedCount}
                        {item.totalTokens > 0 ? ` / ${item.totalTokens}` : " items"}
                        {item.isIndexed ? "" : " • indexing collection"}
                      </div>
                    </div>

                    <div style={styles.pct}>{item.completionPct}%</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}