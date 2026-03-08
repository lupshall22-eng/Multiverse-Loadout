"use client";

import React from "react";
import SiteHeader from "@/components/SiteHeader";

type Project = {
  name: string;
  href?: string;
  description: string;
  accent?: string;
  badge?: string;
};

type Section = {
  title: string;
  subtitle: string;
  projects: Project[];
};

const sections: Section[] = [
  {
    title: "🌐 Enjin",
    subtitle: "Core ecosystem tools, platforms, and resources.",
    projects: [
      {
        name: "Enjin",
        href: "https://enjin.io",
        description:
          "Find information about the Enjin blockchain ecosystem and the tools it offers for creating digital assets. Learn how developers can build blockchain-based items, tokens, and NFTs for games and apps. It also includes details about ENJ, the Enjin Platform, and developer resources. Overall, it showcases how Enjin enables true ownership of digital items.",
        badge: "Core",
      },
      {
        name: "NFT.io",
        href: "https://nft.io",
        description:
          "Explore the marketplace for buying, selling, and discovering blockchain-based digital collectibles. Users can browse NFT collections, view items, and trade assets built on the Enjin ecosystem. It also provides tools for creators and projects to launch and manage their own NFT collections. Overall, NFT.io focuses on making NFT trading simple and accessible.",
        badge: "Marketplace",
      },
      {
        name: "Jinex",
        href: "https://jinex.io",
        description:
          "Jinex V1.0.0 focuses on a rock-solid core: sENJ Pool Swap, ENJ staking on Jinex pools, ENJ → JIN infusion, and JIN melt — with achievements and account upgrade NFTs plus JIN utility that can push fees down by up to 90% on swaps.",
        badge: "Utility",
      },
    ],
  },
  {
    title: "📱 Wallet",
    subtitle: "Download the Enjin Wallet on your preferred platform.",
    projects: [
      {
        name: "Enjin Wallet — Google Play",
        href: "https://play.google.com/store/apps/details?id=com.enjin.mobile.wallet",
        description: "Download the Enjin Wallet for Android from Google Play.",
        badge: "Android",
      },
      {
        name: "Enjin Wallet — App Store",
        href: "https://apps.apple.com/app/enjin-crypto-nft-wallet/id1349078375",
        description: "Download the Enjin Wallet for iPhone and iPad from the App Store.",
        badge: "Apple",
      },
    ],
  },
  {
    title: "🎉 Events",
    subtitle: "Community events and ecosystem experiences.",
    projects: [
      {
        name: "Multiverse Quest",
        href: "https://multiverse.nft.io/",
        description:
          "The Enjin Multiverse Quest is a community event where players explore multiple games connected through the Enjin ecosystem. By completing quests or challenges in participating games, players can earn blockchain-based items and collectibles. These items can be used across different games within the Enjin Multiverse. The event showcases how blockchain allows digital assets to move between games and truly belong to players.",
        badge: "Event",
      },
      {
        name: "MVB Forge",
        description: "To be added when more information is available.",
        badge: "Coming Soon",
      },
    ],
  },
  {
    title: "🎮 Enjin Games",
    subtitle: "Active and playable projects built around the Enjin ecosystem.",
    projects: [
      {
        name: "The Six Dragons",
        href: "https://thesixdragons.com",
        description:
          "The Six Dragons is an open-world fantasy RPG that integrates blockchain technology with traditional gameplay. Players can explore a large world, gather resources, and craft weapons and equipment. Crafted items can be turned into NFTs, allowing players to truly own, trade, or sell them. The game demonstrates how blockchain can give players real ownership of in-game items.",
        badge: "RPG",
      },
      {
        name: "Lost Relics",
        href: "https://lostrelics.io",
        description:
          "Lost Relics is an action-adventure RPG where players explore dungeons, defeat monsters, and collect valuable loot. Some rare items found in the game are minted as NFTs, giving players true ownership of their gear. Lost Relics demonstrates how blockchain can integrate with traditional RPG gameplay while keeping items scarce and collectible.",
        badge: "Action RPG",
      },
      {
        name: "Etherscape",
        href: "https://etherscape.io",
        description:
          "Etherscape is a multiplayer online rogue-lite action RPG with a crypto backend that allows users to own and trade their items. It gives players the control to mint NFTs based on the randomized loot that they find while playing. This enables a player-driven economy in which players control the creation of NFTs directly.",
        badge: "Rogue-lite",
      },
      {
        name: "N2M",
        href: "https://www.play2earn.club/",
        description:
          "Travel through Aurora's Rift and strategically use your abilities to prolong your survival. Collect pickups to boost your abilities and help you along the way.",
        badge: "Arcade",
      },
      {
        name: "BeamGo",
        href: "https://beamgo.site/",
        description:
          "BeamGo is a blockchain-based Bingo variant built around Enjin Beams and NFT-style gameplay. Mark off numbers as they are drawn and aim to complete the winning pattern first.",
        badge: "Casual",
      },
      {
        name: "EnjExcavators",
        href: "https://kepithor.com/game/enj-excavators",
        description:
          "Enj Excavators is a casual mining and progression game where players dig deep to uncover valuable resources and rewards. Upgrade equipment, improve efficiency, and unlock new excavation capabilities over time. It is easy to pick up while still offering satisfying long-term progression.",
        badge: "Mining",
      },
      {
        name: "Enjin Forge",
        href: "https://enjinforge.com/",
        description:
          "Enjin Forge is a browser-based idle RPG where players progress through stages by battling enemies and collecting resources. As players defeat monsters, they gather materials like ores, wood, and stone for crafting and upgrades. The game focuses on character progression, resource management, and incremental growth.",
        badge: "Idle RPG",
      },
      {
        name: "StropeVerse",
        href: "https://stropeverse.io/",
        description:
          "soonTM.",
        badge: "TBA",
      },
    ],
  },
];

