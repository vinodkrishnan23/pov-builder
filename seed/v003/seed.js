'use strict';

const { MongoClient, ObjectId } = require('mongodb');

const mongodbUri = process.env.MONGODB_URI;
const databaseName = process.env.DB_NAME || '1790241012873';
const maximumText = process.env.SEED_MAX_DOCS;
const capsText = process.env.SEED_COLLECTION_CAPS;
const skipSearchIndexes = process.env.SEED_SKIP_SEARCH_INDEXES === '1';

function integer(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(label + ' must be a non-negative integer');
  return parsed;
}

function parseCaps(text) {
  if (text === undefined || text === '') return {};
  const parsed = JSON.parse(text);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('SEED_COLLECTION_CAPS must be a JSON object');
  }
  const result = {};
  for (const [name, value] of Object.entries(parsed)) result[name] = integer(value, 'cap for ' + name);
  return result;
}

const maximum = maximumText === undefined || maximumText === '' ? 20 : integer(maximumText, 'SEED_MAX_DOCS');
const caps = parseCaps(capsText);
function collectionCount(name) {
  const cap = Object.prototype.hasOwnProperty.call(caps, name) ? caps[name] : maximum;
  return Math.min(20, maximum, cap);
}

function id(group, ordinal) {
  return new ObjectId(group.toString(16).padStart(8, '0') + ordinal.toString(16).padStart(16, '0'));
}
function instant(day, minute = 0) {
  return new Date(Date.UTC(2024, 0, 1 + day, 12, minute, 0));
}
function embedding(ordinal) {
  const values = [];
  for (let dimension = 0; dimension < 8; dimension += 1) {
    values.push(((((ordinal + 1) * (dimension + 3)) % 17) - 8) / 8);
  }
  return values;
}

async function ordinaryIndexes(db) {
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
    { key: { 'triage_suggestion.suggested_team_id': 1 }, name: 'triage_suggestion_suggested_team_id_1' },
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

async function vectorIndex(db) {
  await db.collection('tickets').createSearchIndex({
    name: 'ticket_embedding_vector',
    type: 'vectorSearch',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: 8, similarity: 'cosine' },
        { type: 'filter', path: 'status' }
      ]
    }
  });
}

async function seed() {
  if (!mongodbUri) throw new Error('MONGODB_URI is required');
  const client = new MongoClient(mongodbUri);
  try {
    await client.connect();
    const db = client.db(databaseName);
    const names = ['dashboard_metric_snapshots', 'tickets', 'support_teams'];
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name));
    for (const name of names) if (existing.has(name)) await db.collection(name).drop();
    for (const name of ['support_teams', 'tickets', 'dashboard_metric_snapshots']) await db.createCollection(name);

    const teamCount = collectionCount('support_teams');
    const ticketCount = collectionCount('tickets');
    const metricCount = collectionCount('dashboard_metric_snapshots');
    const teams = [];
    for (let index = 0; index < teamCount; index += 1) {
      teams.push({
        _id: id(1, index + 1),
        team_code: 'TEAM-' + String(index + 1).padStart(3, '0'),
        name: ['Billing', 'Platform', 'Security', 'Integrations'][index % 4] + ' Team ' + (index + 1),
        description: 'Deterministic support team ' + (index + 1),
        active: index % 5 !== 4,
        created_at: instant(-120 + index)
      });
    }
    if (teams.length) await db.collection('support_teams').insertMany(teams, { ordered: true });

    const products = ['Atlas', 'Compass', 'Drivers', 'Charts'];
    const priorities = ['low', 'medium', 'high', 'urgent'];
    const tickets = [];
    for (let index = 0; index < ticketCount; index += 1) {
      const resolved = index % 3 !== 1;
      const teamId = teamCount ? id(1, (index % teamCount) + 1) : undefined;
      const suggestion = {
        suggested_priority: priorities[(index + 1) % priorities.length],
        confidence: 0.70 + ((index % 6) * 0.04),
        generated_at: instant(index - 19, 5),
        model_version: 'pov-static-v1'
      };
      if (teamId) suggestion.suggested_team_id = teamId;
      const similar = [];
      for (let offset = 1; offset <= Math.min(4, ticketCount - 1); offset += 1) {
        const candidate = (index + offset) % ticketCount;
        if (candidate % 3 !== 1) similar.push({ ticket_id: id(2, candidate + 1), score: 0.95 - (offset * 0.08) });
      }
      const ticket = {
        _id: id(2, index + 1),
        ticket_number: 'TKT-' + String(index + 1).padStart(5, '0'),
        source_channel: ['email', 'chat', 'phone'][index % 3],
        subject: 'Deterministic ' + products[index % 4] + ' support request ' + (index + 1),
        description: 'Customer reports reproducible issue ' + (index + 1) + ' for ' + products[index % 4] + '.',
        account_tier: ['standard', 'premium', 'enterprise'][index % 3],
        product_line: products[index % 4],
        status: resolved ? 'resolved' : 'in_progress',
        created_at: instant(index - 19),
        manual_priority: priorities[index % 4],
        triage_suggestion: suggestion,
        similar_ticket_cache: similar,
        embedding: embedding(index),
        ingested_at: instant(index - 19, 10)
      };
      if (teamId) ticket.assigned_team_id = teamId;
      if (resolved) {
        ticket.resolved_at = instant(index - 18);
        ticket.resolution_time_minutes = 60 + (index * 17);
        ticket.resolution_category = ['configuration', 'performance', 'access'][index % 3];
        ticket.resolution_summary = 'Resolved with deterministic remediation step ' + (index + 1) + '.';
      }
      tickets.push(ticket);
    }
    if (tickets.length) await db.collection('tickets').insertMany(tickets, { ordered: true });

    const metrics = [];
    for (let index = 0; index < metricCount; index += 1) {
      const volume = index % 2 === 0;
      const metric = {
        _id: id(3, index + 1),
        metric_type: volume ? 'ticket_volume' : 'avg_resolution_time',
        time_granularity: ['hour', 'day', 'week'][index % 3],
        bucket_start: instant(index - 19),
        value: volume ? 5 + index : 75.5 + (index * 11),
        ticket_count: 2 + (index % 7),
        refreshed_at: instant(index - 19, 30)
      };
      if (volume) {
        metric.product_line = products[index % 4];
        metric.priority = priorities[index % 4];
        metric.team_id = null;
      } else {
        metric.product_line = null;
        metric.priority = null;
        metric.team_id = teamCount ? id(1, (index % teamCount) + 1) : null;
      }
      metrics.push(metric);
    }
    if (metrics.length) await db.collection('dashboard_metric_snapshots').insertMany(metrics, { ordered: true });

    await ordinaryIndexes(db);
    if (!skipSearchIndexes) await vectorIndex(db);
    console.log(JSON.stringify({ seed_summary: { support_teams: teamCount, tickets: ticketCount, dashboard_metric_snapshots: metricCount } }));
  } finally {
    await client.close();
  }
}

seed().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exitCode = 1;
});
