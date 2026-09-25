'use strict';
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('node:crypto');

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || '1790360041472';
const maxInput = process.env.SEED_MAX_DOCS;
const capsInput = process.env.SEED_COLLECTION_CAPS;
const skipSearch = process.env.SEED_SKIP_SEARCH_INDEXES === '1';
const collections = ['tenants','documents','chunk_profiles','chunks','queries','benchmark_runs','query_results'];
function limit(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('Seed limits must be non-negative numbers');
  return Math.floor(n);
}
const maximum = limit(maxInput, 20);
let caps = {};
if (capsInput) {
  caps = JSON.parse(capsInput);
  if (!caps || Array.isArray(caps) || typeof caps !== 'object') throw new Error('SEED_COLLECTION_CAPS must be a JSON object');
}
const counts = Object.fromEntries(collections.map((name) => [name, Math.min(20, maximum, limit(caps[name], maximum))]));
function oid(kind, n) { return new ObjectId(crypto.createHash('sha256').update(`seed-42:${kind}:${n}`).digest('hex').slice(0, 24)); }
function when(n) { return new Date(Date.UTC(2024, 0, 1, 0, n, 0)); }
function ref(kind, count, n) { return oid(kind, count ? n % count : n); }
function embedding(n) {
  const v = Array.from({length: 8}, (_, j) => ((((n + 1) * (j + 3)) % 17) + 1) / 18);
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return v.map((x) => Number((x / norm).toFixed(8)));
}
async function add(db, name, docs) { if (docs.length) await db.collection(name).insertMany(docs, {ordered: true}); }

