'use strict';

const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || '1790241012873';
const maxRaw = process.env.SEED_MAX_DOCS;
const capsRaw = process.env.SEED_COLLECTION_CAPS;
const skipSearchIndexes = process.env.SEED_SKIP_SEARCH_INDEXES === '1';

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(label + ' must be a non-negative integer');
  }
  return number;
}

function readCaps(raw) {
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('SEED_COLLECTION_CAPS must be a JSON object');
  }
  const caps = {};
  for (const [name, value] of Object.entries(parsed)) {
    caps[name] = nonNegativeInteger(value, 'cap for ' + name);
  }
  return caps;
}

const maximum = maxRaw === undefined || maxRaw === ''
  ? 20
  : nonNegativeInteger(maxRaw, 'SEED_MAX_DOCS');
const caps = readCaps(capsRaw);

function countFor(name) {
  const independentCap = Object.prototype.hasOwnProperty.call(caps, name) ? caps[name] : maximum;
  return Math.min(20, maximum, independentCap);
}

function objectId(group, index) {
  return new ObjectId(group.toString(16).padStart(8, '0') + index.toString(16).padStart(16, '0'));
}

function fixedDate(dayOffset, minuteOffset = 0) {
  return new Date(Date.UTC(2024, 0, 1 + dayOffset, 12, minuteOffset, 0));
}

function fixedVector(index) {
  const result = [];
  for (let dimension = 0; dimension < 8; dimension += 1) {
    result.push(((((index + 1) * (dimension + 3)) % 17) - 8) / 8);
  }
  return result;
}

async function createOrdinaryIndexes(db) {
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
    {
      key: {
        metric_type: 1,
        time_granularity: 1,
        bucket_start: 1,
        product_line: 1,
        priority: 1,
        team_id: 1
      },
      name: 'metric_merge_key',
      unique: true
    },
    { key: { metric_type: 1, bucket_start: 1 }, name: 'metric_type_1_bucket_start_1' },
    { key: { bucket_start: 1 }, name: 'bucket_start_1' },
    { key: { metric_type: 1 }, name: 'metric_type_1' },
    { key: { priority: 1 }, name: 'priority_1' },
    { key: { product_line: 1 }, name: 'product_line_1' },
    { key: { time_granularity: 1 }, name: 'time_granularity_1' },
    { key: { team_id: 1 }, name: 'team_id_1' }
  ]);
}

async function createVectorIndex(db) {
  await db.collection('tickets').createSearchIndex({
    name: 'ticket_embedding_vector',
    type: 'vectorSearch',
    definition: {
      fields: [
        {
          type: 'vector',
          path: 'embedding',
          numDimensions: 8,
          similarity: 'cosine'
        },
        {
          type: 'filter',
          path: 'status'
        }
      ]
    }
  });
}

