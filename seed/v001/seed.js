'use strict';

const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || '1790241012873';
const maxRaw = process.env.SEED_MAX_DOCS;
const capsRaw = process.env.SEED_COLLECTION_CAPS;
const skipSearchIndexes = process.env.SEED_SKIP_SEARCH_INDEXES === '1';

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(label + ' must be a non-negative integer');
  return number;
}

function readCaps(raw) {
  if (!raw) return {};
  const value = JSON.parse(raw);
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('SEED_COLLECTION_CAPS must be a JSON object');
  const result = {};
  for (const [name, cap] of Object.entries(value)) result[name] = nonNegativeInteger(cap, 'cap for ' + name);
  return result;
}

const globalMax = maxRaw === undefined || maxRaw === '' ? 20 : nonNegativeInteger(maxRaw, 'SEED_MAX_DOCS');
const collectionCaps = readCaps(capsRaw);
function countFor(name) {
  const cap = Object.prototype.hasOwnProperty.call(collectionCaps, name) ? collectionCaps[name] : globalMax;
  return Math.min(20, globalMax, cap);
}

function oid(group, index) {
  return new ObjectId(group.toString(16).padStart(8, '0') + index.toString(16).padStart(16, '0'));
}
function date(days, minutes) {
  return new Date(Date.UTC(2024, 0, 1 + days, 12, minutes || 0, 0));
}
function vector(index) {
  const values = [];
  for (let dimension = 0; dimension < 8; dimension += 1) values.push((((index + 1) * (dimension + 3)) % 17 - 8) / 8);
  return values;
}

async function createIndexes(db) {
  await db.collection('support_teams').createIndexes([
    { key: { team_code: 1 }, name: 'team_code_1' },
    { key: { active: 1, name: 1 }, name: 'active_1_name_1' }
  ]);
  await db.collection('tickets').createIndexes([
    { key: { ticket_number: 1 }, name: 'ticket_number_1' },
    { key: { status: 1, created_at: 1 }, name: 'status_1_created_at_1' },
    { key: { product_line: 1, created_at: 1 }, name: 'product_line_1_created_at_1' },
    { key: { manual_priority: 1, created_at: 1 }, name: 'manual_priority_1_created_at_1' },
    { key: { assigned_team_id: 1, resolved_at: 1 }, name: 'assigned_team_id_1_resolved_at_1' },
    { key: { resolution_category: 1 }, name: 'resolution_category_1' },
    { key: { status: 1, resolved_at: 1 }, name: 'status_1_resolved_at_1' },
    { key: { 'triage_suggestion.suggested_team_id': 1 }, name: 'triage_suggested_team_id_1' },
    { key: { created_at: 1 }, name: 'created_at_1' },
    { key: { assigned_team_id: 1 }, name: 'assigned_team_id_1' },
    { key: { resolution_time_minutes: 1 }, name: 'resolution_time_minutes_1' },
    { key: { resolved_at: 1 }, name: 'resolved_at_1' },
    { key: { status: 1 }, name: 'status_1' }
  ]);
  await db.collection('dashboard_metric_snapshots').createIndexes([
    { key: { metric_type: 1, time_granularity: 1, bucket_start: 1, product_line: 1, priority: 1, team_id: 1 }, name: 'metric_merge_key', unique: true },
    { key: { metric_type: 1, bucket_start: 1 }, name: 'metric_type_1_bucket_start_1' },
    { key: { bucket_start: 1 }, name: 'bucket_start_1' },
    { key: { metric_type: 1 }, name: 'metric_type_1' },
    { key: { priority: 1 }, name: 'priority_1' },
    { key: { product_line: 1 }, name: 'product_line_1' },
    { key: { time_granularity: 1 }, name: 'time_granularity_1' },
    { key: { team_id: 1 }, name: 'team_id_1' }
  ]);
}

