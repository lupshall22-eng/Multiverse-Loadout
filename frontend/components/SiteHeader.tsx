"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/collections", label: "Collections" },
  { href: "/my-wallet", label: "My Wallet" },
  { href: "/enjin", label: "Enjin" },
  { href: "/underdevelopment", label: "Under Development" },
];

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 20,
        padding: 24,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
        boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
        marginBottom: 28,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ maxWidth: 760 }}>
          <div
            style={{
              display: "inline-block",
              padding: "6px 10px",
              borderRadius: 999,
              background: "rgba(120,102,213,0.16)",
              border: "1px solid rgba(120,102,213,0.3)",
              color: "#d8d0ff",
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            Enjin Ecosystem Hub
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 42,
              lineHeight: 1.05,
              color: "#fff",
            }}
          >
            Multiverse Loadout
          </h1>

          <p
            style={{
              marginTop: 14,
              marginBottom: 0,
              color: "rgba(255,255,255,0.78)",
              lineHeight: 1.65,
              fontSize: 16,
              maxWidth: 760,
            }}
          >
            Explore collections, track progress, and discover the Enjin ecosystem.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === item.href
                : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  textDecoration: "none",
                  color: "#fff",
                  border: active
                    ? "1px solid rgba(120,102,213,0.45)"
                    : "1px solid rgba(255,255,255,0.16)",
                  borderRadius: 12,
                  padding: "10px 14px",
                  background: active
                    ? "rgba(120,102,213,0.16)"
                    : "rgba(255,255,255,0.05)",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}