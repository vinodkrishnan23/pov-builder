'use strict';
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('node:crypto');

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || '1790360041472';
const maxRaw = process.env.SEED_MAX_DOCS;
const capsRaw = process.env.SEED_COLLECTION_CAPS;
const skipSearch = process.env.SEED_SKIP_SEARCH_INDEXES === '1';
const names = ['tenants','documents','chunk_profiles','chunks','queries','benchmark_runs','query_results'];

function nonnegative(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('Seed limits must be non-negative numbers');
  return Math.floor(n);
}
const globalMax = nonnegative(maxRaw, 20);
let caps = {};
if (capsRaw) {
  caps = JSON.parse(capsRaw);
  if (!caps || Array.isArray(caps) || typeof caps !== 'object') throw new Error('SEED_COLLECTION_CAPS must be a JSON object');
}
const counts = Object.fromEntries(names.map((name) => [name, Math.min(20, globalMax, nonnegative(caps[name], globalMax))]));
function oid(kind, i) {
  return new ObjectId(crypto.createHash('sha256').update(`seed-42:${kind}:${i}`).digest('hex').slice(0, 24));
}
function date(i) { return new Date(Date.UTC(2024, 0, 1, 0, i, 0)); }
function ref(kind, count, i) { return count > 0 ? oid(kind, i % count) : oid(kind, i); }
function vector(i) {
  const values = Array.from({ length: 8 }, (_, j) => (((i + 1) * (j + 3)) % 17 + 1) / 18);
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return values.map((value) => Number((value / norm).toFixed(8)));
}
async function insert(db, name, docs) { if (docs.length) await db.collection(name).insertMany(docs, { ordered: true }); }

