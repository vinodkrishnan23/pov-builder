'use strict';

const { MongoClient, ObjectId } = require('mongodb');
const { createHash } = require('node:crypto');

const mongodbUri = process.env.MONGODB_URI;
const databaseName = process.env.DB_NAME || '1790360041472';
const maxDocsText = process.env.SEED_MAX_DOCS;
const collectionCapsText = process.env.SEED_COLLECTION_CAPS;

const model = [
  { name: 'tenants', count: 20, fields: [
    ['_id','objectId',1], ['tenant_key','string',1], ['name','string',1], ['deployment_model','string',0,['shared','isolated']], ['cloud','string',0,['aws','gcp','azure','other']], ['status','string',1,['active','inactive']], ['created_at','date',1], ['updated_at','date',1]
  ], indexes: [], relationships: [] },
  { name: 'documents', count: 20, fields: [
    ['_id','objectId',1], ['tenant_id','objectId',1], ['document_type','string',1,['pdf','csv','google_sheet','text','slack_thread','confluence_page','jira_ticket','agent_memory','other']], ['title','string',0], ['source_system','string',1,['upload','s3','slack','confluence','jira','google_sheets','csv','pdf','agent_conversation','other']], ['source_uri','string',0], ['mime_type','string',0], ['file_name','string',0], ['raw_text','string',0], ['structured_attributes','object',0],
    ['access','object',0,null,[['user_ids','array<objectId>',0],['group_ids','array<objectId>',0]]], ['ingest_status','string',1,['uploaded','text_extracted','chunked','embedded','failed']], ['ingest_errors','array<object>',0], ['is_agent_memory','bool',1], ['created_at','date',1], ['updated_at','date',1]
  ], indexes: [[{tenant_id:1},false]], relationships: [['tenant_id','tenants']] },
  { name: 'chunk_profiles', count: 20, fields: [
    ['_id','objectId',1], ['tenant_id','objectId',0], ['name','string',1], ['strategy','string',1,['fixed_length','recursive','semantic','contextual']], ['parameters','object',0], ['is_active','bool',1], ['created_at','date',1]
  ], indexes: [], relationships: [] },
  { name: 'chunks', count: 20, fields: [
    ['_id','objectId',1], ['tenant_id','objectId',1], ['document_id','objectId',1], ['chunk_profile_id','objectId',1], ['chunk_index','int',1], ['text','string',1], ['token_count','int',0], ['char_count','int',0], ['embedding','array<float>',0], ['embedding_model','string',0], ['embedding_dimensions','int',0], ['structured_attributes','object',0], ['rerank_text','string',0], ['created_at','date',1]
  ], indexes: [[{document_id:1},false],[{tenant_id:1},false],[{chunk_profile_id:1},false]], relationships: [['document_id','documents'],['tenant_id','tenants'],['chunk_profile_id','chunk_profiles']] },
  { name: 'queries', count: 20, fields: [
    ['_id','objectId',1], ['tenant_id','objectId',1], ['benchmark_run_id','objectId',0], ['query_text','string',1], ['query_type','string',1,['ad_hoc','benchmark']], ['expected_answer_text','string',0], ['ground_truth_chunk_ids','array<objectId>',0], ['ground_truth_document_ids','array<objectId>',0],
    ['document_scope','object',0,null,[['document_ids','array<objectId>',0],['source_systems','array<string>',0],['metadata_filters','object',0]]], ['created_by','string',0], ['created_at','date',1]
  ], indexes: [[{tenant_id:1},false],[{benchmark_run_id:1},false]], relationships: [['tenant_id','tenants'],['benchmark_run_id','benchmark_runs']] },
  { name: 'benchmark_runs', count: 20, fields: [
    ['_id','objectId',1], ['tenant_id','objectId',1], ['name','string',1], ['status','string',1,['draft','running','completed','failed']],
    ['comparison_targets','array<object>',1,null,[['target_name','string',1],['target_type','string',1,['mongodb_voyage','elastic','opensearch','qdrant','rudimentary_baseline','other']]]], ['chunk_profile_ids','array<objectId>',0], ['top_k_values','array<int>',1], ['notes','string',0], ['started_at','date',0], ['completed_at','date',0], ['created_at','date',1]
  ], indexes: [[{tenant_id:1},false]], relationships: [['tenant_id','tenants']] },
  { name: 'query_results', count: 20, fields: [
    ['_id','objectId',1], ['benchmark_run_id','objectId',0], ['query_id','objectId',1], ['tenant_id','objectId',1], ['approach','string',1,['mongodb_voyage','elastic','opensearch','qdrant','rudimentary_baseline','other']], ['chunk_profile_id','objectId',0], ['retrieval_mode','string',1,['vector','lexical','hybrid']], ['latency_ms','double',1], ['top_k_requested','int',1],
    ['results','array<object>',1,null,[['rank','int',1],['chunk_id','objectId',0],['document_id','objectId',0],['score','double',0],['rerank_score','double',0],['text_snippet','string',0],['source_title','string',0],['is_ground_truth_match','bool',0]]],
    ['metrics','object',0,null,[['precision_at_k','object',0],['recall_at_k','object',0],['mrr','double',0],['ndcg','double',0]]], ['created_at','date',1]
  ], indexes: [[{query_id:1},false],[{benchmark_run_id:1},false],[{chunk_profile_id:1},false]], relationships: [['query_id','queries'],['benchmark_run_id','benchmark_runs'],['chunk_profile_id','chunk_profiles']] }
];