async function main() {
  if (!uri) throw new Error('MONGODB_URI is required');

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const dropOrder = ['dashboard_metric_snapshots', 'tickets', 'support_teams'];
    const existing = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name)
    );

    for (const name of dropOrder) {
      if (existing.has(name)) await db.collection(name).drop();
    }
    for (const name of ['support_teams', 'tickets', 'dashboard_metric_snapshots']) {
      await db.createCollection(name);
    }

    const supportTeamCount = countFor('support_teams');
    const ticketCount = countFor('tickets');
    const snapshotCount = countFor('dashboard_metric_snapshots');

    const supportTeams = [];
    for (let index = 0; index < supportTeamCount; index += 1) {
      supportTeams.push({
        _id: objectId(1, index + 1),
        team_code: 'TEAM-' + String(index + 1).padStart(3, '0'),
        name: ['Billing', 'Platform', 'Security', 'Integrations'][index % 4] + ' Team ' + (index + 1),
        description: 'Deterministic support team ' + (index + 1),
        active: index % 5 !== 4,
        created_at: fixedDate(-120 + index)
      });
    }
    if (supportTeams.length > 0) {
      await db.collection('support_teams').insertMany(supportTeams, { ordered: true });
    }

    const products = ['Atlas', 'Compass', 'Drivers', 'Charts'];
    const priorities = ['low', 'medium', 'high', 'urgent'];
    const tickets = [];
    for (let index = 0; index < ticketCount; index += 1) {
      const isResolved = index % 3 !== 1;
      const assignedTeamId = supportTeamCount > 0
        ? objectId(1, (index % supportTeamCount) + 1)
        : null;
      const similarTicketCache = [];
      for (let offset = 1; offset <= Math.min(4, ticketCount - 1); offset += 1) {
        const candidate = (index + offset) % ticketCount;
        if (candidate % 3 !== 1) {
          similarTicketCache.push({
            ticket_id: objectId(2, candidate + 1),
            score: 0.95 - (offset * 0.08)
          });
        }
      }

      const ticket = {
        _id: objectId(2, index + 1),
        ticket_number: 'TKT-' + String(index + 1).padStart(5, '0'),
        source_channel: ['email', 'chat', 'phone'][index % 3],
        subject: 'Deterministic ' + products[index % products.length] + ' support request ' + (index + 1),
        description: 'Customer reports a reproducible issue with ' + products[index % products.length] + '; diagnostic sample ' + (index + 1) + '.',
        account_tier: ['standard', 'premium', 'enterprise'][index % 3],
        product_line: products[index % products.length],
        status: isResolved ? 'resolved' : 'in_progress',
        created_at: fixedDate(index - 19),
        manual_priority: priorities[index % priorities.length],
        triage_suggestion: {
          suggested_priority: priorities[(index + 1) % priorities.length],
          suggested_team_id: assignedTeamId,
          confidence: 0.7 + ((index % 6) * 0.04),
          generated_at: fixedDate(index - 19, 5),
          model_version: 'pov-static-v1'
        },
        similar_ticket_cache: similarTicketCache,
        embedding: fixedVector(index),
        ingested_at: fixedDate(index - 19, 10)
      };

      if (assignedTeamId !== null) ticket.assigned_team_id = assignedTeamId;
      if (isResolved) {
        ticket.resolved_at = fixedDate(index - 18);
        ticket.resolution_time_minutes = 60 + (index * 17);
        ticket.resolution_category = ['configuration', 'performance', 'access'][index % 3];
        ticket.resolution_summary = 'Resolved with deterministic remediation step ' + (index + 1) + '.';
      }
      tickets.push(ticket);
    }
    if (tickets.length > 0) {
      await db.collection('tickets').insertMany(tickets, { ordered: true });
    }

    const snapshots = [];
    for (let index = 0; index < snapshotCount; index += 1) {
      const isVolume = index % 2 === 0;
      snapshots.push({
        _id: objectId(3, index + 1),
        metric_type: isVolume ? 'ticket_volume' : 'avg_resolution_time',
        time_granularity: ['hour', 'day', 'week'][index % 3],
        bucket_start: fixedDate(index - 19),
        product_line: isVolume ? products[index % products.length] : null,
        priority: isVolume ? priorities[index % priorities.length] : null,
        team_id: !isVolume && supportTeamCount > 0
          ? objectId(1, (index % supportTeamCount) + 1)
          : null,
        value: isVolume ? 5 + index : 75.5 + (index * 11),
        ticket_count: 2 + (index % 7),
        refreshed_at: fixedDate(index - 19, 30)
      });
    }
    if (snapshots.length > 0) {
      await db.collection('dashboard_metric_snapshots').insertMany(snapshots, { ordered: true });
    }

    await createOrdinaryIndexes(db);
    if (!skipSearchIndexes) await createVectorIndex(db);

    console.log(JSON.stringify({
      seed_summary: {
        support_teams: supportTeamCount,
        tickets: ticketCount,
        dashboard_metric_snapshots: snapshotCount
      }
    }));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exitCode = 1;
});
