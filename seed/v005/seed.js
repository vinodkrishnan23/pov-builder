"use strict";

const { MongoClient, ObjectId, Int32 } = require("mongodb");

const mongodbUri = process.env.MONGODB_URI;
const databaseName = process.env.DB_NAME;
const seedMaxDocsRaw = process.env.SEED_MAX_DOCS;
const collectionCapsRaw = process.env.SEED_COLLECTION_CAPS;
const skipSearchIndexes = process.env.SEED_SKIP_SEARCH_INDEXES;

const COLLECTIONS = ["support_teams", "tickets", "dashboard_metric_snapshots"];
const BASE_COUNT = 20;
const BASE_DATE = Date.parse("2025-01-01T00:00:00.000Z");

function objectId(prefix, index) {
  return new ObjectId(prefix + index.toString(16).padStart(16, "0"));
}

function dateAt(hours) {
  return new Date(BASE_DATE + hours * 60 * 60 * 1000);
}

function parseNonNegativeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(label + " must be a non-negative integer");
  return parsed;
}

function requestedCounts() {
  const maximum = seedMaxDocsRaw === undefined || seedMaxDocsRaw === "" ? BASE_COUNT : parseNonNegativeInteger(seedMaxDocsRaw, "SEED_MAX_DOCS");
  let caps = {};
  if (collectionCapsRaw !== undefined && collectionCapsRaw !== "") {
    caps = JSON.parse(collectionCapsRaw);
    if (caps === null || Array.isArray(caps) || typeof caps !== "object") throw new Error("SEED_COLLECTION_CAPS must be a JSON object");
  }
  const counts = {};
  for (const name of COLLECTIONS) {
    let cap = maximum;
    if (Object.prototype.hasOwnProperty.call(caps, name)) cap = Math.min(maximum, parseNonNegativeInteger(caps[name], "cap for " + name));
    counts[name] = Math.min(BASE_COUNT, cap, maximum);
  }
  return counts;
}

function makeTeams(count) {
  const docs = [];
  for (let i = 0; i < count; i += 1) {
    docs.push({
      _id: objectId("10000000", i + 1),
      team_code: "TEAM-" + String(i + 1).padStart(3, "0"),
      name: ["Billing", "Platform", "Identity", "Integrations", "Data"][i % 5] + " Support " + (i + 1),
      description: "Deterministic support team " + (i + 1),
      active: i % 6 !== 5,
      created_at: dateAt(-720 + i)
    });
  }
  return docs;
}

function vectorFor(index) {
  const vector = [];
  for (let d = 0; d < 8; d += 1) vector.push(Number((((index + 1) * (d + 3) % 17) / 17).toFixed(6)));
  return vector;
}

function makeTickets(count, teams) {
  const ids = [];
  for (let i = 0; i < count; i += 1) ids.push(objectId("20000000", i + 1));
  const resolvedIds = ids.filter((unused, i) => i % 3 === 0);
  const products = ["Atlas", "Search", "Charts", "Drivers"];
  const priorities = ["low", "medium", "high", "urgent"];
  const categories = ["configuration", "authentication", "performance", "integration"];
  const docs = [];
  for (let i = 0; i < count; i += 1) {
    const isResolved = i % 3 === 0;
    const team = teams.length === 0 ? null : teams[i % teams.length];
    const similar = [];
    for (let j = 0; j < Math.min(4, resolvedIds.length); j += 1) {
      similar.push({ ticket_id: resolvedIds[(i + j) % resolvedIds.length], score: Number((0.98 - j * 0.07).toFixed(2)) });
    }
    const doc = {
      _id: ids[i],
      ticket_number: "TKT-" + String(10001 + i),
      source_channel: ["email", "chat", "phone"][i % 3],
      subject: "Representative support issue " + (i + 1),
      description: "Customer reports a deterministic " + categories[i % categories.length] + " issue in " + products[i % products.length] + ".",
      account_tier: ["standard", "premium", "enterprise"][i % 3],
      product_line: products[i % products.length],
      status: isResolved ? "resolved" : (i % 3 === 1 ? "open" : "in_progress"),
      created_at: dateAt(i * 6),
      assigned_team_id: team ? team._id : undefined,
      manual_priority: priorities[i % priorities.length],
      resolution_category: isResolved ? categories[i % categories.length] : undefined,
      resolution_summary: isResolved ? "Resolved through deterministic runbook step " + (i + 1) + "." : undefined,
      triage_suggestion: {
        suggested_priority: priorities[(i + 1) % priorities.length],
        suggested_team_id: team ? team._id : undefined,
        confidence: Number((0.72 + (i % 8) * 0.03).toFixed(2)),
        generated_at: dateAt(i * 6 + 1),
        model_version: "triage-static-1"
      },
      similar_ticket_cache: similar,
      embedding: vectorFor(i),
      ingested_at: dateAt(i * 6 + 2)
    };
    if (isResolved) {
      doc.resolved_at = dateAt(i * 6 + 3);
      doc.resolution_time_minutes = new Int32(90 + i * 17);
    }
    if (!team) {
      delete doc.assigned_team_id;
      delete doc.triage_suggestion.suggested_team_id;
    }
    docs.push(doc);
  }
  return docs;
}