function deterministicObjectId(label) {
  return new ObjectId(createHash('sha256').update(`42:${label}`).digest('hex').slice(0, 24));
}

function parseLimits() {
  const fallback = model.reduce((sum, collection) => sum + collection.count, 0);
  const maxDocs = maxDocsText === undefined || maxDocsText === '' ? fallback : Number(maxDocsText);
  if (!Number.isSafeInteger(maxDocs) || maxDocs < 0) throw new Error('SEED_MAX_DOCS must be a non-negative integer');
  let caps = {};
  if (collectionCapsText !== undefined && collectionCapsText !== '') {
    caps = JSON.parse(collectionCapsText);
    if (!caps || Array.isArray(caps) || typeof caps !== 'object') throw new Error('SEED_COLLECTION_CAPS must be a JSON object');
    for (const [name, value] of Object.entries(caps)) {
      if (!model.some((collection) => collection.name === name)) throw new Error(`Unknown collection cap: ${name}`);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid collection cap: ${name}`);
    }
  }
  const counts = {};
  let remaining = maxDocs;
  for (const collection of model) {
    const cap = Object.prototype.hasOwnProperty.call(caps, collection.name) ? caps[collection.name] : collection.count;
    counts[collection.name] = Math.min(collection.count, cap, remaining);
    remaining -= counts[collection.name];
  }
  return counts;
}

function inferredTarget(fieldName) {
  const targets = {
    ground_truth_chunk_ids: 'chunks', ground_truth_document_ids: 'documents', document_ids: 'documents',
    chunk_profile_ids: 'chunk_profiles', chunk_id: 'chunks', document_id: 'documents', user_ids: 'tenants', group_ids: 'tenants'
  };
  return targets[fieldName];
}

function scalar(type, collectionName, fieldName, row, element, ids, relationshipMap) {
  const target = relationshipMap[fieldName] || inferredTarget(fieldName);
  if (type === 'objectId') {
    if (target && ids[target] && ids[target].length) return ids[target][(row + element) % ids[target].length];
    return deterministicObjectId(`${collectionName}:${fieldName}:${row}:${element}`);
  }
  if (type === 'string') return `${collectionName}_${fieldName}_${String(row + 1).padStart(3, '0')}_${element}`;
  if (type === 'int') return row * 10 + element + 1;
  if (type === 'float' || type === 'double' || type === 'decimal') return Number((row + 0.125 + element / 10).toFixed(3));
  if (type === 'bool' || type === 'boolean') return (row + element) % 2 === 0;
  if (type === 'date') return new Date(Date.UTC(2024, 0, 1 + row, element, 0, 0));
  return `${collectionName}_${fieldName}_${row}_${element}`;
}

function fieldValue(field, collectionName, row, ids, relationshipMap) {
  const [name, type, , enumValues, children] = field;
  if (enumValues) return enumValues[row % enumValues.length];
  if (type === 'object') {
    if (children) return Object.fromEntries(children.map((child) => [child[0], fieldValue(child, collectionName, row, ids, relationshipMap)]));
    return { key: `${collectionName}_${name}_${row + 1}`, ordinal: row + 1 };
  }
  const arrayMatch = /^array<(.+)>$/.exec(type);
  if (arrayMatch) {
    const itemType = arrayMatch[1];
    if (itemType === 'object') {
      if (children) return [0, 1].map((offset) => Object.fromEntries(children.map((child) => [child[0], fieldValue(child, collectionName, row + offset, ids, relationshipMap)])));
      return [{ code: `${collectionName}_${name}_${row + 1}`, ordinal: row + 1 }];
    }
    return [0, 1, 2].map((element) => scalar(itemType, collectionName, name, row, element, ids, relationshipMap));
  }
  return scalar(type, collectionName, name, row, 0, ids, relationshipMap);
}

function buildDocument(collection, row, ids) {
  const relationshipMap = Object.fromEntries(collection.relationships);
  const document = {};
  for (const field of collection.fields) {
    document[field[0]] = field[0] === '_id' ? ids[collection.name][row] : fieldValue(field, collection.name, row, ids, relationshipMap);
  }
  return document;
}

async function seed() {
  if (!mongodbUri) throw new Error('MONGODB_URI is required');
  const counts = parseLimits();
  const ids = {};
  for (const collection of model) {
    ids[collection.name] = Array.from({ length: counts[collection.name] }, (_, row) => deterministicObjectId(`${collection.name}:${row}`));
  }
  const client = new MongoClient(mongodbUri);
  try {
    await client.connect();
    const db = client.db(databaseName);
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name));
    for (const collection of model) {
      if (existing.has(collection.name)) await db.collection(collection.name).drop();
      await db.createCollection(collection.name);
    }
    for (const collection of model) {
      const documents = Array.from({ length: counts[collection.name] }, (_, row) => buildDocument(collection, row, ids));
      if (documents.length) await db.collection(collection.name).insertMany(documents, { ordered: true });
      const indexes = collection.indexes.map(([key, unique]) => ({ key, unique }));
      for (const [field] of collection.relationships) indexes.push({ key: { [field]: 1 }, unique: false });
      const deduplicated = new Map(indexes.map((index) => [JSON.stringify(index.key), index]));
      for (const index of deduplicated.values()) await db.collection(collection.name).createIndex(index.key, { unique: index.unique });
    }
    const seedSummary = {};
    for (const collection of model) seedSummary[collection.name] = await db.collection(collection.name).countDocuments({});
    console.log(JSON.stringify({ seed_summary: seedSummary }));
  } finally {
    await client.close();
  }
}

seed().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