async function main() {
  if (!uri) throw new Error('MONGODB_URI is required');
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const names = ['dashboard_metric_snapshots', 'tickets', 'support_teams'];
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
    for (const name of names) if (existing.has(name)) await db.collection(name).drop();
    for (const name of ['support_teams', 'tickets', 'dashboard_metric_snapshots']) await db.createCollection(name);

    const teamCount = countFor('support_teams');
    const ticketCount = countFor('tickets');
    const snapshotCount = countFor('dashboard_metric_snapshots');
    const teams = [];
    for (let i = 0; i < teamCount; i += 1) {
      teams.push({ _id: oid(1, i + 1), team_code: 'TEAM-' + String(i + 1).padStart(3, '0'), name: ['Billing', 'Platform', 'Security', 'Integrations'][i % 4] + ' Team ' + (i + 1), description: 'Deterministic support team ' + (i + 1), active: i % 5 !== 4, created_at: date(-120 + i) });
    }
    if (teams.length) await db.collection('support_teams').insertMany(teams, { ordered: true });

    const tickets = [];
    const products = ['Atlas', 'Compass', 'Drivers', 'Charts'];
    const priorities = ['low', 'medium', 'high', 'urgent'];
    for (let i = 0; i < ticketCount; i += 1) {
      const resolved = i % 3 !== 1;
      const teamId = teamCount ? oid(1, (i % teamCount) + 1) : null;
      const similar = [];
      for (let offset = 1; offset <= Math.min(4, ticketCount - 1); offset += 1) {
        const candidate = (i + offset) % ticketCount;
        if (candidate % 3 !== 1) similar.push({ ticket_id: oid(2, candidate + 1), score: 0.95 - offset * 0.08 });
      }
      const doc = {
        _id: oid(2, i + 1), ticket_number: 'TKT-' + String(i + 1).padStart(5, '0'), source_channel: ['email', 'chat', 'phone'][i % 3],
        subject: 'Deterministic ' + products[i % products.length] + ' support request ' + (i + 1),
        description: 'Customer reports a reproducible issue with ' + products[i % products.length] + '; diagnostic sample ' + (i + 1) + '.',
        account_tier: ['standard', 'premium', 'enterprise'][i % 3], product_line: products[i % products.length],
        status: resolved ? 'resolved' : 'in_progress', created_at: date(i - 19), manual_priority: priorities[i % priorities.length],
        resolution_category: resolved ? ['configuration', 'performance', 'access'][i % 3] : null,
        resolution_summary: resolved ? 'Resolved with deterministic remediation step ' + (i + 1) + '.' : null,
        triage_suggestion: { suggested_priority: priorities[(i + 1) % priorities.length], suggested_team_id: teamId, confidence: 0.7 + (i % 6) * 0.04, generated_at: date(i - 19, 5), model_version: 'pov-static-v1' },
        similar_ticket_cache: similar, embedding: vector(i), ingested_at: date(i - 19, 10)
      };
      if (teamId) doc.assigned_team_id = teamId;
      if (resolved) { doc.resolved_at = date(i - 18); doc.resolution_time_minutes = 60 + i * 17; }
      tickets.push(doc);
    }
    if (tickets.length) await db.collection('tickets').insertMany(tickets, { ordered: true });

    const snapshots = [];
    for (let i = 0; i < snapshotCount; i += 1) {
      const volume = i % 2 === 0;
      snapshots.push({
        _id: oid(3, i + 1), metric_type: volume ? 'ticket_volume' : 'avg_resolution_time', time_granularity: ['hour', 'day', 'week'][i % 3],
        bucket_start: date(i - 19, 0), product_line: volume ? products[i % products.length] : null,
        priority: volume ? priorities[i % priorities.length] : null, team_id: !volume && teamCount ? oid(1, (i % teamCount) + 1) : null,
        value: volume ? 5 + i : 75.5 + i * 11, ticket_count: 2 + (i % 7), refreshed_at: date(i - 19, 30)
      });
    }
    if (snapshots.length) await db.collection('dashboard_metric_snapshots').insertMany(snapshots, { ordered: true });
    await createIndexes(db);

    if (!skipSearchIndexes) {
      await db.collection('tickets').createSearchIndex({
        name: 'ticket_embedding_vector',
        definition: { mappings: { dynamic: false, fields: { embedding: { type: 'knnVector', dimensions: 8, similarity: 'cosine' }, status: { type: 'token' } } } }
      });
    }

    console.log(JSON.stringify({ seed_summary: { support_teams: teamCount, tickets: ticketCount, dashboard_metric_snapshots: snapshotCount } }));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exitCode = 1;
});
