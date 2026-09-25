'use strict';

const { MongoClient, ObjectId, Long } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME;
const SEED_MAX_DOCS = process.env.SEED_MAX_DOCS;
const SEED_COLLECTION_CAPS = process.env.SEED_COLLECTION_CAPS;

const collectionNames = [
  'customers',
  'policies',
  'execution_requests',
  'rule_execution_logs'
];

const declaredIndexes = {
  customers: [],
  policies: [],
  execution_requests: [],
  rule_execution_logs: []
};

function nonnegativeInteger(raw, fallback, label) {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function readCaps(raw) {
  if (raw === undefined || raw === '') return {};
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`SEED_COLLECTION_CAPS must be valid JSON: ${error.message}`);
  }
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('SEED_COLLECTION_CAPS must be a JSON object');
  }
  const caps = {};
  for (const name of collectionNames) {
    if (Object.prototype.hasOwnProperty.call(value, name)) {
      caps[name] = nonnegativeInteger(value[name], 20, `cap for ${name}`);
    }
  }
  return caps;
}

function oid(collectionNumber, index) {
  const prefix = collectionNumber.toString(16).padStart(2, '0');
  return new ObjectId(prefix + index.toString(16).padStart(22, '0'));
}

function dateAt(index, minuteOffset = 0) {
  return new Date(Date.UTC(2024, 0, 1, 0, index * 10 + minuteOffset, 0));
}

function customer(index) {
  const customerId = `customer-${String(index + 1).padStart(3, '0')}`;
  return {
    _id: oid(1, index + 1),
    customer_id: customerId,
    customer_name: `Deterministic Customer ${index + 1}`,
    deployment_mode: ['on_prem', 'aws', 'azure', 'gcp', 'other_customer_cloud'][index % 5],
    logging_enabled: index % 4 !== 0,
    retention_policy: {
      retention_days: 30 + (index % 4) * 30,
      purge_mode: ['ttl', 'scheduled_purge', 'manual'][index % 3],
      purge_after_field: index % 2 === 0 ? 'request_received_at' : 'completed_at'
    },
    authorized_log_viewer_roles: ['audit_admin', `viewer_tier_${index % 3}`],
    created_at: dateAt(index),
    updated_at: dateAt(index, 1)
  };
}

function policy(index) {
  return {
    _id: oid(2, index + 1),
    customer_id: `customer-${String((index % 20) + 1).padStart(3, '0')}`,
    policy_id: `policy-${String((index % 5) + 1).padStart(3, '0')}`,
    policy_name: `Eligibility Policy ${(index % 5) + 1}`,
    policy_version: `v${Math.floor(index / 5) + 1}.0`,
    status: ['draft', 'published', 'retired'][index % 3],
    published_at: dateAt(index, 2),
    rule_count: 3 + (index % 8),
    tags: ['eligibility', `portfolio-${index % 4}`],
    metadata: { owner: `team-${index % 3}`, review_cycle: 'quarterly' },
    created_at: dateAt(index),
    updated_at: dateAt(index, 3)
  };
}

