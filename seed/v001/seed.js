'use strict';

const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('node:crypto');

const mongodbUri = process.env.MONGODB_URI;
const databaseName = process.env.DB_NAME || '1790360041472';
const maxDocsText = process.env.SEED_MAX_DOCS;
const collectionCapsText = process.env.SEED_COLLECTION_CAPS;

const collections = [
  { name: 'tenants', fields: [
    ['_id','objectId',true],['tenant_key','string',true],['name','string',true],
    ['deployment_model','string',false,['shared','isolated']],['cloud','string',false,['aws','gcp','azure','other']],
    ['status','string',true,['active','inactive']],['created_at','date',true],['updated_at','date',true]
  ], indexes: [], relationships: {} },
  { name: 'documents', fields: [
    ['_id','objectId',true],['tenant_id','objectId',true],['document_type','string',true,['pdf','csv','google_sheet','text','slack_thread','confluence_page','jira_ticket','agent_memory','other']],
    ['title','string',false],['source_system','string',true,['upload','s3','slack','confluence','jira','google_sheets','csv','pdf','agent_conversation','other']],
    ['source_uri','string',false],['mime_type','string',false],['file_name','string',false],['raw_text','string',false],
    ['structured_attributes','object',false],['access','object',false,null,[['user_ids','array<objectId>',false],['group_ids','array<objectId>',false]]],
    ['ingest_status','string',true,['uploaded','text_extracted','chunked','embedded','failed']],['ingest_errors','array<object>',false],
    ['is_agent_memory','bool',true],['created_at','date',true],['updated_at','date',true]
  ], indexes: [[{tenant_id:1},false]], relationships: {tenant_id:'tenants'} },
  { name: 'chunk_profiles', fields: [
    ['_id','objectId',true],['tenant_id','objectId',false],['name','string',true],['strategy','string',true,['fixed_length','recursive','semantic','contextual']],
    ['parameters','object',false],['is_active','bool',true],['created_at','date',true]
  ], indexes: [], relationships: {} },
  { name: 'chunks', fields: [
    ['_id','objectId',true],['tenant_id','objectId',true],['document_id','objectId',true],['chunk_profile_id','objectId',true],
    ['chunk_index','int',true],['text','string',true],['token_count','int',false],['char_count','int',false],['embedding','array<float>',false],
    ['embedding_model','string',false],['embedding_dimensions','int',false],['structured_attributes','object',false],['rerank_text','string',false],['created_at','date',true]
  ], indexes: [[{document_id:1},false],[{tenant_id:1},false],[{chunk_profile_id:1},false]], relationships: {document_id:'documents',tenant_id:'tenants',chunk_profile_id:'chunk_profiles'} },
  { name: 'queries', fields: [
    ['_id','objectId',true],['tenant_id','objectId',true],['benchmark_run_id','objectId',false],['query_text','string',true],['query_type','string',true,['ad_hoc','benchmark']],
    ['expected_answer_text','string',false],['ground_truth_chunk_ids','array<objectId>',false],['ground_truth_document_ids','array<objectId>',false],
    ['document_scope','object',false,null,[['document_ids','array<objectId>',false],['source_systems','array<string>',false],['metadata_filters','object',false]]],
    ['created_by','string',false],['created_at','date',true]
  ], indexes: [[{tenant_id:1},false],[{benchmark_run_id:1},false]], relationships: {tenant_id:'tenants',benchmark_run_id:'benchmark_runs'} },
  { name: 'benchmark_runs', fields: [
    ['_id','objectId',true],['tenant_id','objectId',true],['name','string',true],['status','string',true,['draft','running','completed','failed']],
    ['comparison_targets','array<object>',true,null,[['target_name','string',true],['target_type','string',true,['mongodb_voyage','elastic','opensearch','qdrant','rudimentary_baseline','other']]],
    ['chunk_profile_ids','array<objectId>',false],['top_k_values','array<int>',true],['notes','string',false],['started_at','date',false],['completed_at','date',false],['created_at','date',true]
  ], indexes: [[{tenant_id:1},false]], relationships: {tenant_id:'tenants'} },
  { name: 'query_results', fields: [
    ['_id','objectId',true],['benchmark_run_id','objectId',false],['query_id','objectId',true],['tenant_id','objectId',true],
    ['approach','string',true,['mongodb_voyage','elastic','opensearch','qdrant','rudimentary_baseline','other']],['chunk_profile_id','objectId',false],
    ['retrieval_mode','string',true,['vector','lexical','hybrid']],['latency_ms','double',true],['top_k_requested','int',true],
    ['results','array<object>',true,null,[['rank','int',true],['chunk_id','objectId',false],['document_id','objectId',false],['score','double',false],['rerank_score','double',false],['text_snippet','string',false],['source_title','string',false],['is_ground_truth_match','bool',false]]],
    ['metrics','object',false,null,[['precision_at_k','object',false],['recall_at_k','object',false],['mrr','double',false],['ndcg','double',false]]],['created_at','date',true]
  ], indexes: [[{query_id:1},false],[{benchmark_run_id:1},false],[{chunk_profile_id:1},false]], relationships: {query_id:'queries',benchmark_run_id:'benchmark_runs',chunk_profile_id:'chunk_profiles'} }
];

function deterministicId(collectionName, index) {
  const hex = crypto.createHash('sha256').update(`seed-42:${collectionName}:${index}`).digest('hex').slice(0, 24);
  return new ObjectId(hex);
}

function parseLimits() {
  let maxDocs = Number.MAX_SAFE_INTEGER;
  if (maxDocsText !== undefined && maxDocsText !== '') {
    maxDocs = Number(maxDocsText);
    if (!Number.isSafeInteger(maxDocs) || maxDocs < 0) throw new Error('SEED_MAX_DOCS must be a non-negative safe integer');
  }
  let caps = {};
  if (collectionCapsText !== undefined && collectionCapsText !== '') {
    caps = JSON.parse(collectionCapsText);
    if (caps === null || typeof caps !== 'object' || Array.isArray(caps)) throw new Error('SEED_COLLECTION_CAPS must be a JSON object');
    for (const [name, cap] of Object.entries(caps)) {
      if (!collections.some((c) => c.name === name)) throw new Error(`Unknown collection cap: ${name}`);
      if (!Number.isSafeInteger(cap) || cap < 0) throw new Error(`Invalid collection cap: ${name}`);
    }
  }
  const counts = {};
  for (const collection of collections) {
    const cap = Object.prototype.hasOwnProperty.call(caps, collection.name) ? caps[collection.name] : Number.MAX_SAFE_INTEGER;
    counts[collection.name] = Math.min(20, maxDocs, cap);
  }
  return counts;
}

const inferredTargets = {
  user_ids:'tenants', group_ids:'tenants', ground_truth_chunk_ids:'chunks', ground_truth_document_ids:'documents',
  document_ids:'documents', chunk_profile_ids:'chunk_profiles', chunk_id:'chunks', document_id:'documents', tenant_id:'tenants'
};

function scalarValue(type, collection, field, index, enumValues, relationships, counts) {
  if (enumValues) return enumValues[index % enumValues.length];
  if (type === 'objectId') {
    const target = relationships[field] || inferredTargets[field] || collection;
    const targetCount = counts[target] || 1;
    return deterministicId(target, index % targetCount);
  }
  if (type === 'string') return `${collection}_${field}_${String(index).padStart(3, '0')}`;
  if (type === 'int') return index + 1;
  if (type === 'double' || type === 'float' || type === 'number') return Number((index + 0.25).toFixed(2));
  if (type === 'bool' || type === 'boolean') return index % 2 === 0;
  if (type === 'date') return new Date(Date.UTC(2024, 0, 1, 0, 0, index));
  throw new Error(`Unsupported scalar type: ${type}`);
}

function fieldValue(definition, collection, index, relationships, counts) {
  const [field, type, , enumValues, children] = definition;
  if (type === 'object') {
    if (!children) return { seed_key: `${collection}_${field}_${index}` };
    const value = {};
    for (const child of children) value[child[0]] = fieldValue(child, collection, index, relationships, counts);
    return value;
  }
  const arrayMatch = /^array<(.+)>$/.exec(type);
  if (arrayMatch) {
    const elementType = arrayMatch[1];
    if (elementType === 'object') {
      if (!children) return [{ seed_key: `${collection}_${field}_${index}` }];
      const embedded = {};
      for (const child of children) embedded[child[0]] = fieldValue(child, collection, index, relationships, counts);
      return [embedded];
    }
    return [scalarValue(elementType, collection, field, index, enumValues, relationships, counts), scalarValue(elementType, collection, field, index + 1, enumValues, relationships, counts)];
  }
  return scalarValue(type, collection, field, index, enumValues, relationships, counts);
}

function makeDocument(collection, index, counts) {
  const document = {};
  for (const field of collection.fields) document[field[0]] = fieldValue(field, collection.name, index, collection.relationships, counts);
  return document;
}

async function main() {
  if (!mongodbUri) throw new Error('MONGODB_URI is required');
  const counts = parseLimits();
  const client = new MongoClient(mongodbUri);
  try {
    await client.connect();
    const db = client.db(databaseName);
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
    for (const collection of collections) if (existing.has(collection.name)) await db.collection(collection.name).drop();
    for (const collection of collections) await db.createCollection(collection.name);
    for (const collection of collections) {
      const docs = Array.from({ length: counts[collection.name] }, (_, index) => makeDocument(collection, index, counts));
      if (docs.length) await db.collection(collection.name).insertMany(docs, { ordered: true });
      const indexSpecs = [...collection.indexes];
      for (const field of Object.keys(collection.relationships)) indexSpecs.push([{ [field]: 1 }, false]);
      const seen = new Set();
      for (const [keys, unique] of indexSpecs) {
        const signature = JSON.stringify(keys);
        if (seen.has(signature)) continue;
        seen.add(signature);
        await db.collection(collection.name).createIndex(keys, { unique, name: `idx_${Object.keys(keys).join('_')}` });
      }
    }
    const summary = {};
    for (const collection of collections) summary[collection.name] = await db.collection(collection.name).countDocuments({});
    console.log(JSON.stringify({ seed_summary: summary }));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exitCode = 1;
});
