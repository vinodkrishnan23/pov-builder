const { MongoClient } = require('mongodb');

function createRng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function env(name) {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const MONGODB_URI = env('MONGODB_URI');
const MONGODB_DB = env('MONGODB_DB');
const DATASET_SIZE = env('DATASET_SIZE');
const RANDOM_SEED = env('RANDOM_SEED');
const DROP_EXISTING_COLLECTIONS = env('DROP_EXISTING_COLLECTIONS') === 'true';
const ATLAS_SEARCH_INDEX_WAIT_MS = parseInt(env('ATLAS_SEARCH_INDEX_WAIT_MS'), 10);
const CREATE_SEARCH_INDEXES = env('CREATE_SEARCH_INDEXES') === 'true';

const rng = createRng(RANDOM_SEED);

function rand() {
  return rng();
}

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rand() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function maybe(probability) {
  return rand() < probability;
}

function sampleDistinct(arr, count) {
  const copy = arr.slice();
  const out = [];
  while (copy.length && out.length < count) {
    const idx = randInt(0, copy.length - 1);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function hashStringToUnitInterval(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function deterministicVector(text, dims) {
  const values = new Array(dims);
  for (let i = 0; i < dims; i++) {
    const v = hashStringToUnitInterval(`${text}::${i}`);
    values[i] = Number((v * 2 - 1).toFixed(6));
  }
  return values;
}

function startOfDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d, days) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function addHours(d, hours) {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const sizes = {
  small: { historical: 80000, live: 120 },
  medium: { historical: 80000, live: 220 },
  large: { historical: 80000, live: 300 }
};

if (!sizes[DATASET_SIZE]) {
  throw new Error(`Unsupported DATASET_SIZE: ${DATASET_SIZE}`);
}

const config = sizes[DATASET_SIZE];
const VECTOR_DIMS = 64;
const BATCH_SIZE = 1000;

const PRODUCT_LINES = [
  { value: 'Payments Platform', weight: 28 },
  { value: 'Identity Cloud', weight: 18 },
  { value: 'Analytics Suite', weight: 16 },
  { value: 'Commerce API', weight: 14 },
  { value: 'Mobile SDK', weight: 12 },
  { value: 'Workflow Automation', weight: 12 }
];

const ACCOUNT_TIERS = [
  { value: 'standard', weight: 68 },
  { value: 'premium', weight: 22 },
  { value: 'enterprise', weight: 10 }
];

const PRIORITIES = [
  { value: 'low', weight: 18 },
  { value: 'medium', weight: 46 },
  { value: 'high', weight: 26 },
  { value: 'urgent', weight: 10 }
];

const CHANNELS = [
  { value: 'email', weight: 56 },
  { value: 'chat', weight: 29 },
  { value: 'phone', weight: 15 }
];

const teamSeed = [
  { team_id: 'TEAM-PAY', name: 'Payments Operations', description: 'Handles payment gateway failures, settlement discrepancies, and merchant onboarding issues.', active: true, speedProfileHours: [2, 18], specialties: ['Payments Platform', 'Commerce API'] },
  { team_id: 'TEAM-ID', name: 'Identity & Access', description: 'Owns SSO, MFA, provisioning, and account lockout incidents.', active: true, speedProfileHours: [1, 10], specialties: ['Identity Cloud'] },
  { team_id: 'TEAM-ANA', name: 'Analytics Reliability', description: 'Supports reporting pipelines, dashboard latency, and data freshness investigations.', active: true, speedProfileHours: [6, 30], specialties: ['Analytics Suite'] },
  { team_id: 'TEAM-COM', name: 'Commerce Integrations', description: 'Resolves storefront API behavior, webhook issues, and connector compatibility.', active: true, speedProfileHours: [4, 24], specialties: ['Commerce API'] },
  { team_id: 'TEAM-MOB', name: 'Mobile Experience', description: 'Supports SDK install issues, app crashes, push notification, and mobile release defects.', active: true, speedProfileHours: [3, 20], specialties: ['Mobile SDK'] },
  { team_id: 'TEAM-WFA', name: 'Workflow Success', description: 'Handles automation failures, job scheduling, and integration flow regressions.', active: true, speedProfileHours: [5, 26], specialties: ['Workflow Automation'] },
  { team_id: 'TEAM-ENT', name: 'Enterprise Escalations', description: 'Dedicated escalation team for high-impact premium and enterprise accounts.', active: true, speedProfileHours: [1, 8], specialties: ['Payments Platform', 'Identity Cloud', 'Analytics Suite', 'Commerce API', 'Mobile SDK', 'Workflow Automation'] },
  { team_id: 'TEAM-GEN', name: 'General Triage', description: 'First-line intake and routing for uncategorized or lower-complexity support requests.', active: true, speedProfileHours: [8, 36], specialties: ['Payments Platform', 'Identity Cloud', 'Analytics Suite', 'Commerce API', 'Mobile SDK', 'Workflow Automation'] }
];

const ISSUE_FAMILIES = {
  'Payments Platform': [
    {
      family: 'card_decline_spike',
      categories: ['configuration', 'third_party_dependency', 'incident'],
      priorities: ['high', 'urgent'],
      subjectTemplates: [
        'Spike in card declines after rules update',
        'Payment authorization failures increasing for regional cards',
        'Unexpected rise in checkout declines for saved cards'
      ],
      detailTemplates: [
        'Merchant is reporting a sustained increase in authorization failures beginning after a risk rule change. Failures are concentrated in one region and are impacting checkout conversion.',
        'The support request describes an elevated decline rate visible in dashboard trends. Several transactions appear to be blocked before reaching the acquirer and merchants want immediate triage.',
        'A customer team noticed that repeat shoppers using stored payment methods are failing more often than normal. They need root cause guidance and rollback recommendations.'
      ],
      resolutionTemplates: [
        'Adjusted overly strict fraud rule thresholds and replayed eligible authorizations.',
        'Reverted the latest rules configuration and coordinated with risk ops on a staged rollout.',
        'Updated acquirer routing preferences and validated recovery with sample transactions.'
      ]
    },
    {
      family: 'settlement_mismatch',
      categories: ['billing', 'data_correction', 'configuration'],
      priorities: ['medium', 'high'],
      subjectTemplates: [
        'Settlement totals do not match exported report',
        'Payout reconciliation mismatch for previous business day',
        'Differences between finance export and settlement dashboard'
      ],
      detailTemplates: [
        'Finance operations found differences between expected payout totals and the daily exported settlement report. The mismatch is affecting reconciliation closeout.',
        'A customer noticed that the dashboard and CSV export are showing different settlement values for the same date range. They need confirmation of source of truth.',
        'The request includes line-item discrepancies tied to fee adjustments and delayed captures. Investigation is needed before the customer closes books.'
      ],
      resolutionTemplates: [
        'Reprocessed settlement aggregation after correcting fee mapping for delayed capture transactions.',
        'Backfilled missing payout adjustments and provided a reconciled export to finance operations.',
        'Fixed a report filter edge case and confirmed dashboard and export parity.'
      ]
    },
    {
      family: 'webhook_retry_backlog',
      categories: ['integration', 'performance', 'configuration'],
      priorities: ['medium', 'high'],
      subjectTemplates: [
        'Webhook delivery retry backlog growing',
        'Delayed payment event webhooks for partner system',
        'Payment status callbacks arriving late'
      ],
      detailTemplates: [
        'The merchant reports that payment lifecycle webhooks are arriving with significant delay, causing downstream order processing lag.',
        'Support ticket notes repeated webhook retries and eventual delivery after several minutes. The customer suspects endpoint throttling or queue issues.',
        'A partner integration is seeing delayed status callbacks for capture and refund events, with backlog visible in monitoring.'
      ],
      resolutionTemplates: [
        'Raised retry worker concurrency and advised customer to increase endpoint throughput limits.',
        'Corrected endpoint signature validation error that was causing unnecessary retries.',
        'Cleared queue backlog and tuned retry jitter to smooth burst traffic.'
      ]
    }
  ],
  'Identity Cloud': [
    {
      family: 'mfa_lockout',
      categories: ['authentication', 'configuration', 'user_error'],
      priorities: ['medium', 'high', 'urgent'],
      subjectTemplates: [
        'Users locked out after MFA enrollment change',
        'Unexpected MFA challenge loop for remote workforce',
        'Login blocked after authenticator migration'
      ],
      detailTemplates: [
        'Multiple users are unable to complete sign-in after a change to MFA enrollment policy. The customer reports repeated prompts and failed device registration.',
        'The support request describes users being trapped in an MFA loop after migrating to a new authenticator method. Access to internal tools is impacted.',
        'Enterprise admins observed login failures immediately after an authentication policy update and need rollback guidance.'
      ],
      resolutionTemplates: [
        'Rolled back the new MFA enrollment policy and reset affected user factors.',
        'Updated conditional access configuration and reissued enrollment invites.',
        'Corrected authenticator migration settings and validated sign-in success for pilot users.'
      ]
    },
    {
      family: 'sso_metadata_mismatch',
      categories: ['integration', 'configuration'],
      priorities: ['medium', 'high'],
      subjectTemplates: [
        'SSO login failing after identity provider certificate rotation',
        'SAML metadata mismatch causing login errors',
        'Federated login broken after IdP update'
      ],
      detailTemplates: [
        'The customer rotated identity provider certificates and users can no longer authenticate through SSO. Error messages point to metadata mismatch.',
        'Admins report that federated logins began failing after an IdP metadata refresh. Local accounts are still working.',
        'Support request includes SAML response validation failures observed after an identity provider configuration update.'
      ],
      resolutionTemplates: [
        'Imported updated IdP metadata and synchronized signing certificate configuration.',
        'Corrected ACS endpoint mismatch and revalidated SAML assertions.',
        'Provided updated federation settings and verified successful SSO login.'
      ]
    },
    {
      family: 'provisioning_sync_delay',
      categories: ['integration', 'performance', 'data_correction'],
      priorities: ['low', 'medium'],
      subjectTemplates: [
        'User provisioning sync running behind schedule',
        'Directory sync delay for new hires',
        'SCIM provisioning updates not reflected quickly'
      ],
      detailTemplates: [
        'The customer is seeing a lag between HR system updates and downstream user provisioning, delaying access for newly onboarded staff.',
        'Support notes indicate that deactivation and group assignment changes are not reaching target systems within expected timing.',
        'A routine sync appears to be falling behind after a connector change, but no widespread outage is reported.'
      ],
      resolutionTemplates: [
        'Restarted provisioning workers and corrected connector pagination settings.',
        'Reduced sync backlog by reprocessing queued directory events.',
        'Adjusted mapping rules and restored expected SCIM update cadence.'
      ]
    }
  ],
  'Analytics Suite': [
    {
      family: 'dashboard_latency',
      categories: ['performance', 'incident'],
      priorities: ['medium', 'high'],
      subjectTemplates: [
        'Executive dashboard loading slowly this morning',
        'Analytics dashboards timing out on common date ranges',
        'BI dashboard latency spike affecting multiple teams'
      ],
      detailTemplates: [
        'Users report that frequently used dashboards are taking much longer than normal to load, especially around business start times.',
        'The request highlights timeout errors for common date range queries with heavy filter combinations. Internal stakeholders are waiting on reports.',
        'Support observed a morning latency spike across analytics dashboards and needs to identify whether the issue is query load or pipeline freshness.'
      ],
      resolutionTemplates: [
        'Added a missing aggregate index and rescheduled a heavy backfill job outside peak hours.',
        'Scaled query workers and refreshed cached dashboard extracts.',
        'Resolved a warehouse contention issue and verified dashboard response times returned to baseline.'
      ]
    },
    {
      family: 'stale_data_feed',
      categories: ['data_correction', 'pipeline', 'incident'],
      priorities: ['medium', 'high', 'urgent'],
      subjectTemplates: [
        'Sales dashboard appears stale since overnight load',
        'Freshness alert: analytics data delayed',
        'Reports not reflecting latest transactions'
      ],
      detailTemplates: [
        'Business users noticed that analytics reports have not refreshed with the latest transaction data. A freshness alert was raised overnight.',
        'The support case mentions stale executive reporting and delayed metrics that affect operational reviews.',
        'A pipeline delay is preventing recent transactional activity from appearing in analytics exports and dashboards.'
      ],
      resolutionTemplates: [
        'Restarted the failed ingestion job and backfilled missed hourly partitions.',
        'Corrected upstream schema drift handling and replayed delayed events.',
        'Recovered the overnight load pipeline and confirmed dashboards refreshed with current data.'
      ]
    },
    {
      family: 'report_filter_confusion',
      categories: ['usability', 'configuration'],
      priorities: ['low', 'medium'],
      subjectTemplates: [
        'Saved report showing unexpected filter behavior',
        'Date filter selection resets in custom report',
        'Team report totals look different after filter edits'
      ],
      detailTemplates: [
        'The customer is confused by saved report behavior after editing filters and wants to confirm whether totals are changing due to caching or configuration.',
        'Support request points to date filter resets when users return to a saved custom report.',
        'The issue appears limited to report configuration behavior rather than data quality.'
      ],
      resolutionTemplates: [
        'Clarified saved filter precedence and corrected a UI persistence bug.',
        'Updated report template settings and provided user guidance for filter inheritance.',
        'Patched custom report state handling and confirmed filters persist correctly.'
      ]
    }
  ],
  'Commerce API': [
    {
      family: 'api_rate_limit',
      categories: ['integration', 'performance'],
      priorities: ['medium', 'high'],
      subjectTemplates: [
        'Storefront API requests hitting rate limits unexpectedly',
        'Spike in 429 responses from commerce endpoints',
        'Partner integration throttled during catalog sync'
      ],
      detailTemplates: [
        'A partner integration is receiving more 429 responses than expected during routine catalog synchronization and checkout updates.',
        'Support notes indicate a burst of traffic from a storefront app causing throttling and customer concern about missed updates.',
        'The issue impacts commerce API throughput and may require guidance on client retry strategy or tenant limits.'
      ],
      resolutionTemplates: [
        'Adjusted tenant burst limits and recommended backoff handling for synchronization jobs.',
        'Identified duplicate polling behavior in the client integration and reduced unnecessary request volume.',
        'Scaled API gateway workers and validated reduced 429 response rate.'
      ]
    },
    {
      family: 'webhook_signature_error',
      categories: ['integration', 'configuration', 'security'],
      priorities: ['medium', 'high'],
      subjectTemplates: [
        'Webhook signature validation failing after secret rotation',
        'Commerce event callbacks rejected by listener',
        'Partner reports invalid webhook signatures'
      ],
      detailTemplates: [
        'The customer rotated webhook secrets and their listener now rejects incoming commerce events as invalid.',
        'Support case includes failed signature validation logs following a recent configuration change in the partner environment.',
        'Event callbacks are being delivered but downstream processing is blocked by verification failures.'
      ],
      resolutionTemplates: [
        'Synchronized secret rotation timing and validated callback signatures end to end.',
        'Corrected hashing configuration mismatch in the listener implementation.',
        'Provided updated secret management guidance and replayed failed webhook deliveries.'
      ]
    },
    {
      family: 'order_status_mismatch',
      categories: ['data_correction', 'integration'],
      priorities: ['low', 'medium'],
      subjectTemplates: [
        'Order status differs between storefront and API response',
        'Fulfillment status mismatch in partner integration',
        'API returns stale order state for some orders'
      ],
      detailTemplates: [
        'A customer noticed that the storefront UI shows a different order state than the API for a subset of orders.',
        'Support is investigating order lifecycle mismatches affecting fulfillment workflows in a partner integration.',
        'The issue is intermittent and appears tied to delayed propagation between systems.'
      ],
      resolutionTemplates: [
        'Replayed delayed order state events and corrected cache invalidation timing.',
        'Fixed a status mapping edge case between fulfillment and storefront services.',
        'Backfilled affected order records and verified API and UI consistency.'
      ]
    }
  ],
  'Mobile SDK': [
    {
      family: 'ios_crash_after_update',
      categories: ['bug', 'incident'],
      priorities: ['high', 'urgent'],
      subjectTemplates: [
        'iOS app crash spike after SDK upgrade',
        'Crash on launch after integrating latest mobile SDK',
        'New SDK release causing startup crash in production'
      ],
      detailTemplates: [
        'The customer reports a clear increase in iOS crash rate immediately after adopting the latest SDK release. The issue affects production sessions.',
        'Support request includes startup crash traces and rollback concerns after a recent mobile SDK upgrade.',
        'A production app is crashing on launch for a subset of devices after integrating the newest SDK build.'
      ],
      resolutionTemplates: [
        'Identified a null handling regression in initialization flow and provided a patched SDK version.',
        'Advised temporary rollback to the previous SDK release while hotfix validation completed.',
        'Resolved startup crash by correcting a device capability check in the SDK bootstrap path.'
      ]
    },
    {
      family: 'push_notification_gap',
      categories: ['integration', 'configuration', 'performance'],
      priorities: ['medium', 'high'],
      subjectTemplates: [
        'Push notifications delayed on Android devices',
        'Mobile notifications not delivered consistently',
        'Intermittent delay for push campaign delivery'
      ],
      detailTemplates: [
        'Customers are seeing delayed or inconsistent mobile push delivery, especially during higher campaign traffic periods.',
        'Support observed notification delivery lag on Android and needs to determine whether client configuration or service throughput is responsible.',
        'The issue affects engagement campaigns and operational alerts sent through the mobile integration.'
      ],
      resolutionTemplates: [
        'Corrected token refresh handling and increased push dispatch worker capacity.',
        'Resolved vendor credential mismatch and replayed queued notifications.',
        'Tuned retry behavior for mobile push dispatch and confirmed delivery improvements.'
      ]
    },
    {
      family: 'sdk_install_conflict',
      categories: ['configuration', 'usability'],
      priorities: ['low', 'medium'],
      subjectTemplates: [
        'Build error after adding mobile SDK dependency',
        'Dependency conflict while integrating SDK into app',
        'Mobile SDK install instructions lead to compile issue'
      ],
      detailTemplates: [
        'A development team hit a dependency conflict after following SDK installation documentation and cannot complete a build.',
        'Support ticket mentions compile errors tied to version overlap with another analytics library.',
        'The issue is blocking onboarding for a new mobile integration but is not affecting production traffic.'
      ],
      resolutionTemplates: [
        'Recommended compatible dependency versions and updated installation guidance.',
        'Provided a sample project configuration that resolves the package conflict.',
        'Clarified build setting requirements and confirmed successful SDK integration.'
      ]
    }
  ],
  'Workflow Automation': [
    {
      family: 'job_failure_burst',
      categories: ['incident', 'performance', 'integration'],
      priorities: ['high', 'urgent'],
      subjectTemplates: [
        'Spike in failed automation jobs after connector update',
        'Scheduled workflows failing across one workspace',
        'Automation runs erroring after recent release'
      ],
      detailTemplates: [
        'The customer experienced a burst of failed workflow runs following a connector update. Scheduled automations for business-critical processes are affected.',
        'Support notes indicate repeated job failures in one workspace after a platform release, with retries also failing.',
        'The issue impacts routine automations and may require rollback or connector-specific remediation.'
      ],
      resolutionTemplates: [
        'Rolled back the affected connector version and requeued failed automation runs.',
        'Patched a release regression in workflow step validation and confirmed run recovery.',
        'Corrected connector credential handling and replayed missed scheduled jobs.'
      ]
    },
    {
      family: 'scheduler_drift',
      categories: ['performance', 'configuration'],
      priorities: ['medium'],
      subjectTemplates: [
        'Scheduled workflows starting later than configured',
        'Automation schedule drift observed this week',
        'Recurring jobs delayed by several minutes'
      ],
      detailTemplates: [
        'The customer reports recurring automations starting later than expected, creating downstream processing delays.',
        'Support observed scheduler drift for a subset of jobs during higher load periods.',
        'The issue is noticeable but not causing complete workflow failure.'
      ],
      resolutionTemplates: [
        'Rebalanced scheduler partitions and reduced queue contention.',
        'Adjusted job concurrency caps and confirmed on-time execution improved.',
        'Optimized cron evaluation load and verified reduced schedule drift.'
      ]
    },
    {
      family: 'connector_auth_expiry',
      categories: ['integration', 'authentication', 'configuration'],
      priorities: ['medium', 'high'],
      subjectTemplates: [
        'Automation connector stopped after token expiry',
        'Workflow integration disconnected unexpectedly',
        'Connector authentication failing for scheduled jobs'
      ],
      detailTemplates: [
        'A connected system token expired and scheduled jobs can no longer authenticate, causing automation failures.',
        'Support request includes repeated authentication failures for a workflow connector after credential rotation.',
        'The issue affects scheduled jobs tied to one integration and may require token refresh or reauthorization.'
      ],
      resolutionTemplates: [
        'Refreshed connector credentials and improved token renewal settings.',
        'Updated OAuth configuration and restored scheduled job authentication.',
        'Guided customer through connector reauthorization and replayed failed runs.'
      ]
    }
  ]
};

function chooseIssueFamily(productLine) {
  return pick(ISSUE_FAMILIES[productLine]);
}

function chooseAssignedTeam(productLine, accountTier, priority, teams) {
  const candidates = teams.map(team => {
    let weight = 1;
    if (team.specialties.includes(productLine)) weight += 8;
    if (team.name === 'Enterprise Escalations' && (accountTier === 'enterprise' || priority === 'urgent')) weight += 9;
    if (team.name === 'General Triage') weight += 4;
    if (team.name === 'Payments Operations' && productLine === 'Payments Platform') weight += 6;
    return { value: team, weight };
  });
  return weightedPick(candidates);
}

function maybeChannel() {
  if (!maybe(0.72)) return undefined;
  return weightedPick(CHANNELS);
}

function buildTicketText(productLine, family, priority, tier, status, isHistorical) {
  const subject = pick(family.subjectTemplates);
  const detailA = pick(family.detailTemplates);
  const issueSignals = [];

  if (priority === 'urgent') issueSignals.push('The customer marked the impact as business-critical and requested immediate escalation.');
  if (priority === 'high') issueSignals.push('Operational impact is significant and the customer expects a fast response.');
  if (tier === 'enterprise') issueSignals.push('This account is on an enterprise support plan with stricter response expectations.');
  if (!isHistorical) issueSignals.push('This is a current POV ticket generated for triage workflow testing.');
  if (status === 'new') issueSignals.push('No remediation has started yet and the case is awaiting formal triage.');
  if (status === 'open') issueSignals.push('An agent has acknowledged the case but the final resolution path is still in progress.');

  const extraCount = randInt(1, 3);
  const extrasPool = [
    'Customer provided screenshots, timestamps, and a short reproduction summary.',
    'Issue appears intermittent and may depend on tenant configuration or traffic patterns.',
    'Recent configuration changes were mentioned, but the exact timestamp is unclear.',
    'Several similar incidents were observed within the same product line over the last month.',
    'The requester is asking whether a workaround exists while engineering investigates.',
    'Logs suggest the problem may be concentrated in one region or deployment environment.',
    'The support narrative references a recent release, integration change, or policy adjustment.'
  ];
  const extras = sampleDistinct(extrasPool, extraCount);

  const description = [detailA, ...issueSignals, ...extras].join(' ');
  return { subject, description };
}

function buildResolution(family) {
  return {
    category: pick(family.categories),
    summary: pick(family.resolutionTemplates)
  };
}

function generateTeams(db) {
  const coll = db.collection('support_teams');
  return teamSeed.map(team => ({ ...team }));
}

function createTeamDocs(teams, ObjectIdCtor) {
  return teams.map(team => ({
    _id: new ObjectIdCtor(),
    team_id: team.team_id,
    name: team.name,
    description: team.description,
    active: team.active,
    speedProfileHours: team.speedProfileHours,
    specialties: team.specialties
  }));
}

function generateHistoricalTicket(i, teams, ingestBatchId) {
  const productLine = weightedPick(PRODUCT_LINES);
  const tier = weightedPick(ACCOUNT_TIERS);
  const family = chooseIssueFamily(productLine);
  const priority = maybe(0.9) ? weightedPick(PRIORITIES) : undefined;
  const fallbackPriority = priority || weightedPick(PRIORITIES);
  const team = chooseAssignedTeam(productLine, tier, fallbackPriority, teams);

  const historyDays = randInt(0, 364);
  const baseDate = addDays(new Date(Date.UTC(2025, 0, 1)), historyDays);
  const createdAt = addHours(baseDate, randInt(0, 23));

  const status = weightedPick([
    { value: 'resolved', weight: 64 },
    { value: 'closed', weight: 24 },
    { value: 'open', weight: 8 },
    { value: 'new', weight: 4 }
  ]);

  const triagedAt = maybe(0.82) ? addHours(createdAt, randInt(0, 18)) : undefined;
  let resolvedAt;
  let resolution;
  if (status === 'resolved' || status === 'closed') {
    const durationMinHours = team.speedProfileHours[0];
    const durationMaxHours = team.speedProfileHours[1];
    const durationHours = randInt(durationMinHours, durationMaxHours) + rand();
    resolvedAt = new Date(createdAt.getTime() + durationHours * 60 * 60 * 1000);
    resolution = buildResolution(family);
  }

  const { subject, description } = buildTicketText(productLine, family, fallbackPriority, tier, status, true);
  const doc = {
    ticket_id: `HIST-${String(i + 1).padStart(6, '0')}`,
    subject,
    description,
    customer_account_tier: tier,
    product_line: productLine,
    status,
    assigned_team_id: team._id,
    created_at: createdAt,
    is_historical_import: true,
    ingest_batch_id: ingestBatchId,
    text_embedding: deterministicVector(`${subject} ${description}`, VECTOR_DIMS)
  };

  if (priority) doc.manual_priority = priority;
  const channel = maybeChannel();
  if (channel) doc.channel = channel;
  if (triagedAt) doc.triaged_at = triagedAt;
  if (resolvedAt) doc.resolved_at = resolvedAt;
  if (resolution) doc.resolution = resolution;

  return doc;
}

function generateLiveTicket(i, teams) {
  const productLine = weightedPick(PRODUCT_LINES);
  const tier = weightedPick(ACCOUNT_TIERS);
  const family = chooseIssueFamily(productLine);
  const manualPriority = maybe(0.78) ? weightedPick(PRIORITIES) : undefined;
  const effectivePriority = manualPriority || weightedPick(PRIORITIES);
  const assignedTeam = maybe(0.65) ? chooseAssignedTeam(productLine, tier, effectivePriority, teams) : undefined;
  const suggestedTeam = chooseAssignedTeam(productLine, tier, effectivePriority, teams);
  const createdAt = addHours(addDays(new Date(Date.UTC(2025, 11, 1)), randInt(0, 14)), randInt(0, 23));
  const triagedAt = maybe(0.35) ? addHours(createdAt, randInt(0, 6)) : undefined;
  const status = weightedPick([
    { value: 'new', weight: 45 },
    { value: 'open', weight: 55 }
  ]);

  const suggestedPriority = maybe(0.7)
    ? effectivePriority
    : pick(PRIORITIES.map(p => p.value).filter(v => v !== effectivePriority));

  const confidence = Number((0.48 + rand() * 0.49).toFixed(3));
  const { subject, description } = buildTicketText(productLine, family, effectivePriority, tier, status, false);

  const doc = {
    ticket_id: `LIVE-${String(i + 1).padStart(4, '0')}`,
    subject,
    description,
    customer_account_tier: tier,
    product_line: productLine,
    status,
    created_at: createdAt,
    is_historical_import: false,
    text_embedding: deterministicVector(`${subject} ${description}`, VECTOR_DIMS),
    triage_suggestion: {
      suggested_priority: suggestedPriority,
      suggested_team_id: suggestedTeam._id,
      generated_at: addHours(createdAt, randInt(0, 2)),
      model_version: 'triage-demo-v1',
      confidence
    }
  };

  if (manualPriority) doc.manual_priority = manualPriority;
  const channel = maybeChannel();
  if (channel) doc.channel = channel;
  if (assignedTeam) doc.assigned_team_id = assignedTeam._id;
  if (triagedAt) doc.triaged_at = triagedAt;

  return doc;
}

function aggregateMetricSnapshots(tickets, teams) {
  const snapshots = [];
  const teamMap = new Map(teams.map(t => [String(t._id), t]));
  const now = new Date();

  const byProduct = new Map();
  const byPriority = new Map();
  const byTeamResolution = new Map();

  for (const t of tickets) {
    const day = startOfDay(t.created_at).toISOString();

    const productKey = `${day}::${t.product_line}`;
    byProduct.set(productKey, (byProduct.get(productKey) || 0) + 1);

    const priorityValue = t.manual_priority || 'unassigned';
    const priorityKey = `${day}::${priorityValue}`;
    byPriority.set(priorityKey, (byPriority.get(priorityKey) || 0) + 1);

    if (t.assigned_team_id && t.resolved_at && (t.status === 'resolved' || t.status === 'closed')) {
      const teamId = String(t.assigned_team_id);
      const resolutionKey = `${day}::${teamId}`;
      const durationHours = (t.resolved_at.getTime() - t.created_at.getTime()) / (1000 * 60 * 60);
      const current = byTeamResolution.get(resolutionKey) || { sum: 0, count: 0 };
      current.sum += durationHours;
      current.count += 1;
      byTeamResolution.set(resolutionKey, current);
    }
  }

  for (const [key, value] of byProduct.entries()) {
    const [dayIso, productLine] = key.split('::');
    snapshots.push({
      metric_name: 'ticket_volume_by_product_line',
      time_bucket_start: new Date(dayIso),
      time_bucket_granularity: 'day',
      dimension_key: productLine,
      dimension_label: productLine,
      metric_value: value,
      last_computed_at: now
    });
  }

  for (const [key, value] of byPriority.entries()) {
    const [dayIso, priority] = key.split('::');
    snapshots.push({
      metric_name: 'ticket_volume_by_priority',
      time_bucket_start: new Date(dayIso),
      time_bucket_granularity: 'day',
      dimension_key: priority,
      dimension_label: priority,
      metric_value: value,
      last_computed_at: now
    });
  }

  for (const [key, value] of byTeamResolution.entries()) {
    const [dayIso, teamId] = key.split('::');
    const team = teamMap.get(teamId);
    snapshots.push({
      metric_name: 'avg_resolution_time_by_team',
      time_bucket_start: new Date(dayIso),
      time_bucket_granularity: 'day',
      dimension_key: team ? team.team_id : teamId,
      dimension_label: team ? team.name : teamId,
      metric_value: Number((value.sum / value.count).toFixed(2)),
      last_computed_at: now
    });
  }

  return snapshots;
}

async function recreateCollection(db, name) {
  const exists = await db.listCollections({ name }).hasNext();
  if (exists && DROP_EXISTING_COLLECTIONS) {
    await db.collection(name).drop();
  }
  if (!DROP_EXISTING_COLLECTIONS && exists) {
    await db.collection(name).deleteMany({});
  }
  const existsAfter = await db.listCollections({ name }).hasNext();
  if (!existsAfter) {
    await db.createCollection(name);
  }
}

async function createIndexes(db) {
  const tickets = db.collection('support_tickets');
  const teams = db.collection('support_teams');
  const snapshots = db.collection('dashboard_metric_snapshots');

  await tickets.createIndex({ ticket_id: 1 }, { unique: true, name: 'ux_ticket_id' });
  await tickets.createIndex({ status: 1, created_at: -1 }, { name: 'ix_status_created_at' });
  await tickets.createIndex({ product_line: 1, created_at: -1 }, { name: 'ix_product_line_created_at' });
  await tickets.createIndex({ assigned_team_id: 1, status: 1, created_at: -1 }, { name: 'ix_assigned_team_status_created_at' });
  await tickets.createIndex({ manual_priority: 1, created_at: -1 }, { name: 'ix_manual_priority_created_at' });
  await tickets.createIndex({ is_historical_import: 1, resolved_at: -1 }, { name: 'ix_historical_resolved_at' });

  await teams.createIndex({ team_id: 1 }, { unique: true, name: 'ux_team_id' });
  await teams.createIndex({ active: 1, name: 1 }, { name: 'ix_active_name' });

  await snapshots.createIndex(
    { metric_name: 1, time_bucket_granularity: 1, time_bucket_start: 1, dimension_key: 1 },
    { unique: true, name: 'ux_metric_bucket_dimension' }
  );
  await snapshots.createIndex({ metric_name: 1, time_bucket_start: -1 }, { name: 'ix_metric_name_time_bucket_start' });

  if (CREATE_SEARCH_INDEXES) {
    try {
      await tickets.createSearchIndex({
        name: 'support_ticket_text_search',
        definition: {
          mappings: {
            dynamic: false,
            fields: {
              subject: { type: 'string' },
              description: { type: 'string' },
              product_line: { type: 'string' },
              customer_account_tier: { type: 'string' },
              manual_priority: { type: 'string' },
              status: { type: 'string' },
              'resolution.summary': { type: 'string' },
              'resolution.category': { type: 'string' }
            }
          }
        }
      });
    } catch (err) {
      if (!String(err.message || '').includes('already exists')) throw err;
    }

    try {
      await db.command({
        createSearchIndexes: 'support_tickets',
        indexes: [
          {
            name: 'support_ticket_vector_index',
            definition: {
              fields: [
                {
                  type: 'vector',
                  path: 'text_embedding',
                  numDimensions: VECTOR_DIMS,
                  similarity: 'cosine'
                },
                {
                  type: 'filter',
                  path: 'product_line'
                },
                {
                  type: 'filter',
                  path: 'status'
                },
                {
                  type: 'filter',
                  path: 'is_historical_import'
                }
              ]
            }
          }
        ]
      });
    } catch (err) {
      if (!String(err.message || '').includes('already exists')) throw err;
    }

    if (ATLAS_SEARCH_INDEX_WAIT_MS > 0) {
      await sleep(ATLAS_SEARCH_INDEX_WAIT_MS);
    }
  }
}

async function insertInBatches(coll, docs) {
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    if (batch.length) {
      await coll.insertMany(batch, { ordered: true });
    }
  }
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(MONGODB_DB);
    const { ObjectId } = require('mongodb');

    await recreateCollection(db, 'support_tickets');
    await recreateCollection(db, 'support_teams');
    await recreateCollection(db, 'dashboard_metric_snapshots');

    const rawTeams = generateTeams(db);
    const teams = createTeamDocs(rawTeams, ObjectId).map(({ speedProfileHours, specialties, ...persisted }) => persisted);
    const enrichedTeams = teams.map((t, idx) => ({ ...t, speedProfileHours: rawTeams[idx].speedProfileHours, specialties: rawTeams[idx].specialties }));

    await db.collection('support_teams').insertMany(teams, { ordered: true });

    const ingestBatchId = `historical-${RANDOM_SEED.slice(0, 12)}`;
    const historicalTickets = [];
    for (let i = 0; i < config.historical; i++) {
      historicalTickets.push(generateHistoricalTicket(i, enrichedTeams, ingestBatchId));
    }

    const liveTickets = [];
    for (let i = 0; i < config.live; i++) {
      liveTickets.push(generateLiveTicket(i, enrichedTeams));
    }

    await insertInBatches(db.collection('support_tickets'), historicalTickets);
    await insertInBatches(db.collection('support_tickets'), liveTickets);

    const snapshots = aggregateMetricSnapshots(historicalTickets.concat(liveTickets), enrichedTeams);
    await insertInBatches(db.collection('dashboard_metric_snapshots'), snapshots);

    await createIndexes(db);

    console.log(JSON.stringify({
      ok: true,
      database: MONGODB_DB,
      support_teams: teams.length,
      support_tickets: historicalTickets.length + liveTickets.length,
      dashboard_metric_snapshots: snapshots.length,
      search_indexes_created: CREATE_SEARCH_INDEXES
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
