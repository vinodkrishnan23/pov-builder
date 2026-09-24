const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

const REQUIRED_ENV_VARS = [
  'MONGODB_URI',
  'MONGODB_DB',
  'DATASET_SIZE',
  'RANDOM_SEED',
  'DROP_EXISTING_COLLECTIONS',
  'ATLAS_SEARCH_INDEX_WAIT_MS',
  'CREATE_SEARCH_INDEXES'
];

for (const key of REQUIRED_ENV_VARS) {
  if (typeof process.env[key] !== 'string') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const DATASET_CONFIG = {
  small: { tickets: 8000 },
  medium: { tickets: 30000 },
  large: { tickets: 80000 }
};

const datasetSize = process.env.DATASET_SIZE;
if (!DATASET_CONFIG[datasetSize]) {
  throw new Error(`Invalid DATASET_SIZE: ${datasetSize}`);
}

const DROP_EXISTING_COLLECTIONS = process.env.DROP_EXISTING_COLLECTIONS === 'true';
const CREATE_SEARCH_INDEXES = process.env.CREATE_SEARCH_INDEXES === 'true';
const ATLAS_SEARCH_INDEX_WAIT_MS = Number(process.env.ATLAS_SEARCH_INDEX_WAIT_MS);
const RNG_SEED = process.env.RANDOM_SEED;
const TOTAL_TICKETS = DATASET_CONFIG[datasetSize].tickets;
const EMBEDDING_DIMENSIONS = 48;
const MODEL_VERSION = 'triage-demo-v1.3';
const BASE_NOW = new Date('2026-06-30T12:00:00.000Z');
const HISTORY_DAYS = 84;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToInt(str) {
  const hash = crypto.createHash('sha256').update(String(str)).digest();
  return hash.readUInt32LE(0);
}

const rand = mulberry32(seedToInt(RNG_SEED));

function random() {
  return rand();
}

function randomInt(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick(list) {
  return list[randomInt(0, list.length - 1)];
}

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let r = random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function chance(prob) {
  return random() < prob;
}

function stableObjectId(key) {
  const hex = crypto.createHash('md5').update(String(key)).digest('hex').slice(0, 24);
  return new ObjectId(hex);
}

function hashUnit(text) {
  const buf = crypto.createHash('sha256').update(text).digest();
  return buf.readUInt32LE(0) / 0xffffffff;
}

function deterministicNoise(key, scale = 1) {
  return (hashUnit(key) * 2 - 1) * scale;
}

function daysAgo(days, hour = 12, minute = 0) {
  return new Date(BASE_NOW.getTime() - days * MS_PER_DAY - (12 - hour) * 60 * 60 * 1000 - minute * 60 * 1000);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeEmbedding(text, familyKey) {
  const vector = [];
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    const source = `${RNG_SEED}|${familyKey}|${text}|${i}`;
    const n = deterministicNoise(source, 1);
    vector.push(Number(n.toFixed(6)));
  }
  return vector;
}

const teams = [
  {
    _id: stableObjectId('team:PLAT'),
    team_code: 'PLAT',
    name: 'Platform Operations',
    description: 'Handles core platform stability, service health, and environment failures.',
    active: true,
    created_at: daysAgo(400),
    specialties: ['login', 'latency', 'deployment', 'api error'],
    avgResolution: 210
  },
  {
    _id: stableObjectId('team:BILL'),
    team_code: 'BILL',
    name: 'Billing Support',
    description: 'Owns invoices, payment processing, credits, and subscription plan issues.',
    active: true,
    created_at: daysAgo(395),
    specialties: ['invoice', 'payment', 'refund', 'tax'],
    avgResolution: 320
  },
  {
    _id: stableObjectId('team:ANLY'),
    team_code: 'ANLY',
    name: 'Analytics & Reporting',
    description: 'Supports dashboards, exports, delayed metrics, and reporting discrepancies.',
    active: true,
    created_at: daysAgo(390),
    specialties: ['dashboard', 'report', 'export', 'data lag'],
    avgResolution: 410
  },
  {
    _id: stableObjectId('team:INTEG'),
    team_code: 'INTEG',
    name: 'Integration Support',
    description: 'Supports connectors, webhooks, sync jobs, and external platform integrations.',
    active: true,
    created_at: daysAgo(385),
    specialties: ['connector', 'sync', 'webhook', 'auth token'],
    avgResolution: 360
  },
  {
    _id: stableObjectId('team:SECU'),
    team_code: 'SECU',
    name: 'Security & Access',
    description: 'Handles authentication, permissions, SSO, and access-control escalations.',
    active: true,
    created_at: daysAgo(380),
    specialties: ['sso', 'permission', 'mfa', 'access denied'],
    avgResolution: 180
  },
  {
    _id: stableObjectId('team:MOBL'),
    team_code: 'MOBL',
    name: 'Mobile Experience',
    description: 'Owns iOS and Android client issues, push notifications, and mobile sync.',
    active: true,
    created_at: daysAgo(375),
    specialties: ['ios', 'android', 'push notification', 'mobile sync'],
    avgResolution: 260
  },
  {
    _id: stableObjectId('team:ONBD'),
    team_code: 'ONBD',
    name: 'Onboarding Success',
    description: 'Supports setup, configuration, data import, and initial account enablement.',
    active: true,
    created_at: daysAgo(370),
    specialties: ['setup', 'import', 'configuration', 'trial'],
    avgResolution: 290
  },
  {
    _id: stableObjectId('team:API'),
    team_code: 'API',
    name: 'Developer API Support',
    description: 'Handles SDK, API usage, rate limits, and developer tooling questions.',
    active: true,
    created_at: daysAgo(365),
    specialties: ['api', 'sdk', 'rate limit', 'payload'],
    avgResolution: 240
  }
];

const productLines = [
  {
    name: 'Core Cloud',
    weight: 24,
    dominantTeam: 'PLAT',
    issueFamilies: [
      {
        key: 'core-login-loop',
        title: 'login redirect loop',
        channelBias: { email: 0.45, chat: 0.35, phone: 0.2 },
        team: 'SECU',
        category: 'authentication_fix',
        resolutionTemplates: [
          'Reset affected SSO relay settings and cleared stale browser-side session metadata.',
          'Updated identity provider mapping and reissued user access tokens.',
          'Corrected tenant authentication policy and validated a clean login flow.'
        ]
      },
      {
        key: 'core-api-500',
        title: 'API 500 during bulk update',
        channelBias: { email: 0.5, chat: 0.2, phone: 0.3 },
        team: 'API',
        category: 'api_patch',
        resolutionTemplates: [
          'Patched malformed payload handling in the bulk update endpoint and replayed the failed job.',
          'Raised request timeout thresholds for the tenant and corrected the validation path.',
          'Applied a backend hotfix for batch processing errors and confirmed successful retries.'
        ]
      },
      {
        key: 'core-latency',
        title: 'workspace latency spike',
        channelBias: { email: 0.35, chat: 0.4, phone: 0.25 },
        team: 'PLAT',
        category: 'performance_tuning',
        resolutionTemplates: [
          'Rebalanced overloaded workers and restored normal response times.',
          'Optimized a noisy background process and confirmed latency returned to baseline.',
          'Scaled the affected service tier and resolved queue congestion.'
        ]
      }
    ]
  },
  {
    name: 'Analytics Suite',
    weight: 18,
    dominantTeam: 'ANLY',
    issueFamilies: [
      {
        key: 'analytics-dashboard-delay',
        title: 'dashboard numbers lagging by several hours',
        channelBias: { email: 0.5, chat: 0.3, phone: 0.2 },
        team: 'ANLY',
        category: 'data_pipeline_delay',
        resolutionTemplates: [
          'Restarted delayed aggregation workers and backfilled the missing reporting window.',
          'Cleared a stuck ingestion partition and recomputed the affected dashboard tiles.',
          'Resolved warehouse queue contention and verified metrics freshness.'
        ]
      },
      {
        key: 'analytics-export-fail',
        title: 'scheduled export failing',
        channelBias: { email: 0.55, chat: 0.25, phone: 0.2 },
        team: 'ANLY',
        category: 'export_configuration',
        resolutionTemplates: [
          'Corrected export destination credentials and resumed the schedule.',
          'Adjusted report schema mapping and regenerated the failed export batch.',
          'Fixed row limit handling for the scheduled export and confirmed delivery.'
        ]
      },
      {
        key: 'analytics-filter-mismatch',
        title: 'report filter mismatch',
        channelBias: { email: 0.45, chat: 0.35, phone: 0.2 },
        team: 'ANLY',
        category: 'report_logic_fix',
        resolutionTemplates: [
          'Aligned filter logic with saved view settings and validated report totals.',
          'Corrected date-boundary handling in report generation.',
          'Updated report configuration to match expected grouping behavior.'
        ]
      }
    ]
  },
  {
    name: 'Commerce Hub',
    weight: 16,
    dominantTeam: 'BILL',
    issueFamilies: [
      {
        key: 'commerce-invoice-tax',
        title: 'invoice tax calculation appears incorrect',
        channelBias: { email: 0.5, chat: 0.2, phone: 0.3 },
        team: 'BILL',
        category: 'billing_adjustment',
        resolutionTemplates: [
          'Recomputed tax rules for the account and issued an adjusted invoice.',
          'Updated jurisdiction mapping and corrected the billing profile.',
          'Applied a billing correction and regenerated the invoice document.'
        ]
      },
      {
        key: 'commerce-payment-decline',
        title: 'payment method declined unexpectedly',
        channelBias: { email: 0.35, chat: 0.25, phone: 0.4 },
        team: 'BILL',
        category: 'payment_recovery',
        resolutionTemplates: [
          'Validated processor response codes and retried the payment after updating the method token.',
          'Cleared a stale payment authorization lock and restored successful charge processing.',
          'Worked with the processor retry window and resolved the decline pattern.'
        ]
      },
      {
        key: 'commerce-refund-delay',
        title: 'refund status still pending',
        channelBias: { email: 0.4, chat: 0.3, phone: 0.3 },
        team: 'BILL',
        category: 'refund_processing',
        resolutionTemplates: [
          'Released the refund from manual review and confirmed processor submission.',
          'Fixed refund workflow state and sent updated confirmation to the account owner.',
          'Corrected finance-side status reconciliation and completed the refund.'
        ]
      }
    ]
  },
  {
    name: 'Integration Cloud',
    weight: 15,
    dominantTeam: 'INTEG',
    issueFamilies: [
      {
        key: 'integ-webhook-retry',
        title: 'webhook retries keep failing',
        channelBias: { email: 0.45, chat: 0.3, phone: 0.25 },
        team: 'INTEG',
        category: 'webhook_configuration',
        resolutionTemplates: [
          'Updated endpoint validation rules and replayed the failed webhook queue.',
          'Corrected target URL formatting and resumed successful retry delivery.',
          'Adjusted webhook authentication headers and cleared the retry backlog.'
        ]
      },
      {
        key: 'integ-connector-auth',
        title: 'connector authentication expired',
        channelBias: { email: 0.5, chat: 0.3, phone: 0.2 },
        team: 'INTEG',
        category: 'credential_refresh',
        resolutionTemplates: [
          'Reauthorized the connector and refreshed expired credentials.',
          'Updated OAuth token storage and restored scheduled sync jobs.',
          'Resolved token refresh failure and validated connector health.'
        ]
      },
      {
        key: 'integ-sync-gap',
        title: 'records missing after sync',
        channelBias: { email: 0.45, chat: 0.35, phone: 0.2 },
        team: 'INTEG',
        category: 'sync_repair',
        resolutionTemplates: [
          'Backfilled skipped records and tuned sync checkpoint handling.',
          'Repaired incremental sync state and replayed the missing batch.',
          'Adjusted field mapping and reprocessed the incomplete sync window.'
        ]
      }
    ]
  },
  {
    name: 'Mobile Workspace',
    weight: 12,
    dominantTeam: 'MOBL',
    issueFamilies: [
      {
        key: 'mobile-push-missing',
        title: 'push notifications not arriving',
        channelBias: { email: 0.3, chat: 0.45, phone: 0.25 },
        team: 'MOBL',
        category: 'notification_fix',
        resolutionTemplates: [
          'Refreshed device registration tokens and restored push delivery.',
          'Corrected notification preference sync and verified mobile alerts.',
          'Resolved provider credential mismatch for push messaging.'
        ]
      },
      {
        key: 'mobile-sync-stall',
        title: 'mobile app stuck syncing',
        channelBias: { email: 0.35, chat: 0.4, phone: 0.25 },
        team: 'MOBL',
        category: 'mobile_sync_fix',
        resolutionTemplates: [
          'Cleared a stuck sync checkpoint and confirmed current data on device.',
          'Patched conflict resolution on mobile sync and validated steady state.',
          'Reduced payload size for the affected account and restored sync completion.'
        ]
      },
      {
        key: 'mobile-crash-attachment',
        title: 'app crashes when opening attachment',
        channelBias: { email: 0.3, chat: 0.35, phone: 0.35 },
        team: 'MOBL',
        category: 'client_bug_fix',
        resolutionTemplates: [
          'Patched attachment preview handling and confirmed the crash no longer reproduces.',
          'Resolved a device-specific rendering fault in the mobile client.',
          'Applied a client-side fix for attachment memory pressure.'
        ]
      }
    ]
  },
  {
    name: 'Identity Suite',
    weight: 9,
    dominantTeam: 'SECU',
    issueFamilies: [
      {
        key: 'identity-sso-fail',
        title: 'SSO login failing for some users',
        channelBias: { email: 0.45, chat: 0.3, phone: 0.25 },
        team: 'SECU',
        category: 'sso_configuration',
        resolutionTemplates: [
          'Corrected SAML attribute mapping and restored user access.',
          'Updated certificate trust settings and validated successful SSO login.',
          'Resolved group-claim mismatch affecting role assignment during login.'
        ]
      },
      {
        key: 'identity-mfa-reset',
        title: 'MFA reset request blocked',
        channelBias: { email: 0.3, chat: 0.3, phone: 0.4 },
        team: 'SECU',
        category: 'access_restoration',
        resolutionTemplates: [
          'Completed identity verification and reset the user MFA enrollment.',
          'Cleared policy conflict preventing MFA recovery.',
          'Restored account access after updating authentication assurance settings.'
        ]
      }
    ]
  },
  {
    name: 'Launchpad Onboarding',
    weight: 6,
    dominantTeam: 'ONBD',
    issueFamilies: [
      {
        key: 'onboard-import-template',
        title: 'CSV import template validation error',
        channelBias: { email: 0.5, chat: 0.3, phone: 0.2 },
        team: 'ONBD',
        category: 'import_mapping_fix',
        resolutionTemplates: [
          'Aligned import columns to the expected template and completed the data load.',
          'Updated validation rules for optional fields and reran the import.',
          'Corrected field mapping issues in the import configuration.'
        ]
      },
      {
        key: 'onboard-setup-permissions',
        title: 'initial workspace setup blocked by permissions',
        channelBias: { email: 0.4, chat: 0.35, phone: 0.25 },
        team: 'ONBD',
        category: 'setup_enablement',
        resolutionTemplates: [
          'Adjusted setup role permissions and completed onboarding tasks.',
          'Enabled the required feature flags for the new account workspace.',
          'Resolved configuration sequencing issue during initial setup.'
        ]
      }
    ]
  }
];

const accountTiers = [
  { value: 'free', weight: 10 },
  { value: 'standard', weight: 38 },
  { value: 'premium', weight: 32 },
  { value: 'enterprise', weight: 20 }
];

const priorities = [
  { value: 'low', weight: 36 },
  { value: 'medium', weight: 34 },
  { value: 'high', weight: 22 },
  { value: 'critical', weight: 8 }
];

const channelWeights = [
  { value: 'email', weight: 50 },
  { value: 'chat', weight: 32 },
  { value: 'phone', weight: 18 }
];

const statuses = [
  { value: 'resolved', weight: 58 },
  { value: 'closed', weight: 24 },
  { value: 'open', weight: 10 },
  { value: 'in_progress', weight: 8 }
];

function chooseProductLine() {
  return weightedPick(productLines.map((p) => ({ value: p, weight: p.weight })));
}

function chooseChannel(issueFamily) {
  const weights = Object.entries(issueFamily.channelBias).map(([value, weight]) => ({ value, weight }));
  return weightedPick(weights);
}

function choosePriority(status, accountTier, familyKey) {
  let priority = weightedPick(priorities);
  if (accountTier === 'enterprise' && chance(0.28)) priority = chance(0.55) ? 'high' : 'critical';
  if (familyKey.includes('latency') || familyKey.includes('500') || familyKey.includes('sso')) {
    if (chance(0.35)) priority = weightedPick([
      { value: 'medium', weight: 20 },
      { value: 'high', weight: 55 },
      { value: 'critical', weight: 25 }
    ]);
  }
  if ((status === 'open' || status === 'in_progress') && chance(0.15) && priority === 'low') {
    priority = 'medium';
  }
  return priority;
}

function chooseStatus(index) {
  let status = weightedPick(statuses);
  if (index > TOTAL_TICKETS * 0.92 && chance(0.35)) {
    status = weightedPick([
      { value: 'open', weight: 55 },
      { value: 'in_progress', weight: 45 }
    ]);
  }
  return status;
}

function makeSubject(issueFamily, productLine, priority, channel) {
  const prefixes = {
    low: ['Question about', 'Need help with', 'Unexpected behavior in'],
    medium: ['Issue with', 'Trouble in', 'Assistance needed for'],
    high: ['Urgent issue:', 'High priority:', 'Service impact on'],
    critical: ['Critical outage:', 'Immediate help needed:', 'Severe impact:']
  };
  const suffixes = [
    `for ${productLine.name}`,
    'after recent change',
    'for one customer workspace',
    'since this morning',
    `reported via ${channel}`
  ];
  return `${pick(prefixes[priority])} ${issueFamily.title} ${pick(suffixes)}`;
}

function makeDescription(issueFamily, productLine, priority, accountTier, channel, ticketIdx) {
  const urgencyText = {
    low: 'The customer reports a limited-impact issue and can work around it for now.',
    medium: 'The issue is affecting daily workflow and needs investigation soon.',
    high: 'The issue is blocking a key workflow for multiple users and needs rapid handling.',
    critical: 'The issue is business-critical and the customer reports immediate operational impact.'
  };
  const variants = [
    'Behavior started after a configuration change earlier in the day.',
    'The problem appears intermittent across repeated attempts.',
    'Customer included screenshots and timestamps showing the failure pattern.',
    'The issue affects one tenant more strongly than others in the same segment.',
    'Previous workaround no longer resolves the problem.'
  ];
  return [
    `${productLine.name} case ${ticketIdx}: Customer contacted support through ${channel}.`,
    `Primary issue: ${issueFamily.title}. Account tier: ${accountTier}. Priority context: ${priority}.`,
    urgencyText[priority],
    pick(variants),
    `Internal note: synthetic historical support example for ${issueFamily.key}.`
  ].join(' ');
}

function resolutionTimeMinutesFor(teamCode, priority, status, productLineName, createdAt) {
  if (status !== 'resolved' && status !== 'closed') return null;
  const team = teams.find((t) => t.team_code === teamCode);
  const base = team ? team.avgResolution : 300;
  const priorityMultiplier = {
    low: 1.2,
    medium: 1,
    high: 0.82,
    critical: 0.62
  }[priority];
  const productFactor = 1 + (Math.abs(deterministicNoise(`${productLineName}|${startOfDay(createdAt).toISOString()}`, 0.22)));
  const raw = base * priorityMultiplier * productFactor + randomInt(-35, 55);
  return Math.max(20, Math.round(raw));
}

function maybeTriageSuggestion(status, manualPriority, teamId, createdAt, issueFamily, productLine) {
  if (!(status === 'open' || status === 'in_progress')) return undefined;
  if (!chance(0.72)) return undefined;
  const suggestedPriority = chance(0.68)
    ? manualPriority
    : weightedPick([
        { value: 'low', weight: 20 },
        { value: 'medium', weight: 38 },
        { value: 'high', weight: 28 },
        { value: 'critical', weight: 14 }
      ]);
  const suggestedTeam = chance(0.76) ? teamId : stableObjectId(`team:${productLine.dominantTeam}`);
  const confidenceBase = issueFamily.team === productLine.dominantTeam ? 0.9 : 0.78;
  return {
    suggested_priority: suggestedPriority,
    suggested_team_id: suggestedTeam,
    confidence: Number(clamp(confidenceBase + deterministicNoise(`${issueFamily.key}|${createdAt.toISOString()}`, 0.14), 0.51, 0.98).toFixed(3)),
    generated_at: addMinutes(createdAt, randomInt(2, 90)),
    model_version: MODEL_VERSION
  };
}

function makeTickets() {
  const tickets = [];
  const resolvedCandidatesByFamily = new Map();

  for (let i = 0; i < TOTAL_TICKETS; i++) {
    const productLine = chooseProductLine();
    const issueFamily = pick(productLine.issueFamilies);
    const status = chooseStatus(i);
    const accountTier = weightedPick(accountTiers);
    const sourceChannel = chance(0.15) ? weightedPick(channelWeights) : chooseChannel(issueFamily);
    const manualPriority = choosePriority(status, accountTier, issueFamily.key);
    const assignedTeamCode = issueFamily.team;
    const assignedTeamId = stableObjectId(`team:${assignedTeamCode}`);

    const dayOffset = randomInt(0, HISTORY_DAYS - 1);
    const baseDate = startOfDay(daysAgo(dayOffset));
    const createdAt = addMinutes(baseDate, randomInt(0, 1439));

    let resolvedAt = null;
    let resolutionTimeMinutes = null;
    let resolutionSummary = undefined;
    let resolutionCategory = undefined;

    if (status === 'resolved' || status === 'closed') {
      resolutionTimeMinutes = resolutionTimeMinutesFor(assignedTeamCode, manualPriority, status, productLine.name, createdAt);
      resolvedAt = addMinutes(createdAt, resolutionTimeMinutes + randomInt(5, 180));
      resolutionCategory = issueFamily.category;
      resolutionSummary = pick(issueFamily.resolutionTemplates);
    }

    const subject = makeSubject(issueFamily, productLine, manualPriority, sourceChannel);
    const description = makeDescription(issueFamily, productLine, manualPriority, accountTier, sourceChannel, i + 1);
    const embedding = status === 'resolved' || status === 'closed' ? makeEmbedding(`${subject} ${description} ${resolutionSummary || ''}`, issueFamily.key) : undefined;
    const triageSuggestion = maybeTriageSuggestion(status, manualPriority, assignedTeamId, createdAt, issueFamily, productLine);

    const ticket = {
      _id: stableObjectId(`ticket:${i + 1}`),
      ticket_number: `TKT-${String(i + 1).padStart(7, '0')}`,
      source_channel: sourceChannel,
      subject,
      description,
      account_tier: chance(0.93) ? accountTier : undefined,
      product_line: productLine.name,
      status,
      created_at: createdAt,
      resolved_at: resolvedAt || undefined,
      resolution_time_minutes: resolutionTimeMinutes || undefined,
      assigned_team_id: chance(0.96) ? assignedTeamId : undefined,
      manual_priority: chance(0.9) ? manualPriority : undefined,
      resolution_category: resolutionCategory,
      resolution_summary: resolutionSummary,
      triage_suggestion: triageSuggestion,
      similar_ticket_cache: undefined,
      embedding,
      ingested_at: addMinutes(createdAt, randomInt(1, 240))
    };

    Object.keys(ticket).forEach((k) => ticket[k] === undefined && delete ticket[k]);
    tickets.push(ticket);

    if ((status === 'resolved' || status === 'closed') && ticket.embedding) {
      if (!resolvedCandidatesByFamily.has(issueFamily.key)) resolvedCandidatesByFamily.set(issueFamily.key, []);
      resolvedCandidatesByFamily.get(issueFamily.key).push(ticket);
    }
  }

  for (const ticket of tickets) {
    if (!(ticket.status === 'open' || ticket.status === 'in_progress')) continue;
    const family = productLines.flatMap((pl) => pl.issueFamilies).find((f) => ticket.description.includes(f.key));
    const familyKey = family ? family.key : productLines[0].issueFamilies[0].key;
    const pool = (resolvedCandidatesByFamily.get(familyKey) || []).filter((t) => !t._id.equals(ticket._id)).slice(0, 20);
    if (pool.length >= 3) {
      const shuffled = pool
        .map((t) => ({
          ticket: t,
          sortKey: hashUnit(`${ticket.ticket_number}|${t.ticket_number}|${RNG_SEED}`)
        }))
        .sort((a, b) => a.sortKey - b.sortKey)
        .slice(0, randomInt(3, Math.min(4, pool.length)));
      ticket.similar_ticket_cache = shuffled.map((entry, idx) => ({
        ticket_id: entry.ticket._id,
        score: Number((0.94 - idx * 0.07 - hashUnit(`${entry.ticket.ticket_number}|score`) * 0.03).toFixed(3))
      }));
    }
  }

  return tickets;
}

function makeDashboardSnapshots(tickets) {
  const snapshots = [];
  const dayBuckets = [];
  const start = startOfDay(daysAgo(HISTORY_DAYS - 1));
  for (let d = 0; d < HISTORY_DAYS; d++) {
    dayBuckets.push(addDays(start, d));
  }

  const volumeMap = new Map();
  const resolutionMap = new Map();

  for (const ticket of tickets) {
    const bucket = startOfDay(ticket.created_at).toISOString();
    const volumeKey = ['ticket_volume', 'day', bucket, ticket.product_line || '', ticket.manual_priority || '', ''].join('|');
    if (!volumeMap.has(volumeKey)) {
      volumeMap.set(volumeKey, {
        metric_type: 'ticket_volume',
        time_granularity: 'day',
        bucket_start: startOfDay(ticket.created_at),
        product_line: ticket.product_line,
        priority: ticket.manual_priority,
        value: 0,
        ticket_count: 0
      });
    }
    const volumeEntry = volumeMap.get(volumeKey);
    volumeEntry.value += 1;
    volumeEntry.ticket_count += 1;

    if ((ticket.status === 'resolved' || ticket.status === 'closed') && ticket.assigned_team_id && ticket.resolved_at && typeof ticket.resolution_time_minutes === 'number') {
      const rBucket = startOfDay(ticket.resolved_at).toISOString();
      const resolutionKey = ['avg_resolution_time', 'day', rBucket, '', '', String(ticket.assigned_team_id)].join('|');
      if (!resolutionMap.has(resolutionKey)) {
        resolutionMap.set(resolutionKey, {
          metric_type: 'avg_resolution_time',
          time_granularity: 'day',
          bucket_start: startOfDay(ticket.resolved_at),
          team_id: ticket.assigned_team_id,
          totalMinutes: 0,
          ticket_count: 0
        });
      }
      const entry = resolutionMap.get(resolutionKey);
      entry.totalMinutes += ticket.resolution_time_minutes;
      entry.ticket_count += 1;
    }
  }

  for (const bucketStart of dayBuckets) {
    for (const pl of productLines) {
      for (const priority of ['low', 'medium', 'high', 'critical']) {
        const key = ['ticket_volume', 'day', bucketStart.toISOString(), pl.name, priority, ''].join('|');
        if (!volumeMap.has(key)) {
          const seasonal = 12 + Math.sin(bucketStart.getUTCDay() / 7 * Math.PI * 2) * 2;
          const spike = pl.name === 'Analytics Suite' && bucketStart.getUTCDate() % 17 === 0 ? 8 : 0;
          const syntheticCount = Math.max(0, Math.round(seasonal + spike + deterministicNoise(`${pl.name}|${priority}|${bucketStart.toISOString()}`, 4)));
          volumeMap.set(key, {
            metric_type: 'ticket_volume',
            time_granularity: 'day',
            bucket_start: bucketStart,
            product_line: pl.name,
            priority,
            value: syntheticCount,
            ticket_count: syntheticCount
          });
        }
      }
    }
    for (const team of teams) {
      const key = ['avg_resolution_time', 'day', bucketStart.toISOString(), '', '', String(team._id)].join('|');
      if (!resolutionMap.has(key)) {
        const baseline = team.avgResolution;
        const weekly = 1 + Math.sin((bucketStart.getUTCDay() / 7) * Math.PI * 2) * 0.08;
        const noise = deterministicNoise(`${team.team_code}|${bucketStart.toISOString()}`, 22);
        const sampleCount = Math.max(3, Math.round(10 + Math.abs(noise / 4)));
        resolutionMap.set(key, {
          metric_type: 'avg_resolution_time',
          time_granularity: 'day',
          bucket_start: bucketStart,
          team_id: team._id,
          totalMinutes: baseline * weekly * sampleCount + noise * sampleCount,
          ticket_count: sampleCount
        });
      }
    }
  }

  let metricIdCounter = 1;
  for (const entry of volumeMap.values()) {
    snapshots.push({
      _id: stableObjectId(`metric:${metricIdCounter++}`),
      metric_type: entry.metric_type,
      time_granularity: entry.time_granularity,
      bucket_start: entry.bucket_start,
      product_line: entry.product_line,
      priority: entry.priority,
      value: Number(entry.value.toFixed(2)),
      ticket_count: entry.ticket_count,
      refreshed_at: BASE_NOW
    });
  }

  for (const entry of resolutionMap.values()) {
    snapshots.push({
      _id: stableObjectId(`metric:${metricIdCounter++}`),
      metric_type: entry.metric_type,
      time_granularity: entry.time_granularity,
      bucket_start: entry.bucket_start,
      team_id: entry.team_id,
      value: Number((entry.totalMinutes / Math.max(1, entry.ticket_count)).toFixed(2)),
      ticket_count: entry.ticket_count,
      refreshed_at: BASE_NOW
    });
  }

  return snapshots;
}

async function recreateCollection(db, name) {
  const exists = await db.listCollections({ name }).hasNext();
  if (exists && DROP_EXISTING_COLLECTIONS) {
    await db.collection(name).drop();
  }
  if (!(await db.listCollections({ name }).hasNext())) {
    await db.createCollection(name);
  }
}

async function createRegularIndexes(db) {
  await db.collection('support_teams').createIndexes([
    { key: { team_code: 1 }, name: 'ux_team_code', unique: true },
    { key: { active: 1, name: 1 }, name: 'ix_active_name' }
  ]);

  await db.collection('tickets').createIndexes([
    { key: { ticket_number: 1 }, name: 'ux_ticket_number', unique: true },
    { key: { status: 1, created_at: 1 }, name: 'ix_status_created_at' },
    { key: { product_line: 1, created_at: 1 }, name: 'ix_product_line_created_at' },
    { key: { manual_priority: 1, created_at: 1 }, name: 'ix_manual_priority_created_at' },
    { key: { assigned_team_id: 1, resolved_at: 1 }, name: 'ix_assigned_team_resolved_at' },
    { key: { resolution_category: 1 }, name: 'ix_resolution_category' },
    { key: { status: 1, resolved_at: 1 }, name: 'ix_resolved_filter' }
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
      name: 'ux_metric_bucket_dims',
      unique: true
    },
    { key: { metric_type: 1, bucket_start: 1 }, name: 'ix_metric_type_bucket_start' }
  ]);
}

async function createSearchIndexes(db) {
  if (!CREATE_SEARCH_INDEXES) return;
  const tickets = db.collection('tickets');

  try {
    await tickets.createSearchIndex({
      name: 'ticket_text_search',
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            subject: { type: 'string' },
            description: { type: 'string' },
            resolution_summary: { type: 'string' }
          }
        }
      }
    });
  } catch (err) {
    if (!String(err.message || '').includes('already exists')) throw err;
  }

  try {
    await tickets.createSearchIndex({
      name: 'ticket_embedding_vector',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            numDimensions: EMBEDDING_DIMENSIONS,
            similarity: 'cosine'
          }
        ]
      }
    });
  } catch (err) {
    if (!String(err.message || '').includes('already exists')) throw err;
  }

  if (ATLAS_SEARCH_INDEX_WAIT_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, ATLAS_SEARCH_INDEX_WAIT_MS));
  }
}

async function insertInBatches(collection, docs, batchSize = 2000) {
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    if (batch.length) {
      await collection.insertMany(batch, { ordered: false });
    }
  }
}

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB);

  try {
    await recreateCollection(db, 'support_teams');
    await recreateCollection(db, 'tickets');
    await recreateCollection(db, 'dashboard_metric_snapshots');

    await createRegularIndexes(db);

    const tickets = makeTickets();
    const metrics = makeDashboardSnapshots(tickets);

    await insertInBatches(db.collection('support_teams'), teams, 100);
    await insertInBatches(db.collection('tickets'), tickets, 2000);
    await insertInBatches(db.collection('dashboard_metric_snapshots'), metrics, 2000);

    await createSearchIndexes(db);

    console.log(JSON.stringify({
      support_teams: teams.length,
      tickets: tickets.length,
      dashboard_metric_snapshots: metrics.length,
      dataset_size: datasetSize
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
