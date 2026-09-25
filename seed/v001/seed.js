'use strict';

const { MongoClient, ObjectId, Long } = require('mongodb');
const { createHash } = require('node:crypto');

const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.DB_NAME;
const maxDocsText = process.env.SEED_MAX_DOCS;
const collectionCapsText = process.env.SEED_COLLECTION_CAPS;

const COLLECTIONS = [
  {
    name: 'customers', count: 20, indexes: [], fields: [
      ['_id', 'objectId', true], ['customer_id', 'string', true], ['customer_name', 'string', true],
      ['deployment_mode', 'string', true, ['on_prem', 'aws', 'azure', 'gcp', 'other_customer_cloud']],
      ['logging_enabled', 'boolean', true],
      ['retention_policy', 'document', false, null, [
        ['retention_days', 'int', false],
        ['purge_mode', 'string', false, ['ttl', 'scheduled_purge', 'manual']],
        ['purge_after_field', 'string', false, ['request_received_at', 'completed_at']]
      ]],
      ['authorized_log_viewer_roles', 'array<string>', false],
      ['created_at', 'date', true], ['updated_at', 'date', true]
    ]
  },
  {
    name: 'policies', count: 20, indexes: [], fields: [
      ['_id', 'objectId', true], ['customer_id', 'string', true], ['policy_id', 'string', true],
      ['policy_name', 'string', true], ['policy_version', 'string', true],
      ['status', 'string', true, ['draft', 'published', 'retired']],
      ['published_at', 'date', false], ['rule_count', 'int', false],
      ['tags', 'array<string>', false], ['metadata', 'document', false],
      ['created_at', 'date', true], ['updated_at', 'date', true]
    ]
  },
  {
    name: 'execution_requests', count: 20, indexes: [], fields: [
      ['_id', 'objectId', true], ['customer_id', 'string', true], ['request_id', 'string', true],
      ['correlation_id', 'string', false], ['policy_id', 'string', true],
      ['policy_version', 'string', true], ['request_received_at', 'date', true],
      ['completed_at', 'date', false], ['duration_ms', 'long', false], ['channel', 'string', false],
      ['request_payload', 'document', true], ['response_payload', 'document', false],
      ['intermediate_summary', 'document', false],
      ['outcome', 'document', false, null, [
        ['decision', 'string', false], ['status', 'string', false], ['score', 'double', false],
        ['reason_codes', 'array<string>', false]
      ]],
      ['analytics_dimensions', 'document', false], ['executed_rule_names', 'array<string>', false],
      ['rule_execution_count', 'int', false],
      ['logging_ingest', 'document', false, null, [
        ['ingested_at', 'date', false],
        ['ingest_source', 'string', false, ['kafka', 'queue', 'api', 'batch']],
        ['ingest_status', 'string', false, ['received', 'persisted', 'error']]
      ]],
      ['expires_at', 'date', false]
    ]
  },
  {
    name: 'rule_execution_logs', count: 20, indexes: [], fields: [
      ['_id', 'objectId', true], ['customer_id', 'string', true], ['request_id', 'string', true],
      ['correlation_id', 'string', false], ['policy_id', 'string', true],
      ['policy_version', 'string', true], ['rule_log_seq', 'int', true],
      ['rule_id', 'string', false], ['rule_name', 'string', true], ['rule_type', 'string', false],
      ['stage_name', 'string', false], ['executed_at', 'date', true], ['duration_ms', 'long', false],
      ['execution_result', 'string', false, ['matched', 'not_matched', 'executed', 'skipped', 'error']],
      ['condition_expression', 'string', false], ['input_snapshot', 'document', false],
      ['output_snapshot', 'document', false], ['intermediate_values', 'document', false],
      ['variables_touched', 'array<document>', false, null, [
        ['name', 'string', true], ['value', 'mixed', false],
        ['value_type', 'string', false], ['path', 'string', false]
      ]],
      ['error', 'document', false, null, [
        ['code', 'string', false], ['message', 'string', false]
      ]],
      ['expires_at', 'date', false]
    ]
  }
];

function parseMaxDocs(text, fallback) {
  if (text === undefined || text === '') return fallback;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('SEED_MAX_DOCS must be a non-negative integer');
  return value;
}

function parseCaps(text) {
  if (text === undefined || text === '') return {};
  const value = JSON.parse(text);
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('SEED_COLLECTION_CAPS must be a JSON object');
  }
  const caps = {};
  for (const [name, cap] of Object.entries(value)) {
    if (!Number.isSafeInteger(cap) || cap < 0) throw new Error('Collection caps must be non-negative integers');
    caps[name] = cap;
  }
  return caps;
}

function allocateCounts(maxDocs, caps) {
  const limits = COLLECTIONS.map((collection) => Math.min(
    collection.count,
    Object.prototype.hasOwnProperty.call(caps, collection.name) ? caps[collection.name] : collection.count
  ));
  const counts = limits.map(() => 0);
  let remaining = maxDocs;
  let advanced = true;
  while (remaining > 0 && advanced) {
    advanced = false;
    for (let i = 0; i < limits.length && remaining > 0; i += 1) {
      if (counts[i] < limits[i]) {
        counts[i] += 1;
        remaining -= 1;
        advanced = true;
      }
    }
  }
  return counts;
}