function makeSnapshots(count, teams) {
  const docs = [];
  const products = ["Atlas", "Search", "Charts", "Drivers"];
  const priorities = ["low", "medium", "high", "urgent"];
  const granularities = ["hour", "day", "week"];
  for (let i = 0; i < count; i += 1) {
    const volume = i % 2 === 0;
    const team = teams.length === 0 ? null : teams[i % teams.length];
    docs.push({
      _id: objectId("30000000", i + 1),
      metric_type: volume ? "ticket_volume" : "avg_resolution_time",
      time_granularity: granularities[i % granularities.length],
      bucket_start: dateAt(i * 24),
      product_line: volume ? products[i % products.length] : null,
      priority: volume ? priorities[i % priorities.length] : null,
      team_id: volume || !team ? null : team._id,
      value: volume ? Number(12 + i) : Number((84.5 + i * 3.25).toFixed(2)),
      ticket_count: new Int32(3 + i),
      refreshed_at: dateAt(i * 24 + 1)
    });
  }
  return docs;
}

async function recreate(db) {
  const rows = await db.listCollections({}, { nameOnly: true }).toArray();
  const existing = new Set(rows.map(row => row.name));
  for (const name of COLLECTIONS) {
    if (existing.has(name)) await db.collection(name).drop();
    await db.createCollection(name);
  }
}

async function createIndexes(db) {
  await db.collection("support_teams").createIndexes([
    { key: { team_code: 1 }, name: "team_code_1" },
    { key: { active: 1, name: 1 }, name: "active_1_name_1" }
  ]);
  await db.collection("tickets").createIndexes([
    { key: { ticket_number: 1 }, name: "ticket_number_1" },
    { key: { status: 1, created_at: 1 }, name: "status_1_created_at_1" },
    { key: { product_line: 1, created_at: 1 }, name: "product_line_1_created_at_1" },
    { key: { manual_priority: 1, created_at: 1 }, name: "manual_priority_1_created_at_1" },
    { key: { assigned_team_id: 1, resolved_at: 1 }, name: "assigned_team_id_1_resolved_at_1" },
    { key: { resolution_category: 1 }, name: "resolution_category_1" },
    { key: { status: 1, resolved_at: 1 }, name: "status_1_resolved_at_1" },
    { key: { "triage_suggestion.suggested_team_id": 1 }, name: "triage_suggestion_team_1" },
    { key: { created_at: 1 }, name: "created_at_1" },
    { key: { assigned_team_id: 1 }, name: "assigned_team_id_1" },
    { key: { resolution_time_minutes: 1 }, name: "resolution_time_minutes_1" },
    { key: { resolved_at: 1 }, name: "resolved_at_1" },
    { key: { status: 1 }, name: "status_1" }
  ]);
  await db.collection("dashboard_metric_snapshots").createIndexes([
    { key: { metric_type: 1, time_granularity: 1, bucket_start: 1, product_line: 1, priority: 1, team_id: 1 }, name: "metric_type_1_time_granularity_1_bucket_start_1_product_line_1_priority_1_team_id_1" },
    { key: { time_granularity: 1, metric_type: 1, bucket_start: 1, product_line: 1, priority: 1, team_id: 1 }, name: "snapshot_merge_unique", unique: true },
    { key: { metric_type: 1, bucket_start: 1 }, name: "metric_type_1_bucket_start_1" },
    { key: { bucket_start: 1 }, name: "bucket_start_1" },
    { key: { metric_type: 1 }, name: "metric_type_1" },
    { key: { priority: 1 }, name: "priority_1" },
    { key: { product_line: 1 }, name: "product_line_1" },
    { key: { time_granularity: 1 }, name: "time_granularity_1" },
    { key: { team_id: 1 }, name: "team_id_1" }
  ]);
}

async function createSearchIndex(db) {
  if (skipSearchIndexes === "1") return;
  await db.collection("tickets").createSearchIndex({
    name: "ticket_embedding_vector",
    type: "vectorSearch",
    definition: { fields: [
      { type: "vector", path: "embedding", numDimensions: 8, similarity: "cosine" },
      { type: "filter", path: "status" }
    ] }
  });
}

async function main() {
  if (!mongodbUri) throw new Error("MONGODB_URI is required");
  const counts = requestedCounts();
  const client = new MongoClient(mongodbUri);
  try {
    await client.connect();
    const db = client.db(databaseName || "1790241012873");
    await recreate(db);
    const teams = makeTeams(counts.support_teams);
    const tickets = makeTickets(counts.tickets, teams);
    const snapshots = makeSnapshots(counts.dashboard_metric_snapshots, teams);
    if (teams.length) await db.collection("support_teams").insertMany(teams, { ordered: true });
    if (tickets.length) await db.collection("tickets").insertMany(tickets, { ordered: true });
    if (snapshots.length) await db.collection("dashboard_metric_snapshots").insertMany(snapshots, { ordered: true });
    await createIndexes(db);
    await createSearchIndex(db);
    console.log(JSON.stringify({ seed_summary: {
      support_teams: teams.length,
      tickets: tickets.length,
      dashboard_metric_snapshots: snapshots.length
    } }));
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
