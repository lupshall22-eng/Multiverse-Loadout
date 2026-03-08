// backend/scripts/events_track_new_collections.mjs
// Run from backend/:  node scripts/events_track_new_collections.mjs
// Install deps in backend/: npm install node-fetch dotenv

import fs from "node:fs";
import path from "node:path";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const ENDPOINT = (process.env.ENJIN_GRAPHQL || "https://platform.enjin.io/graphql").trim();
const MKT_ENDPOINT = "https://platform.enjin.io/graphql/marketplace";
const AUTH_RAW = (process.env.ENJIN_API_KEY || "").trim();

if (!AUTH_RAW) {
  console.error("Missing ENJIN_API_KEY in .env");
  process.exit(1);
}

// -------------------- GraphQL helper --------------------
async function gql(endpoint, query, variables) {
  const body = JSON.stringify({ query, variables: variables || {} });

  async function doFetch(authValue) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authValue },
      body,
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  }

  // try raw token first
  let { res, json } = await doFetch(AUTH_RAW);

  // fallback to Bearer if 401 and not already Bearer
  if (res.status === 401 && !AUTH_RAW.toLowerCase().startsWith("bearer ")) {
    ({ res, json } = await doFetch(`Bearer ${AUTH_RAW}`));
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${JSON.stringify(json)}`);
  }
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// -------------------- Queries / Mutations --------------------
const GET_PENDING = `
query GetNewCollections($after: String, $first: Int!) {
  GetPendingEvents(
    names: ["COLLECTION_CREATED"]
    after: $after
    first: $first
    acknowledgeEvents: false
  ) {
    pageInfo { hasNextPage endCursor }
    edges { node { uuid data } }
  }
}
`;

const TRACK = `
mutation AddCollectionsToTracked($chainIds: [BigInt!]!) {
  AddToTracked(type: COLLECTION, chainIds: $chainIds, hotSync: true)
}
`;

const ACK = `
mutation AckEvents($uuids: [String!]!) {
  AcknowledgeEvents(uuids: $uuids)
}
`;

const GET_COLLECTION_ATTRS = `
query GetCollectionMeta($cid: BigInt!) {
  GetCollection(collectionId: $cid) {
    attributes { key value }
  }
}
`;

const GET_LISTINGS = `
query GetListings($after: String, $first: Int!) {
  GetListings(after: $after, first: $first) {
    edges {
      node {
        makeAssetId { collectionId tokenId }
        takeAssetId { collectionId tokenId }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`;

// -------------------- Metadata resolving --------------------
function attr(attrs, key) {
  const k = key.toLowerCase();
  for (const a of attrs || []) {
    if ((a.key || "").toLowerCase() === k) return a.value;
  }
  return null;
}

async function fetchJson(uri) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(uri, {
        headers: { Accept: "application/json", "User-Agent": "ECT/1.0" },
      });
      if ([429, 500, 502, 503, 504].includes(res.status)) {
        await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  return null;
}

async function resolveCollectionName(collectionId) {
  try {
    const data = await gql(ENDPOINT, GET_COLLECTION_ATTRS, { cid: Number(collectionId) });
    const attrs = data?.GetCollection?.attributes || [];

    const nm = attr(attrs, "name");
    if (typeof nm === "string" && nm.trim()) return nm.trim();

    const uri = attr(attrs, "uri");
    if (typeof uri === "string" && uri.trim()) {
      const meta = await fetchJson(uri.trim());
      if (meta && typeof meta.name === "string" && meta.name.trim()) return meta.name.trim();

      // occasionally name is inside attributes array
      const attrs2 = meta?.attributes;
      if (Array.isArray(attrs2)) {
        for (const it of attrs2) {
          const k = it?.key || it?.trait_type;
          const v = it?.value;
          if ((k === "name" || k === "Name") && typeof v === "string" && v.trim()) return v.trim();
        }
      }
    }
  } catch {
    // ignore
  }
  return `Collection ${collectionId}`;
}

// -------------------- JSON index helpers --------------------
// This resolves to backend/app/data/collections_index.json when you run from backend/
const INDEX_PATH = path.resolve(process.cwd(), "app", "data", "collections_index.json");

function loadIndex() {
  try {
    if (!fs.existsSync(INDEX_PATH)) return [];
    return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) || [];
  } catch {
    return [];
  }
}

function saveIndex(items) {
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(items, null, 2), "utf8");
}

function upsertIndex(existing, entries) {
  const map = new Map();

  for (const it of existing) {
    const id = String(it.id || it.collectionId || "").trim();
    const name = String(it.name || "").trim();
    if (id && name) map.set(id, { id, name });
  }

  for (const it of entries) {
    const id = String(it.id || "").trim();
    const name = String(it.name || "").trim();
    if (!id) continue;

    if (!map.has(id)) {
      map.set(id, { id, name: name || `Collection ${id}` });
    }
  }

  const out = Array.from(map.values()).sort((a, b) => {
    const ai = Number(a.id);
    const bi = Number(b.id);
    if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
    return a.id.localeCompare(b.id);
  });

  return out;
}

// -------------------- Cursor persistence --------------------
// Persist cursor so restarts don't re-scan old events
const CURSOR_PATH = path.resolve(process.cwd(), "scripts", "_cursor.json");

function loadCursor() {
  try {
    if (!fs.existsSync(CURSOR_PATH)) return null;
    const obj = JSON.parse(fs.readFileSync(CURSOR_PATH, "utf8"));
    const c = obj?.cursor;
    return typeof c === "string" && c.trim() ? c.trim() : null;
  } catch {
    return null;
  }
}

function saveCursor(cursorValue) {
  try {
    fs.mkdirSync(path.dirname(CURSOR_PATH), { recursive: true });
    fs.writeFileSync(CURSOR_PATH, JSON.stringify({ cursor: cursorValue }, null, 2), "utf8");
  } catch {
    // ignore
  }
}

// -------------------- Enjin actions --------------------
async function trackCollections(chainIds) {
  if (!chainIds.length) return;
  await gql(ENDPOINT, TRACK, { chainIds: chainIds.map((x) => Number(x)) });
}

async function acknowledgeEvents(uuids) {
  if (!uuids.length) return;
  await gql(ENDPOINT, ACK, { uuids });
}

// -------------------- Backfill test (marketplace scan) --------------------
async function backfillFromMarketplaceOnce({ pages = 3, first = 200 } = {}) {
  console.log(`🧪 Backfill test: scanning marketplace listings (${pages} page(s))…`);

  const ids = new Set();
  let after = null;

  for (let p = 0; p < pages; p++) {
    const data = await gql(MKT_ENDPOINT, GET_LISTINGS, { after, first });
    const page = data?.GetListings;
    const edges = page?.edges || [];

    for (const edge of edges) {
      const node = edge?.node || {};
      const mk = node.makeAssetId || {};
      const tk = node.takeAssetId || {};
      for (const side of [mk, tk]) {
        const cid = side.collectionId;
        if (cid && cid !== "0") ids.add(String(cid));
      }
    }

    if (!page?.pageInfo?.hasNextPage) break;
    after = page.pageInfo.endCursor;

    await new Promise((r) => setTimeout(r, 150));
  }

  const found = Array.from(ids);
  console.log(`🧪 Backfill test: found ${found.length} unique collection IDs from listings.`);

  const existing = loadIndex();
  const known = new Set(existing.map((x) => String(x.id || x.collectionId)));
  const toAdd = found.filter((id) => !known.has(id));

  console.log(`🧪 Backfill test: ${toAdd.length} are new vs your JSON index.`);

  if (!toAdd.length) {
    console.log("🧪 Backfill test: nothing new to write. ✅");
    return;
  }

  // Resolve names (cap to avoid a huge burst)
  const CAP = 40;
  const slice = toAdd.slice(0, CAP);

  const entries = [];
  for (const id of slice) {
    const name = await resolveCollectionName(id);
    entries.push({ id, name });
  }

  const merged = upsertIndex(existing, entries);
  saveIndex(merged);

  console.log(`✅ Backfill test wrote +${entries.length} into collections_index.json`);
  console.log(`📄 Total index entries now: ${merged.length}`);
}

async function dailyMarketplaceRefresh() {
  console.log("🌍 Daily marketplace refresh starting…");

  const ids = new Set();
  let after = null;
  const MAX_PAGES = 25; // ~5000 listings scanned safely

  for (let p = 0; p < MAX_PAGES; p++) {
    const data = await gql(MKT_ENDPOINT, GET_LISTINGS, { after, first: 200 });
    const page = data?.GetListings;
    const edges = page?.edges || [];

    for (const edge of edges) {
      const node = edge?.node || {};
      const mk = node.makeAssetId || {};
      const tk = node.takeAssetId || {};

      for (const side of [mk, tk]) {
        const cid = side.collectionId;
        if (cid && cid !== "0") ids.add(String(cid));
      }
    }

    if (!page?.pageInfo?.hasNextPage) break;
    after = page.pageInfo.endCursor;

    await new Promise((r) => setTimeout(r, 150));
  }

  const found = Array.from(ids);
  console.log(`🌍 Marketplace refresh discovered ${found.length} collections.`);

  const existing = loadIndex();
  const known = new Set(existing.map((x) => String(x.id || x.collectionId)));

  const toAdd = found.filter((id) => !known.has(id));

  console.log(`🌍 ${toAdd.length} new collections found.`);

  if (!toAdd.length) {
    console.log("🌍 Nothing new to add today.");
    return;
  }

  const entries = [];

  for (const id of toAdd) {
    const name = await resolveCollectionName(id);

    if (name && !name.toLowerCase().startsWith("collection ")) {
      entries.push({ id, name });
    }
  }

  const merged = upsertIndex(existing, entries);
  saveIndex(merged);

  console.log(`🌍 Added ${entries.length} new collections to index.`);
  console.log(`🌍 Index size is now ${merged.length}`);
}

// -------------------- Event loop --------------------
let cursor = loadCursor();
console.log(`Cursor loaded: ${cursor ? cursor : "(none)"}`);

let running = false;

async function syncOnce() {
  if (running) return;
  running = true;

  try {
    const data = await gql(ENDPOINT, GET_PENDING, { after: cursor, first: 50 });

    const pending = data?.GetPendingEvents || {};
    const edges = pending.edges || [];
    const pageInfo = pending.pageInfo || {};

    console.log(`Events fetched: ${edges.length}`);

    // Always advance cursor if possible, and persist it
    const nextCursor = pageInfo.endCursor || cursor;
    if (nextCursor && nextCursor !== cursor) {
      cursor = nextCursor;
      saveCursor(cursor);
    }

    if (!edges.length) return;

    const uuids = [];
    const chainIds = [];

    for (const edge of edges) {
      const node = edge?.node;
      if (!node) continue;

      uuids.push(node.uuid);

      let parsed = null;
      try {
        parsed = JSON.parse(node.data);
      } catch {
        parsed = null;
      }

      const cid = parsed?.collectionId;
      if (cid) chainIds.push(String(cid));
    }

    const uniqueIds = Array.from(new Set(chainIds));

    if (uniqueIds.length) {
      await trackCollections(uniqueIds);
      console.log(`✅ AddToTracked: ${uniqueIds.length} collection(s)`);
    }

    // Update local JSON index with names
    const existing = loadIndex();
    const known = new Set(existing.map((x) => String(x.id || x.collectionId)));
    const toAdd = uniqueIds.filter((id) => !known.has(id));

    if (toAdd.length) {
      const entries = [];
      for (const id of toAdd) {
        const name = await resolveCollectionName(id);
        entries.push({ id, name });
      }
      const merged = upsertIndex(existing, entries);
      saveIndex(merged);
      console.log(`🧾 Updated collections_index.json (+${entries.length})`);
    }

    if (uuids.length) {
      await acknowledgeEvents(uuids);
      console.log(`🧾 Acknowledged events: ${uuids.length}`);
    }
  } catch (e) {
    console.error("syncOnce error:", e?.message || e);
  } finally {
    running = false;
  }
}

// -------------------- Start --------------------
console.log("Starting collection-created event sync…");

// 🧪 One-time backfill test so you can SEE it working immediately
backfillFromMarketplaceOnce({ pages: 3, first: 200 }).catch((e) =>
  console.error("backfillFromMarketplaceOnce error:", e?.message || e)
);

// Run event sync hourly
setInterval(syncOnce, 3_600_000);

// Run marketplace refresh daily
setInterval(dailyMarketplaceRefresh, 86_400_000);

// Run once immediately
syncOnce();