async function main() {
  if (!uri) throw new Error('MONGODB_URI is required');
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    for (const name of names) {
      const existing = await db.listCollections({ name }, { nameOnly: true }).hasNext();
      if (existing) await db.collection(name).drop();
      await db.createCollection(name);
    }

    const tenants = Array.from({ length: counts.tenants }, (_, i) => ({
      _id: oid('tenant', i), tenant_key: `tenant-${String(i).padStart(3, '0')}`, name: `Deterministic Tenant ${i}`,
      deployment_model: i % 2 ? 'isolated' : 'shared', cloud: ['aws','gcp','azure','other'][i % 4],
      status: i % 5 ? 'active' : 'inactive', created_at: date(i), updated_at: date(i + 1)
    }));
    const documentTypes = ['pdf','csv','google_sheet','text','slack_thread','confluence_page','jira_ticket','agent_memory','other'];
    const sourceSystems = ['upload','s3','slack','confluence','jira','google_sheets','csv','pdf','agent_conversation','other'];
    const ingestStatuses = ['embedded','uploaded','text_extracted','chunked','failed'];
    const documents = Array.from({ length: counts.documents }, (_, i) => {
      const memory = i % 4 === 0;
      const doc = {
        _id: oid('document', i), tenant_id: ref('tenant', counts.tenants, i), document_type: memory ? 'agent_memory' : documentTypes[i % documentTypes.length],
        title: `Retrieval guide ${i}`, source_system: memory ? 'agent_conversation' : sourceSystems[i % sourceSystems.length],
        source_uri: `urn:seed:document:${i}`, mime_type: 'text/plain', file_name: `document-${i}.txt`,
        raw_text: `MongoDB Voyage retrieval benchmark content for tenant demo document ${i}. Semantic search and agent memory are covered.`,
        structured_attributes: { product_area: i % 2 ? 'agents' : 'search', labels: ['seed', `group-${i % 3}`], priority: i % 5 },
        ingest_status: ingestStatuses[i % ingestStatuses.length], ingest_errors: i % 5 === 4 ? [{ code: 'DEMO_ERROR', message: 'Deterministic recoverable ingest example' }] : [],
        is_agent_memory: memory, created_at: date(i + 20), updated_at: date(i + 21)
      };
      if (i % 3 !== 0) doc.access = { user_ids: [oid('user', i % 4)], group_ids: [oid('group', i % 3)] };
      return doc;
    });
    const strategies = ['fixed_length','recursive','semantic','contextual'];
    const profiles = Array.from({ length: counts.chunk_profiles }, (_, i) => ({
      _id: oid('profile', i), tenant_id: i % 3 === 0 ? null : ref('tenant', counts.tenants, i), name: `${strategies[i % 4]} profile ${i}`,
      strategy: strategies[i % 4], parameters: { chunk_size: 400 + i * 10, overlap: 40, separators: ['\\n\\n','\\n',' '] },
      is_active: i % 5 !== 4, created_at: date(i + 40)
    }));
    const chunks = Array.from({ length: counts.chunks }, (_, i) => {
      const text = `MongoDB semantic retrieval chunk ${i} discusses Voyage embeddings, hybrid search, benchmark precision, and agent memory.`;
      return {
        _id: oid('chunk', i), tenant_id: ref('tenant', counts.tenants, i), document_id: ref('document', counts.documents, i),
        chunk_profile_id: ref('profile', counts.chunk_profiles, i), chunk_index: i % 5, text, token_count: 18 + i,
        char_count: text.length, embedding: vector(i), embedding_model: 'deterministic-seed-8d', embedding_dimensions: 8,
        structured_attributes: { memory_type: i % 2 ? 'conversation' : 'preference', product_area: i % 3 ? 'search' : 'agents', tags: ['seed','retrieval'] },
        rerank_text: `${text} Reranking candidate.`, created_at: date(i + 60)
      };
    });
    const runs = Array.from({ length: counts.benchmark_runs }, (_, i) => ({
      _id: oid('run', i), tenant_id: ref('tenant', counts.tenants, i), name: `POV benchmark ${i}`,
      status: ['completed','running','draft','failed'][i % 4],
      comparison_targets: [{ target_name: 'MongoDB Voyage', target_type: 'mongodb_voyage' }, { target_name: 'Baseline', target_type: 'rudimentary_baseline' }],
      chunk_profile_ids: [ref('profile', counts.chunk_profiles, i), ref('profile', counts.chunk_profiles, i + 1)], top_k_values: [1,5,10,20],
      notes: 'Deterministic side-by-side evaluation', started_at: date(i + 80), completed_at: date(i + 81), created_at: date(i + 79)
    }));
    const queries = Array.from({ length: counts.queries }, (_, i) => ({
      _id: oid('query', i), tenant_id: ref('tenant', counts.tenants, i), benchmark_run_id: ref('run', counts.benchmark_runs, i),
      query_text: `How does semantic retrieval perform for benchmark question ${i}?`, query_type: i % 3 ? 'benchmark' : 'ad_hoc',
      expected_answer_text: 'MongoDB supports vector and hybrid retrieval.', ground_truth_chunk_ids: [ref('chunk', counts.chunks, i)],
      ground_truth_document_ids: [ref('document', counts.documents, i)],
      document_scope: { document_ids: [ref('document', counts.documents, i)], source_systems: [sourceSystems[i % sourceSystems.length]], metadata_filters: { product_area: i % 2 ? 'agents' : 'search' } },
      created_by: `seed-user-${i % 4}`, created_at: date(i + 100)
    }));
    const results = Array.from({ length: counts.query_results }, (_, i) => {
      const pair = Math.floor(i / 2);
      const approach = i % 2 === 0 ? 'mongodb_voyage' : 'rudimentary_baseline';
      const quality = approach === 'mongodb_voyage' ? 0.9 : 0.65;
      return {
        _id: oid('result', i), benchmark_run_id: ref('run', counts.benchmark_runs, 0), query_id: ref('query', counts.queries, pair),
        tenant_id: ref('tenant', counts.tenants, pair), approach, chunk_profile_id: ref('profile', counts.chunk_profiles, pair), retrieval_mode: i % 3 === 0 ? 'hybrid' : 'vector',
        latency_ms: approach === 'mongodb_voyage' ? 18 + pair : 31 + pair, top_k_requested: [1,5,10,20][pair % 4],
        results: [{ rank: 1, chunk_id: ref('chunk', counts.chunks, pair), document_id: ref('document', counts.documents, pair), score: quality, rerank_score: quality + 0.02, text_snippet: `Relevant deterministic result ${pair}`, source_title: `Retrieval guide ${pair}`, is_ground_truth_match: true }],
        metrics: { precision_at_k: { '1': quality, '5': quality - 0.05, '10': quality - 0.1, '20': quality - 0.15 }, recall_at_k: { '1': quality - 0.2, '5': quality - 0.1, '10': quality - 0.05, '20': quality }, mrr: quality, ndcg: quality - 0.03 },
        created_at: date(i + 120)
      };
    });

    await insert(db, 'tenants', tenants);
    await insert(db, 'documents', documents);
    await insert(db, 'chunk_profiles', profiles);
    await insert(db, 'chunks', chunks);
    await insert(db, 'benchmark_runs', runs);
    await insert(db, 'queries', queries);
    await insert(db, 'query_results', results);

    const indexSpecs = {
      documents: [{tenant_id:1},{created_at:1},{document_type:1},{ingest_status:1},{source_system:1},{updated_at:1}],
      chunk_profiles: [{is_active:1},{name:1},{strategy:1}],
      chunks: [{document_id:1},{tenant_id:1},{chunk_profile_id:1},{chunk_index:1}],
      queries: [{tenant_id:1},{benchmark_run_id:1},{created_at:1},{query_type:1}],
      benchmark_runs: [{tenant_id:1},{created_at:1},{status:1},{chunk_profile_ids:1}],
      query_results: [{query_id:1},{benchmark_run_id:1},{chunk_profile_id:1},{approach:1},{tenant_id:1}]
    };
    for (const [name, specs] of Object.entries(indexSpecs)) for (const keys of specs) await db.collection(name).createIndex(keys);

    if (!skipSearch) {
      await db.collection('chunks').createSearchIndex({ name: 'search_chunks_text', definition: { mappings: { dynamic: false, fields: {
        text: { type: 'string' }, tenant_id: { type: 'objectId' }, chunk_profile_id: { type: 'objectId' }, document_id: { type: 'objectId' }, structured_attributes: { type: 'document', dynamic: true }
      } } } });
      await db.collection('chunks').createSearchIndex({ name: 'vector_chunks_embedding', type: 'vectorSearch', definition: { fields: [
        { type: 'vector', path: 'embedding', numDimensions: 8, similarity: 'cosine' },
        { type: 'filter', path: 'tenant_id' }, { type: 'filter', path: 'chunk_profile_id' }, { type: 'filter', path: 'document_id' }, { type: 'filter', path: 'structured_attributes.memory_type' }
      ] } });
    }
    console.log(JSON.stringify({ seed_summary: counts }));
  } finally {
    await client.close();
  }
}
main().catch((error) => { console.error(error && error.message ? error.message : String(error)); process.exitCode = 1; });