function deterministicObjectId(scope, index) {
  const hex = createHash('sha256').update(`42:${scope}:${index}`).digest('hex').slice(0, 24);
  return new ObjectId(hex);
}

function dateFor(index, offset) {
  return new Date(Date.UTC(2024, 0, 1, 0, 0, 0) + (index * 3600000) + offset);
}

function stringFor(name, index, position) {
  const n = index + 1;
  if (name === 'customer_id') return `customer-${String((index % 5) + 1).padStart(3, '0')}`;
  if (name === 'customer_name') return `Customer ${n}`;
  if (name === 'policy_id') return `policy-${String((index % 8) + 1).padStart(3, '0')}`;
  if (name === 'policy_name') return `Policy ${n}`;
  if (name === 'policy_version') return `v${(index % 4) + 1}.0`;
  if (name === 'request_id') return `request-${String(n).padStart(5, '0')}`;
  if (name === 'correlation_id') return `correlation-${String(n).padStart(5, '0')}`;
  if (name === 'rule_id') return `rule-${String((index % 12) + 1).padStart(3, '0')}`;
  if (name === 'rule_name') return `Rule ${(index % 12) + 1}`;
  if (name === 'channel') return ['mobile', 'portal', 'operations'][index % 3];
  if (name === 'decision') return ['approve', 'review', 'decline'][index % 3];
  if (name === 'status') return ['complete', 'pending', 'review'][index % 3];
  if (name === 'value_type') return ['string', 'number', 'boolean'][index % 3];
  if (name === 'path') return `input.field_${position + 1}`;
  if (name === 'condition_expression') return `score >= ${500 + index}`;
  if (name === 'code') return `E${String(index + 1).padStart(3, '0')}`;
  if (name === 'message') return `Deterministic message ${n}`;
  return `${name}-${String(n).padStart(3, '0')}-${position + 1}`;
}

function valueFor(field, collectionName, index, position) {
  const [name, type, , enumValues, children] = field;
  if (enumValues) return enumValues[index % enumValues.length];
  if (type === 'objectId') return deterministicObjectId(collectionName, index);
  if (type === 'string') return stringFor(name, index, position);
  if (type === 'boolean') return index % 2 === 0;
  if (type === 'int') return name === 'retention_days' ? 30 + (index % 4) * 30 : index + 1;
  if (type === 'long') return Long.fromNumber(25 + index * 17);
  if (type === 'double') return 0.5 + index * 0.25;
  if (type === 'date') return dateFor(index, position * 60000);
  if (type === 'mixed') {
    const variants = [`value-${index + 1}`, index + 0.5, index % 2 === 0];
    return variants[index % variants.length];
  }
  if (type === 'array<string>') return [`${name}-${index + 1}-a`, `${name}-${index + 1}-b`];
  if (type === 'array<int>') return [index + 1, index + 2];
  if (type === 'array<double>') return [index + 0.25, index + 0.75];
  if (type === 'array<boolean>') return [index % 2 === 0, index % 2 !== 0];
  if (type === 'array<date>') return [dateFor(index, position * 60000)];
  if (type === 'array<objectId>') return [deterministicObjectId(`${collectionName}.${name}`, index)];
  if (type === 'array<document>') {
    return [documentFor(children || [], collectionName, index, `${name}.0`)];
  }
  if (type === 'document') {
    if (children) return documentFor(children, collectionName, index, name);
    return { sample_key: `${collectionName}-${name}-${index + 1}`, sequence: index + 1 };
  }
  throw new Error(`Unsupported field type: ${type}`);
}

function documentFor(fields, collectionName, index, path) {
  const result = {};
  fields.forEach((field, position) => {
    result[field[0]] = valueFor(field, `${collectionName}.${path}`, index, position);
  });
  return result;
}

function makeDocument(collection, index) {
  const document = {};
  collection.fields.forEach((field, position) => {
    document[field[0]] = valueFor(field, collection.name, index, position);
  });
  return document;
}

async function main() {
  if (!mongoUri) throw new Error('MONGODB_URI is required');
  const dbName = databaseName || '1790363790918';
  const defaultTotal = COLLECTIONS.reduce((sum, collection) => sum + collection.count, 0);
  const maxDocs = parseMaxDocs(maxDocsText, defaultTotal);
  const caps = parseCaps(collectionCapsText);
  const counts = allocateCounts(maxDocs, caps);
  const client = new MongoClient(mongoUri);
  const summary = {};
  try {
    await client.connect();
    const db = client.db(dbName);
    for (let i = 0; i < COLLECTIONS.length; i += 1) {
      const definition = COLLECTIONS[i];
      try {
        await db.collection(definition.name).drop();
      } catch (error) {
        if (!error || error.codeName !== 'NamespaceNotFound') throw error;
      }
      await db.createCollection(definition.name);
      const documents = Array.from({ length: counts[i] }, (_, index) => makeDocument(definition, index));
      if (documents.length > 0) await db.collection(definition.name).insertMany(documents, { ordered: true });
      if (definition.indexes.length > 0) await db.collection(definition.name).createIndexes(definition.indexes);
      summary[definition.name] = documents.length;
    }
  } finally {
    await client.close();
  }
  console.log(JSON.stringify({ seed_summary: summary }));
}

main().catch(() => {
  console.error('Seed failed');
  process.exitCode = 1;
});