function ProjectCard({ project }: { project: Project }) {
  const cardStyle: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
    boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
    transition: "transform 0.18s ease, border-color 0.18s ease, background 0.18s ease",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    textDecoration: "none",
    color: "inherit",
  };

  const inner = (
    <>
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 20,
              lineHeight: 1.2,
              color: "#fff",
            }}
          >
            {project.name}
          </h3>

          {project.badge ? (
            <span
              style={{
                whiteSpace: "nowrap",
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(120,102,213,0.16)",
                color: "rgba(255,255,255,0.9)",
              }}
            >
              {project.badge}
            </span>
          ) : null}
        </div>

        <p
          style={{
            margin: 0,
            color: "rgba(255,255,255,0.74)",
            lineHeight: 1.55,
            fontSize: 14,
          }}
        >
          {project.description}
        </p>
      </div>

      <div
        style={{
          marginTop: 16,
          fontSize: 13,
          color: project.href ? "#c7bbff" : "rgba(255,255,255,0.45)",
          fontWeight: 700,
        }}
      >
        {project.href ? "Open Project →" : "More info coming soon"}
      </div>
    </>
  );

  if (!project.href) {
    return <div style={cardStyle}>{inner}</div>;
  }

  return (
    <a
      href={project.href}
      target="_blank"
      rel="noreferrer"
      style={cardStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = "rgba(120,102,213,0.45)";
        e.currentTarget.style.background =
          "linear-gradient(180deg, rgba(120,102,213,0.12), rgba(255,255,255,0.03))";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
        e.currentTarget.style.background =
          "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))";
      }}
    >
      {inner}
    </a>
  );
}

export default function EnjinPage() {
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
          }}
        >
          <div style={{ maxWidth: 820 }}>
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
              Enjin Ecosystem Directory
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 42,
                lineHeight: 1.05,
                color: "#fff",
              }}
            >
              Explore the Enjin ecosystem
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
              A curated hub for Enjin tools, games, events, and community projects.
              Everything here is grouped to make it easy for people to discover what
              exists, where to go, and what each project is about.
            </p>
          </div>
        </div>

        {sections.map((section) => (
          <section key={section.title} style={{ marginBottom: 30 }}>
            <div style={{ marginBottom: 14 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 28,
                  color: "#fff",
                }}
              >
                {section.title}
              </h2>
              <p
                style={{
                  margin: "8px 0 0 0",
                  color: "rgba(255,255,255,0.66)",
                  fontSize: 14,
                }}
              >
                {section.subtitle}
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 16,
              }}
            >
              {section.projects.map((project) => (
                <ProjectCard key={project.name} project={project} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}