function executionRequest(index) {
  const requestNumber = String(index + 1).padStart(5, '0');
  const requestId = `request-${requestNumber}`;
  const received = dateAt(index, 4);
  const duration = 25 + index * 7;
  return {
    _id: oid(3, index + 1),
    customer_id: `customer-${String((index % 20) + 1).padStart(3, '0')}`,
    request_id: requestId,
    correlation_id: `correlation-${requestNumber}`,
    policy_id: `policy-${String((index % 5) + 1).padStart(3, '0')}`,
    policy_version: `v${Math.floor(index / 5) + 1}.0`,
    request_received_at: received,
    completed_at: new Date(received.getTime() + duration),
    duration_ms: Long.fromNumber(duration),
    channel: ['mobile', 'portal', 'operations'][index % 3],
    request_payload: {
      applicant: { applicant_id: `applicant-${requestNumber}`, age: 21 + index },
      requested_amount: 1000 + index * 250,
      expedited: index % 2 === 0
    },
    response_payload: { accepted: index % 3 !== 0, response_code: `R${index % 4}` },
    intermediate_summary: { checks_run: 3 + (index % 4), risk_band: ['low', 'medium', 'high'][index % 3] },
    outcome: {
      decision: index % 3 === 0 ? 'review' : 'approve',
      status: 'completed',
      score: 0.55 + (index % 10) * 0.03,
      reason_codes: [`reason-${index % 4}`, `segment-${index % 3}`]
    },
    analytics_dimensions: { region: ['north', 'south', 'east', 'west'][index % 4], age_band: index < 9 ? '21-29' : '30-40' },
    executed_rule_names: [`identity-check-${index % 2}`, `risk-score-${index % 3}`],
    rule_execution_count: 2 + (index % 4),
    logging_ingest: {
      ingested_at: new Date(received.getTime() + duration + 10),
      ingest_source: ['kafka', 'queue', 'api', 'batch'][index % 4],
      ingest_status: ['received', 'persisted', 'error'][index % 3]
    },
    expires_at: new Date(Date.UTC(2025, 0, 1 + index))
  };
}

function ruleExecutionLog(index) {
  const requestNumber = String((index % 20) + 1).padStart(5, '0');
  const duration = 5 + index;
  return {
    _id: oid(4, index + 1),
    customer_id: `customer-${String((index % 20) + 1).padStart(3, '0')}`,
    request_id: `request-${requestNumber}`,
    correlation_id: `correlation-${requestNumber}`,
    policy_id: `policy-${String((index % 5) + 1).padStart(3, '0')}`,
    policy_version: `v${Math.floor(index / 5) + 1}.0`,
    rule_log_seq: index + 1,
    rule_id: `rule-${String((index % 7) + 1).padStart(3, '0')}`,
    rule_name: `Deterministic Rule ${(index % 7) + 1}`,
    rule_type: index % 2 === 0 ? 'condition' : 'action',
    stage_name: ['validation', 'scoring', 'decision'][index % 3],
    executed_at: dateAt(index, 5),
    duration_ms: Long.fromNumber(duration),
    execution_result: ['matched', 'not_matched', 'executed', 'skipped', 'error'][index % 5],
    condition_expression: `score >= ${50 + index}`,
    input_snapshot: { score_before: 40 + index, flags: { manual_review: index % 3 === 0 } },
    output_snapshot: { score_after: 50 + index, result: index % 2 === 0 ? 'pass' : 'review' },
    intermediate_values: { stage: { ordinal: index % 3, complete: true } },
    variables_touched: [
      { name: 'risk_score', value: 50 + index, value_type: 'number', path: 'decision.risk_score' },
      { name: 'eligible', value: index % 2 === 0, value_type: 'boolean', path: 'decision.eligible' }
    ],
    error: { code: `E${String(index % 4).padStart(3, '0')}`, message: `Deterministic diagnostic ${index + 1}` },
    expires_at: new Date(Date.UTC(2025, 1, 1 + index))
  };
}

async function main() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is required');
  const maxDocs = nonnegativeInteger(SEED_MAX_DOCS, 20, 'SEED_MAX_DOCS');
  const caps = readCaps(SEED_COLLECTION_CAPS);
  const counts = {};
  const factories = {
    customers: customer,
    policies: policy,
    execution_requests: executionRequest,
    rule_execution_logs: ruleExecutionLog
  };
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME || '1790363790918');
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
    for (const name of collectionNames) {
      if (existing.has(name)) await db.collection(name).drop();
      await db.createCollection(name);
    }
    for (const name of collectionNames) {
      const count = Math.min(20, maxDocs, caps[name] === undefined ? 20 : caps[name]);
      const documents = Array.from({ length: count }, (_, index) => factories[name](index));
      if (documents.length > 0) await db.collection(name).insertMany(documents, { ordered: true });
      for (const indexSpec of declaredIndexes[name]) {
        await db.collection(name).createIndex(indexSpec.key, indexSpec.options);
      }
      counts[name] = count;
    }
    console.log(JSON.stringify({ seed_summary: counts }));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exitCode = 1;
});