async function main() {
  if (!uri) throw new Error('MONGODB_URI is required');
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    for (const name of collections) {
      if (await db.listCollections({name}, {nameOnly: true}).hasNext()) await db.collection(name).drop();
      await db.createCollection(name);
    }
    const tenants = Array.from({length: counts.tenants}, (_, i) => ({
      _id: oid('tenant', i), tenant_key: `tenant-${i}`, name: `Tenant ${i}`, deployment_model: i % 2 ? 'isolated' : 'shared',
      cloud: ['aws','gcp','azure','other'][i % 4], status: 'active', created_at: when(i), updated_at: when(i + 1)
    }));
    const docTypes = ['pdf','csv','google_sheet','text','slack_thread','confluence_page','jira_ticket','agent_memory','other'];
    const sources = ['upload','s3','slack','confluence','jira','google_sheets','csv','pdf','agent_conversation','other'];
    const states = ['embedded','uploaded','text_extracted','chunked','failed'];
    const documents = Array.from({length: counts.documents}, (_, i) => {
      const memory = i % 4 === 0;
      const d = {_id: oid('document', i), tenant_id: ref('tenant', counts.tenants, i), document_type: memory ? 'agent_memory' : docTypes[i % 9],
        title: `MongoDB retrieval guide ${i}`, source_system: memory ? 'agent_conversation' : sources[i % 10], source_uri: `urn:seed:document:${i}`,
        mime_type: 'text/plain', file_name: `document-${i}.txt`, raw_text: `MongoDB Voyage semantic and hybrid retrieval benchmark document ${i}`,
        structured_attributes: {product_area: i % 2 ? 'agents' : 'search', labels: ['seed', `label-${i % 3}`], priority: i % 5},
        ingest_status: states[i % 5], ingest_errors: i % 5 === 4 ? [{code: 'DEMO_ERROR', message: 'Deterministic example'}] : [],
        is_agent_memory: memory, created_at: when(i + 20), updated_at: when(i + 21)};
      if (i % 3) d.access = {user_ids: [oid('user', i % 4)], group_ids: [oid('group', i % 3)]};
      return d;
    });
    const strategies = ['fixed_length','recursive','semantic','contextual'];
    const profiles = Array.from({length: counts.chunk_profiles}, (_, i) => ({
      _id: oid('profile', i), tenant_id: i % 3 ? ref('tenant', counts.tenants, i) : null, name: `${strategies[i % 4]} profile ${i}`,
      strategy: strategies[i % 4], parameters: {chunk_size: 400 + i * 10, overlap: 40, separators: ['\n\n','\n',' ']}, is_active: i % 5 !== 4, created_at: when(i + 40)
    }));
    const chunks = Array.from({length: counts.chunks}, (_, i) => {
      const text = `MongoDB semantic retrieval chunk ${i} covers Voyage embeddings, hybrid search, precision, and agent memory.`;
      return {_id: oid('chunk', i), tenant_id: ref('tenant', counts.tenants, i), document_id: ref('document', counts.documents, i),
        chunk_profile_id: ref('profile', counts.chunk_profiles, i), chunk_index: i % 5, text, token_count: 20 + i, char_count: text.length,
        embedding: embedding(i), embedding_model: 'deterministic-8d', embedding_dimensions: 8,
        structured_attributes: {memory_type: i % 2 ? 'conversation' : 'preference', product_area: i % 2 ? 'agents' : 'search', tags: ['seed','retrieval']},
        rerank_text: `${text} Reranking candidate.`, created_at: when(i + 60)};
    });
    const runs = Array.from({length: counts.benchmark_runs}, (_, i) => ({
      _id: oid('run', i), tenant_id: ref('tenant', counts.tenants, i), name: `POV benchmark ${i}`, status: ['completed','running','draft','failed'][i % 4],
      comparison_targets: [{target_name: 'MongoDB Voyage', target_type: 'mongodb_voyage'},{target_name: 'Baseline', target_type: 'rudimentary_baseline'}],
      chunk_profile_ids: [ref('profile', counts.chunk_profiles, i), ref('profile', counts.chunk_profiles, i + 1)], top_k_values: [1,5,10,20],
      notes: 'Deterministic comparison', started_at: when(i + 80), completed_at: when(i + 81), created_at: when(i + 79)
    }));
    const queries = Array.from({length: counts.queries}, (_, i) => ({
      _id: oid('query', i), tenant_id: ref('tenant', counts.tenants, i), benchmark_run_id: ref('run', counts.benchmark_runs, i),
      query_text: `How does retrieval perform for question ${i}?`, query_type: i % 3 ? 'benchmark' : 'ad_hoc',
      expected_answer_text: 'MongoDB supports vector and hybrid retrieval.', ground_truth_chunk_ids: [ref('chunk', counts.chunks, i)],
      ground_truth_document_ids: [ref('document', counts.documents, i)], document_scope: {document_ids: [ref('document', counts.documents, i)],
        source_systems: [sources[i % 10]], metadata_filters: {product_area: i % 2 ? 'agents' : 'search'}}, created_by: `user-${i % 4}`, created_at: when(i + 100)
    }));
    const results = Array.from({length: counts.query_results}, (_, i) => {
      const q = Math.floor(i / 2), approach = i % 2 ? 'rudimentary_baseline' : 'mongodb_voyage', score = i % 2 ? 0.65 : 0.9;
      return {_id: oid('result', i), benchmark_run_id: ref('run', counts.benchmark_runs, q), query_id: ref('query', counts.queries, q),
        tenant_id: ref('tenant', counts.tenants, q), approach, chunk_profile_id: ref('profile', counts.chunk_profiles, q), retrieval_mode: i % 3 ? 'vector' : 'hybrid',
        latency_ms: i % 2 ? 31 + q : 18 + q, top_k_requested: [1,5,10,20][q % 4], results: [{rank: 1, chunk_id: ref('chunk', counts.chunks, q),
          document_id: ref('document', counts.documents, q), score, rerank_score: score + 0.02, text_snippet: `Relevant result ${q}`, source_title: `MongoDB retrieval guide ${q}`, is_ground_truth_match: true}],
        metrics: {precision_at_k: {'1':score,'5':score-.05,'10':score-.1,'20':score-.15}, recall_at_k: {'1':score-.2,'5':score-.1,'10':score-.05,'20':score}, mrr: score, ndcg: score-.03}, created_at: when(i + 120)};
    });
    await add(db, 'tenants', tenants); await add(db, 'documents', documents); await add(db, 'chunk_profiles', profiles);
    await add(db, 'chunks', chunks); await add(db, 'benchmark_runs', runs); await add(db, 'queries', queries); await add(db, 'query_results', results);
    const indexes = {
      documents: [{tenant_id:1},{created_at:1},{document_type:1},{ingest_status:1},{source_system:1},{updated_at:1}],
      chunk_profiles: [{is_active:1},{name:1},{strategy:1}], chunks: [{document_id:1},{tenant_id:1},{chunk_profile_id:1},{chunk_index:1}],
      queries: [{tenant_id:1},{benchmark_run_id:1},{created_at:1},{query_type:1}], benchmark_runs: [{tenant_id:1},{created_at:1},{status:1},{chunk_profile_ids:1}],
      query_results: [{query_id:1},{benchmark_run_id:1},{chunk_profile_id:1},{approach:1},{tenant_id:1}]
    };
    for (const [name, specs] of Object.entries(indexes)) for (const keys of specs) await db.collection(name).createIndex(keys);
    if (!skipSearch) {
      await db.collection('chunks').createSearchIndex({name: 'search_chunks_text', definition: {mappings: {dynamic: false, fields: {
        text: {type:'string'}, tenant_id: {type:'objectId'}, chunk_profile_id: {type:'objectId'}, document_id: {type:'objectId'}, structured_attributes: {type:'document', dynamic:true}
      }}}});
      await db.collection('chunks').createSearchIndex({name: 'vector_chunks_embedding', type: 'vectorSearch', definition: {fields: [
        {type:'vector', path:'embedding', numDimensions:8, similarity:'cosine'}, {type:'filter', path:'tenant_id'}, {type:'filter', path:'chunk_profile_id'},
        {type:'filter', path:'document_id'}, {type:'filter', path:'structured_attributes.memory_type'}
      ]}});
    }
    console.log(JSON.stringify({seed_summary: counts}));
  } finally { await client.close(); }
}
main().catch((error) => { console.error(error && error.message ? error.message : String(error)); process.exitCode = 1; });
