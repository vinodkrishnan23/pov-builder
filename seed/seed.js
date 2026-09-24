const { MongoClient } = require('mongodb');
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
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const DATASET_SIZE = process.env.DATASET_SIZE;
const DROP_EXISTING_COLLECTIONS = process.env.DROP_EXISTING_COLLECTIONS === 'true';
const CREATE_SEARCH_INDEXES = process.env.CREATE_SEARCH_INDEXES === 'true';
const ATLAS_SEARCH_INDEX_WAIT_MS = Number(process.env.ATLAS_SEARCH_INDEX_WAIT_MS);
const RNG_SEED = process.env.RANDOM_SEED;

const SIZE_CONFIG = {
  small: { tickets: 50000 },
  medium: { tickets: 65000 },
  large: { tickets: 80000 }
};

if (!SIZE_CONFIG[DATASET_SIZE]) {
  throw new Error(`Unsupported DATASET_SIZE: ${DATASET_SIZE}`);
}

class SeededRNG {
  constructor(seedText) {
    const hash = crypto.createHash('sha256').update(seedText).digest();
    this.state = [
      hash.readUInt32LE(0),
      hash.readUInt32LE(4),
      hash.readUInt32LE(8),
      hash.readUInt32LE(12)
    ];
  }

  next() {
    let [a, b, c, d] = this.state;
    const t = (a + b + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    this.state = [a, b, c, d];
    return (t >>> 0) / 4294967296;
  }

  int(min, maxInclusive) {
    return Math.floor(this.next() * (maxInclusive - min + 1)) + min;
  }

  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  }

  weightedPick(items) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let r = this.next() * total;
    for (const item of items) {
      r -= item.weight;
      if (r <= 0) return item.value;
    }
    return items[items.length - 1].value;
  }

  chance(probability) {
    return this.next() < probability;
  }
}

const CHANNELS = [
  { value: 'email', weight: 0.56 },
  { value: 'chat', weight: 0.27 },
  { value: 'phone', weight: 0.17 }
];

const ACCOUNT_TIERS = [
  { value: 'Enterprise', weight: 0.18 },
  { value: 'Business', weight: 0.32 },
  { value: 'Professional', weight: 0.28 },
  { value: 'Standard', weight: 0.16 },
  { value: 'Trial', weight: 0.06 }
];

const PRIORITIES = [
  { value: 'low', weight: 0.18 },
  { value: 'medium', weight: 0.43 },
  { value: 'high', weight: 0.27 },
  { value: 'urgent', weight: 0.12 }
];

const TRIAGE_USERS = ['agent.mora', 'agent.ng', 'agent.singh', 'lead.hughes', 'lead.romero'];
const MODEL_VERSIONS = ['triage-priority-v1.3', 'triage-priority-v1.4', 'routing-advisor-v2.1'];

const TEAM_SEED = [
  { team_code: 'BILL', name: 'Billing Operations', description: 'Handles invoices, credits, payment posting, tax, and subscription billing issues.', active: true },
  { team_code: 'TECH', name: 'Technical Support', description: 'Handles platform defects, outages, configuration errors, and troubleshooting.', active: true },
  { team_code: 'SHIP', name: 'Shipping & Logistics', description: 'Handles fulfillment status, shipment delays, carrier exceptions, and tracking.', active: true },
  { team_code: 'ACCT', name: 'Account Management', description: 'Handles account updates, entitlements, renewals, and customer administration.', active: true },
  { team_code: 'RETN', name: 'Returns & Exchanges', description: 'Handles return authorization, replacement requests, and damaged goods cases.', active: true },
  { team_code: 'INTG', name: 'Integrations Support', description: 'Handles API, connector, webhook, and third-party integration issues.', active: true },
  { team_code: 'AUTH', name: 'Identity & Access', description: 'Handles login, MFA, SSO, permissions, and access provisioning problems.', active: true },
  { team_code: 'DATA', name: 'Data Services', description: 'Handles import/export, sync quality, reporting data, and retention issues.', active: true },
  { team_code: 'ONBD', name: 'Onboarding Success', description: 'Handles setup guidance, implementation blockers, and training follow-up.', active: true },
  { team_code: 'COMP', name: 'Compliance Desk', description: 'Handles policy, audit evidence, and regulated workflow questions.', active: false }
];

const PRODUCT_LINES = [
  {
    name: 'Northwind Commerce Cloud',
    themes: [
      {
        key: 'checkout_latency',
        category: 'Performance degradation',
        defaultTeam: 'TECH',
        keywords: ['checkout', 'latency', 'cart', 'timeout'],
        subjects: [
          'Checkout page timing out during order submission',
          'Intermittent delay when customers complete checkout',
          'Cart submission stalls after payment confirmation'
        ],
        descriptions: [
          'Store operators are reporting that checkout requests are taking noticeably longer than usual, and some orders appear stuck before final confirmation.',
          'Customers can add items to cart, but the final checkout action hangs for several seconds before either failing or eventually completing.',
          'We are seeing repeated timeout behavior at the end of the purchase flow, especially during peak activity windows.'
        ],
        resolutions: [
          'Adjusted application cache configuration and recycled the affected checkout workers, which restored normal response time.',
          'Identified a runaway query in the order finalization path and applied the approved fix; transaction completion returned to baseline.',
          'Mitigated the slowdown by scaling the impacted service tier and clearing a blocked job queue.'
        ]
      },
      {
        key: 'promo_code_failure',
        category: 'Pricing / promotion issue',
        defaultTeam: 'BILL',
        keywords: ['promotion', 'coupon', 'discount', 'pricing'],
        subjects: [
          'Promotional discount not applying at checkout',
          'Coupon accepted but final total remains unchanged',
          'Bulk discount rule appears to be skipped'
        ],
        descriptions: [
          'Users enter a valid promotion code and the UI confirms it, but the order total does not recalculate with the expected discount.',
          'A scheduled campaign is active, yet eligible transactions are not receiving the promotional pricing configured in the admin panel.',
          'Discount logic appears inconsistent across storefront sessions, especially for repeat purchasers.'
        ],
        resolutions: [
          'Corrected the campaign rule scope and re-published the promotion, after which pricing recalculated correctly.',
          'Updated the affected tax-inclusive pricing flag that was preventing the coupon engine from applying the discount.',
          'Rebuilt the promotion cache and confirmed that eligible orders now receive the expected discount amount.'
        ]
      },
      {
        key: 'inventory_sync',
        category: 'Data synchronization issue',
        defaultTeam: 'DATA',
        keywords: ['inventory', 'sync', 'stock', 'catalog'],
        subjects: [
          'Inventory counts not syncing to storefront',
          'Catalog stock updates delayed after warehouse change',
          'Storefront still showing old availability levels'
        ],
        descriptions: [
          'Recent stock changes in the back-office system are not reflected on the storefront, leading to stale availability information.',
          'Warehouse adjustments were posted successfully, but the downstream inventory sync has not updated product availability for several hours.',
          'There is a mismatch between the catalog admin counts and what shoppers see on the site.'
        ],
        resolutions: [
          'Restarted the inventory synchronization pipeline and replayed the missed events to align storefront stock levels.',
          'Resolved a mapping issue in the product feed connector and confirmed that inventory updates are now processing normally.',
          'Cleared a failed batch in the synchronization queue and backfilled the missing stock updates.'
        ]
      },
      {
        key: 'duplicate_orders',
        category: 'Order processing issue',
        defaultTeam: 'TECH',
        keywords: ['duplicate', 'order', 'payment', 'retry'],
        subjects: [
          'Duplicate orders created from single customer checkout',
          'Order submitted twice after customer retry',
          'Seeing repeated order records for one transaction'
        ],
        descriptions: [
          'Multiple order records were created for what appears to be a single purchase attempt, and customers are worried about double charges.',
          'When checkout is slow, some customers click submit again and the platform is generating duplicate order entries.',
          'We found repeated order creation events tied to one browser session and matching basket contents.'
        ],
        resolutions: [
          'Applied the idempotency guard on the order submission endpoint and reversed the duplicated downstream actions.',
          'Corrected retry handling in the checkout workflow to prevent multiple order creation attempts from being processed.',
          'Confirmed duplicate requests were accepted during a service lag; patched the validation rule and monitored successful recovery.'
        ]
      }
    ]
  },
  {
    name: 'Northwind Service Hub',
    themes: [
      {
        key: 'login_mfa',
        category: 'Authentication problem',
        defaultTeam: 'AUTH',
        keywords: ['login', 'mfa', 'auth', 'access'],
        subjects: [
          'Users blocked by MFA challenge loop',
          'Cannot sign in after recent password reset',
          'Service Hub login repeatedly redirects to authentication screen'
        ],
        descriptions: [
          'End users are being prompted for MFA repeatedly and cannot complete sign-in even with valid credentials.',
          'After a password reset, affected users are redirected back to the login page without an actionable error message.',
          'The sign-in flow appears to succeed briefly, but the session is not established and the application returns to the auth screen.'
        ],
        resolutions: [
          'Cleared the impacted identity session cache and re-synced the tenant authentication policy, restoring access.',
          'Corrected a tenant-level SSO setting that was causing the MFA callback to fail validation.',
          'Reset the affected identity provider trust metadata and confirmed successful login for test accounts.'
        ]
      },
      {
        key: 'role_permissions',
        category: 'Permissions / access issue',
        defaultTeam: 'AUTH',
        keywords: ['permission', 'role', 'access', 'authorization'],
        subjects: [
          'Manager role missing expected permissions',
          'Users can no longer access admin reporting screens',
          'Role assignment not granting configured access'
        ],
        descriptions: [
          'Accounts assigned to a standard managerial role are missing menu options and actions that were previously available.',
          'Several users report permission errors when opening reporting modules despite recent role updates.',
          'Role assignments appear correct in configuration, but downstream authorization checks are still denying access.'
        ],
        resolutions: [
          'Republished the role policy bundle and invalidated stale authorization caches, which restored the expected permissions.',
          'Corrected the environment-specific role mapping and verified access for affected users.',
          'Updated the access control ruleset and re-applied the role assignment sync job.'
        ]
      },
      {
        key: 'case_assignment',
        category: 'Workflow configuration issue',
        defaultTeam: 'ACCT',
        keywords: ['assignment', 'queue', 'workflow', 'case'],
        subjects: [
          'Incoming cases not routing to the right queue',
          'Workflow assignment rule appears to be misfiring',
          'New cases bypassing configured ownership logic'
        ],
        descriptions: [
          'Support cases are being created successfully, but assignment rules are routing them to a fallback queue instead of the intended team.',
          'Recent workflow updates appear to have changed queue behavior, and new records are no longer landing with the configured owners.',
          'The assignment engine is not matching the expected conditions for incoming cases.'
        ],
        resolutions: [
          'Corrected the queue rule condition order and reactivated the workflow set, restoring normal routing behavior.',
          'Repaired a missing owner mapping in the case assignment configuration and validated end-to-end routing.',
          'Adjusted workflow precedence so the targeted queue rule is evaluated before the generic fallback path.'
        ]
      },
      {
        key: 'report_export',
        category: 'Reporting / export issue',
        defaultTeam: 'DATA',
        keywords: ['report', 'export', 'csv', 'download'],
        subjects: [
          'Scheduled report export failing overnight',
          'CSV export completes with missing columns',
          'Users unable to download large activity report'
        ],
        descriptions: [
          'Automated exports are failing during the overnight schedule and no file is being delivered to the destination mailbox.',
          'Downloaded reports are missing fields that are available in the on-screen report view.',
          'Large exports either timeout or produce incomplete files when users request broad date ranges.'
        ],
        resolutions: [
          'Increased the export worker timeout and corrected the column mapping template used by scheduled jobs.',
          'Resolved an issue in the reporting serializer and re-ran the failed export batch successfully.',
          'Split oversized export jobs into staged segments and confirmed stable file generation.'
        ]
      }
    ]
  },
  {
    name: 'Northwind Integrations Gateway',
    themes: [
      {
        key: 'api_rate_limit',
        category: 'API / integration error',
        defaultTeam: 'INTG',
        keywords: ['api', 'rate limit', '429', 'integration'],
        subjects: [
          'Partner integration receiving unexpected rate limit responses',
          'API calls spiking with HTTP 429 errors',
          'Webhook consumer blocked by throttling threshold'
        ],
        descriptions: [
          'A connected external integration is receiving rate limit responses at traffic levels that were previously handled without issue.',
          'The API is returning 429 errors for a burst of requests associated with a partner sync process.',
          'Webhook processing appears healthy, but follow-up API requests are being throttled aggressively.'
        ],
        resolutions: [
          'Adjusted the client-specific burst allowance and confirmed traffic is now processed within the intended threshold.',
          'Fixed an integration retry loop that was multiplying request volume and exhausting the rate budget.',
          'Updated throttling configuration for the affected tenant and validated stable request success rates.'
        ]
      },
      {
        key: 'webhook_delivery',
        category: 'Webhook delivery failure',
        defaultTeam: 'INTG',
        keywords: ['webhook', 'delivery', 'callback', 'retry'],
        subjects: [
          'Webhook events delayed or not delivered',
          'Partner callback endpoint not receiving order events',
          'Repeated webhook retry notices for same subscriber'
        ],
        descriptions: [
          'Subscribers report missing event notifications, and several webhook deliveries have remained in retry state longer than expected.',
          'Order events are generated internally but are not consistently reaching the registered callback endpoint.',
          'The event delivery log shows repeated retries for a subset of webhook subscriptions.'
        ],
        resolutions: [
          'Corrected the destination certificate validation issue and replayed queued webhook events successfully.',
          'Resolved a malformed payload mapping that was causing downstream callback rejections.',
          'Paused the failing subscriber, cleared the stuck retry backlog, and confirmed healthy subsequent deliveries.'
        ]
      },
      {
        key: 'connector_auth',
        category: 'Connector authentication issue',
        defaultTeam: 'INTG',
        keywords: ['connector', 'oauth', 'token', 'authentication'],
        subjects: [
          'CRM connector losing authentication after token refresh',
          'Connected app requires reauthorization unexpectedly',
          'OAuth integration failing during scheduled sync'
        ],
        descriptions: [
          'A previously healthy connector is prompting for reauthorization and scheduled synchronization jobs are failing.',
          'The integration token refresh process appears to complete, but subsequent API calls are unauthorized.',
          'Connected app credentials look valid, yet the sync job is rejected after the next refresh cycle.'
        ],
        resolutions: [
          'Repaired the token refresh callback configuration and confirmed successful connector authentication renewal.',
          'Updated the connector credential scope and restarted the scheduled synchronization worker.',
          'Resolved an encrypted secret rotation mismatch that was invalidating refreshed tokens.'
        ]
      },
      {
        key: 'schema_mapping',
        category: 'Data mapping issue',
        defaultTeam: 'DATA',
        keywords: ['mapping', 'schema', 'field', 'transform'],
        subjects: [
          'Field mapping mismatch in integration payload',
          'Partner data arriving in wrong schema version',
          'Transformation rule dropping expected values'
        ],
        descriptions: [
          'Inbound records are accepted, but mapped fields are landing in incorrect attributes or are missing after transformation.',
          'The current payload schema differs from the configured integration mapping and downstream processing is inconsistent.',
          'Data values appear to be dropped during the transformation step for a subset of mapped fields.'
        ],
        resolutions: [
          'Updated the schema translation rules and replayed the impacted records through the corrected mapping.',
          'Aligned the connector field mapping with the partner payload version now in use.',
          'Patched the transformation template and verified end-to-end data integrity.'
        ]
      }
    ]
  },
  {
    name: 'Northwind Fulfillment Suite',
    themes: [
      {
        key: 'shipment_delay',
        category: 'Shipment delay',
        defaultTeam: 'SHIP',
        keywords: ['shipment', 'delay', 'tracking', 'carrier'],
        subjects: [
          'Shipment tracking has not updated for multiple days',
          'Orders showing carrier delay exception',
          'Fulfillment completed but shipment remains in transit'
        ],
        descriptions: [
          'Customers are asking for updates because tracking has been unchanged for an extended period beyond the expected transit window.',
          'Several recent orders show carrier exceptions and delivery estimates continue to slip.',
          'Fulfillment was completed internally, but downstream tracking data suggests the shipment is stalled in transit.'
        ],
        resolutions: [
          'Worked with the carrier interface to refresh stale tracking events and updated the affected shipment statuses.',
          'Identified a carrier handoff delay and issued replacement shipping updates to impacted orders.',
          'Resolved a label transmission failure that prevented the latest tracking scan from posting correctly.'
        ]
      },
      {
        key: 'return_label',
        category: 'Returns processing issue',
        defaultTeam: 'RETN',
        keywords: ['return', 'label', 'rma', 'exchange'],
        subjects: [
          'Customer unable to generate return label',
          'Return authorization request remains pending',
          'Exchange workflow not issuing shipping label'
        ],
        descriptions: [
          'The self-service return flow does not generate a label after the return request is approved.',
          'Customers can submit a return request, but the authorization remains pending and no shipping instructions are sent.',
          'Exchange requests are accepted, but the label generation step fails before completion.'
        ],
        resolutions: [
          'Repaired the return label service integration and reissued labels for the impacted requests.',
          'Corrected the return eligibility rule preventing automatic authorization from completing.',
          'Reprocessed the failed return batch and confirmed label generation for new requests.'
        ]
      },
      {
        key: 'address_validation',
        category: 'Address validation issue',
        defaultTeam: 'SHIP',
        keywords: ['address', 'validation', 'shipping', 'order'],
        subjects: [
          'Valid shipping addresses rejected during checkout',
          'Address verification service flagging common addresses as invalid',
          'Orders blocked by address validation mismatch'
        ],
        descriptions: [
          'Customers with valid delivery addresses are being blocked because the verification service rejects the address format.',
          'Address normalization changed recently and now common customer addresses are failing validation unexpectedly.',
          'Orders cannot proceed because shipping address validation returns a mismatch despite known-good inputs.'
        ],
        resolutions: [
          'Adjusted the address normalization rules and confirmed successful validation for the affected formats.',
          'Corrected the postal-code parsing issue that was causing false validation failures.',
          'Rolled back the recent address verification change and restored normal checkout behavior.'
        ]
      },
      {
        key: 'warehouse_sync',
        category: 'Warehouse integration issue',
        defaultTeam: 'SHIP',
        keywords: ['warehouse', 'sync', 'fulfillment', 'status'],
        subjects: [
          'Fulfillment status not syncing from warehouse system',
          'Warehouse updates delayed in order management view',
          'Packed orders still showing unfulfilled status'
        ],
        descriptions: [
          'Warehouse operations are completing as expected, but order status updates are not appearing in the customer-facing system.',
          'There is a lag between warehouse scans and order management visibility, creating confusion for support agents.',
          'Packed orders remain marked as unfulfilled despite confirmed downstream completion events.'
        ],
        resolutions: [
          'Restarted the warehouse event consumer and backfilled the missed fulfillment updates.',
          'Corrected an integration endpoint change between the warehouse system and order platform.',
          'Resolved a message parsing issue in the fulfillment status bridge and replayed delayed events.'
        ]
      }
    ]
  },
  {
    name: 'Northwind Analytics Studio',
    themes: [
      {
        key: 'dashboard_refresh',
        category: 'Dashboard data freshness issue',
        defaultTeam: 'DATA',
        keywords: ['dashboard', 'refresh', 'stale', 'analytics'],
        subjects: [
          'Analytics dashboard not reflecting latest activity',
          'Executive dashboard appears several hours behind',
          'KPI tiles stale after recent data loads'
        ],
        descriptions: [
          'Users report that dashboard metrics are not updating on the expected cadence and key visualizations appear stale.',
          'Latest transactional data is available elsewhere, but summary dashboards still show older counts and totals.',
          'The analytics refresh schedule may be delayed because recent activity is not visible in dashboard widgets.'
        ],
        resolutions: [
          'Restarted the incremental refresh pipeline and validated current data in the impacted dashboards.',
          'Corrected the failed warehouse load dependency that was blocking the dashboard refresh cycle.',
          'Resolved a stuck analytics cache invalidation task and confirmed KPI updates.'
        ]
      },
      {
        key: 'scheduled_email',
        category: 'Notification delivery issue',
        defaultTeam: 'ACCT',
        keywords: ['email', 'schedule', 'notification', 'report'],
        subjects: [
          'Scheduled analytics emails not being delivered',
          'Subscribers missing their weekly dashboard digest',
          'Report subscription emails delayed or skipped'
        ],
        descriptions: [
          'Configured report subscriptions are not reaching recipients on schedule, even though the subscription remains active.',
          'Several dashboard digest emails were expected but were not delivered during the last scheduled run.',
          'Notification jobs completed with warnings and some scheduled report emails were skipped.'
        ],
        resolutions: [
          'Corrected the mail delivery queue configuration and reissued the missed subscription notifications.',
          'Resolved an expired sender credential used by the scheduled email service.',
          'Cleared the failed notification backlog and confirmed timely delivery of subsequent report digests.'
        ]
      },
      {
        key: 'query_timeout',
        category: 'Query performance issue',
        defaultTeam: 'TECH',
        keywords: ['query', 'timeout', 'report', 'performance'],
        subjects: [
          'Large analytics query timing out',
          'Ad hoc report fails on broader date range',
          'Performance issue when filtering dashboard by multiple segments'
        ],
        descriptions: [
          'Users running broader reports encounter timeouts before results are rendered, especially with several filters applied.',
          'Analytics queries that previously completed are now timing out when date ranges are expanded.',
          'Dashboard filtering becomes slow or fails entirely for complex segment combinations.'
        ],
        resolutions: [
          'Optimized the reporting query path and increased the execution threshold for the affected workload.',
          'Added the missing aggregation support index in the reporting backend and restored acceptable response times.',
          'Adjusted a regression in the filter planner and confirmed stable performance for the reported query patterns.'
        ]
      },
      {
        key: 'data_discrepancy',
        category: 'Data accuracy concern',
        defaultTeam: 'DATA',
        keywords: ['data', 'discrepancy', 'metric', 'count'],
        subjects: [
          'Metric totals do not match source system',
          'Revenue summary differs from exported transaction data',
          'Dashboard count mismatch after recent load'
        ],
        descriptions: [
          'Business users found that dashboard totals differ from source records and want the discrepancy investigated.',
          'A summary metric on the dashboard does not reconcile with the corresponding exported transaction dataset.',
          'Recent reporting loads may have introduced duplicate or missing records in dashboard aggregates.'
        ],
        resolutions: [
          'Identified duplicate staging records in the latest load and corrected the aggregation results.',
          'Backfilled a missed partition in the analytics pipeline and reconciled the metric totals.',
          'Fixed a transformation bug in the reporting model and validated the corrected counts with sample data.'
        ]
      }
    ]
  }
];

const CATEGORY_POOL = [
  'Performance degradation',
  'Pricing / promotion issue',
  'Data synchronization issue',
  'Order processing issue',
  'Authentication problem',
  'Permissions / access issue',
  'Workflow configuration issue',
  'Reporting / export issue',
  'API / integration error',
  'Webhook delivery failure',
  'Connector authentication issue',
  'Data mapping issue',
  'Shipment delay',
  'Returns processing issue',
  'Address validation issue',
  'Warehouse integration issue',
  'Dashboard data freshness issue',
  'Notification delivery issue',
  'Query performance issue',
  'Data accuracy concern'
];

function createEmbedding(text, dimensions = 24) {
  const vec = new Array(dimensions).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % dimensions] += ((text.charCodeAt(i) % 29) - 14) / 17;
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map(v => Number((v / norm).toFixed(6)));
}

function stableHashInt(input) {
  const hash = crypto.createHash('sha256').update(input).digest();
  return hash.readUInt32LE(0);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureCollection(db, name) {
  const existing = await db.listCollections({ name }).toArray();
  if (existing.length === 0) {
    await db.createCollection(name);
  }
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function pickThemeForProduct(rng, product) {
  return rng.pick(product.themes);
}

function maybeNearDuplicate(rng, description, subject) {
  if (!rng.chance(0.08)) return { subject, description };
  const suffixes = [
    'Issue still occurring after retry.',
    'This started again after a recent configuration update.',
    'Customer asked for urgent follow-up from support.',
    'Behavior reproduced in two separate user sessions.',
    'Same issue observed by another team member this morning.'
  ];
  return {
    subject,
    description: `${description} ${rng.pick(suffixes)}`
  };
}

function maybeAmbiguousDescription(rng, baseDescription, productName) {
  if (!rng.chance(0.06)) return baseDescription;
  const ambiguity = [
    'The reporting from the customer is partial, and the issue may involve more than one workflow depending on tenant configuration.',
    'Symptoms overlap with a recent access-policy change, so the exact root cause was not immediately obvious.',
    'Initial triage suggested multiple possible causes across application behavior and downstream integration timing.',
    `The issue appears to span ${productName} configuration and a related operational process, which made classification less straightforward.`
  ];
  return `${baseDescription} ${rng.pick(ambiguity)}`;
}

function createSubjectAndDescription(rng, product, theme, ticketNumber) {
  const subject = rng.pick(theme.subjects);
  let description = rng.pick(theme.descriptions);
  if (rng.chance(0.18)) {
    description += ` Reference sample ${ticketNumber % 97} observed in the representative demo tenant.`;
  }
  description = maybeAmbiguousDescription(rng, description, product.name);
  return maybeNearDuplicate(rng, description, subject);
}

function choosePriority(rng, themeKey) {
  if (['checkout_latency', 'duplicate_orders', 'login_mfa', 'shipment_delay', 'api_rate_limit', 'query_timeout'].includes(themeKey)) {
    return rng.weightedPick([
      { value: 'medium', weight: 0.28 },
      { value: 'high', weight: 0.46 },
      { value: 'urgent', weight: 0.18 },
      { value: 'low', weight: 0.08 }
    ]);
  }
  return rng.weightedPick(PRIORITIES);
}

function resolutionDelayMinutes(rng, priority, tier) {
  const baseByPriority = {
    low: [8 * 60, 14 * 24 * 60],
    medium: [2 * 60, 8 * 24 * 60],
    high: [45, 5 * 24 * 60],
    urgent: [15, 2 * 24 * 60]
  };
  let [minMins, maxMins] = baseByPriority[priority] || [60, 5 * 24 * 60];
  if (tier === 'Enterprise') {
    minMins = Math.max(10, Math.floor(minMins * 0.7));
    maxMins = Math.max(minMins + 30, Math.floor(maxMins * 0.65));
  }
  if (tier === 'Trial') {
    maxMins = Math.floor(maxMins * 1.15);
  }
  return rng.int(minMins, maxMins);
}

function buildPrioritySuggestion(rng, actualPriority, createdAt) {
  const same = rng.chance(0.78);
  const suggested = same ? actualPriority : rng.weightedPick(PRIORITIES.filter(p => p.value !== actualPriority));
  return {
    value: suggested,
    confidence: Number((0.51 + rng.next() * 0.47).toFixed(3)),
    generated_at: addMinutes(createdAt, rng.int(1, 240)),
    model_version: rng.pick(['triage-priority-v1.3', 'triage-priority-v1.4'])
  };
}

function buildRoutingSuggestion(rng, teamIdsByCode, actualTeamId, createdAt) {
  const teamCodes = Object.keys(teamIdsByCode);
  let chosenCode;
  if (actualTeamId && rng.chance(0.74)) {
    chosenCode = teamCodes.find(code => String(teamIdsByCode[code]) === String(actualTeamId));
  }
  if (!chosenCode) {
    chosenCode = rng.pick(teamCodes);
  }
  return {
    team_id: teamIdsByCode[chosenCode],
    confidence: Number((0.48 + rng.next() * 0.49).toFixed(3)),
    generated_at: addMinutes(createdAt, rng.int(1, 180)),
    model_version: 'routing-advisor-v2.1',
    advisory_only: rng.chance(0.22)
  };
}

function createIndexes(db, createSearchIndexes) {
  return Promise.all([
    db.collection('support_tickets').createIndex({ ticket_id: 1 }, { name: 'ux_ticket_id', unique: true }),
    db.collection('support_tickets').createIndex({ status: 1, created_at: -1 }, { name: 'queue_status_createdAt' }),
    db.collection('support_tickets').createIndex({ product_line: 1, created_at: -1 }, { name: 'dashboard_productLine_createdAt' }),
    db.collection('support_tickets').createIndex({ priority: 1, created_at: -1 }, { name: 'dashboard_priority_createdAt' }),
    db.collection('support_tickets').createIndex({ routing_team_id: 1, resolved_at: -1 }, { name: 'dashboard_team_resolvedAt' }),
    db.collection('support_tickets').createIndex({ status: 1, resolved_at: -1 }, { name: 'resolved_lookup' }),
    db.collection('support_teams').createIndex({ team_code: 1 }, { name: 'ux_team_code', unique: true }),
    db.collection('support_teams').createIndex({ name: 1 }, { name: 'ux_team_name', unique: true })
  ]).then(async () => {
    if (!createSearchIndexes) return;

    const tickets = db.collection('support_tickets');

    try {
      await tickets.createSearchIndex({
        name: 'ticket_text_search',
        definition: {
          mappings: {
            dynamic: false,
            fields: {
              subject: { type: 'string' },
              description: { type: 'string' },
              text_combined: { type: 'string' },
              resolution_summary: { type: 'string' },
              product_line: { type: 'string' },
              resolution_category: { type: 'string' }
            }
          }
        }
      });
    } catch (err) {
      if (!String(err.message || '').includes('already exists')) throw err;
    }

    try {
      await tickets.createSearchIndex({
        name: 'ticket_similarity_vector',
        type: 'vectorSearch',
        definition: {
          fields: [
            {
              type: 'vector',
              path: 'embedding',
              numDimensions: 24,
              similarity: 'cosine'
            },
            {
              type: 'filter',
              path: 'status'
            },
            {
              type: 'filter',
              path: 'product_line'
            },
            {
              type: 'filter',
              path: 'routing_team_id'
            }
          ]
        }
      });
    } catch (err) {
      if (!String(err.message || '').includes('already exists')) throw err;
    }

    if (ATLAS_SEARCH_INDEX_WAIT_MS > 0) {
      await wait(ATLAS_SEARCH_INDEX_WAIT_MS);
    }
  });
}

async function dropIfRequested(db, collectionName) {
  const exists = (await db.listCollections({ name: collectionName }).toArray()).length > 0;
  if (!exists) return;
  if (DROP_EXISTING_COLLECTIONS) {
    await db.collection(collectionName).drop();
  }
}

async function seed() {
  const client = new MongoClient(process.env.MONGODB_URI);
  const rng = new SeededRNG(RNG_SEED);

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);

    await dropIfRequested(db, 'support_tickets');
    await dropIfRequested(db, 'support_teams');
    await ensureCollection(db, 'support_teams');
    await ensureCollection(db, 'support_tickets');

    const supportTeams = TEAM_SEED.map(team => ({ ...team }));
    await db.collection('support_teams').deleteMany({});
    const teamInsert = await db.collection('support_teams').insertMany(supportTeams, { ordered: true });
    const teamIds = Object.values(teamInsert.insertedIds);
    const teamsWithIds = supportTeams.map((team, idx) => ({ ...team, _id: teamIds[idx] }));
    const teamIdsByCode = Object.fromEntries(teamsWithIds.map(team => [team.team_code, team._id]));

    await db.collection('support_tickets').deleteMany({});

    const totalTickets = SIZE_CONFIG[DATASET_SIZE].tickets;
    const resolvedTarget = Math.floor(totalTickets * 0.88);
    const queueTarget = totalTickets - resolvedTarget;
    const now = new Date();
    const startDate = new Date(now.getTime() - 18 * 30 * 24 * 60 * 60 * 1000);
    const unresolvedRecentStart = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const ingestBatchId = `seed-${RNG_SEED}-${DATASET_SIZE}`;

    const ticketBulk = [];
    const batchSize = 1000;

    for (let i = 0; i < totalTickets; i++) {
      const isResolved = i < resolvedTarget;
      const ticketNumber = i + 1;
      const product = rng.pick(PRODUCT_LINES);
      const theme = pickThemeForProduct(rng, product);
      const channel = rng.weightedPick(CHANNELS);
      const accountTier = rng.weightedPick(ACCOUNT_TIERS);
      const createdAt = isResolved
        ? new Date(startDate.getTime() + rng.next() * (now.getTime() - 7 * 24 * 60 * 60 * 1000 - startDate.getTime()))
        : new Date(unresolvedRecentStart.getTime() + rng.next() * (now.getTime() - unresolvedRecentStart.getTime()));

      const { subject, description } = createSubjectAndDescription(rng, product, theme, ticketNumber);
      const textCombined = `${subject}\n\n${description}`;
      const actualPriority = choosePriority(rng, theme.key);
      const status = isResolved ? 'resolved' : rng.chance(0.57) ? 'new' : 'open';

      let routingTeamId = null;
      if (isResolved) {
        routingTeamId = rng.chance(0.93) ? teamIdsByCode[theme.defaultTeam] : teamIdsByCode[rng.pick(Object.keys(teamIdsByCode))];
      } else if (rng.chance(0.18)) {
        routingTeamId = teamIdsByCode[theme.defaultTeam];
      }

      const ticket = {
        ticket_id: `NW-TKT-${String(ticketNumber).padStart(6, '0')}`,
        channel,
        subject,
        description,
        text_combined: textCombined,
        customer_account_tier: accountTier,
        product_line: product.name,
        status,
        created_at: createdAt,
        ingest_batch_id: ingestBatchId,
        metadata: {
          source_system: 'northwind_demo_import',
          is_historical_seed: isResolved
        }
      };

      const shouldStorePriority = isResolved ? rng.chance(0.95) : rng.chance(0.18);
      if (shouldStorePriority) {
        ticket.priority = actualPriority;
      }

      const shouldStorePrioritySuggestion = !isResolved || rng.chance(0.28);
      if (shouldStorePrioritySuggestion) {
        ticket.priority_suggestion = buildPrioritySuggestion(rng, actualPriority, createdAt);
      }

      const shouldStoreRoutingSuggestion = !isResolved || rng.chance(0.31);
      if (shouldStoreRoutingSuggestion) {
        ticket.routing_suggestion = buildRoutingSuggestion(rng, teamIdsByCode, routingTeamId, createdAt);
      }

      if (routingTeamId) {
        ticket.routing_team_id = routingTeamId;
      }

      if (isResolved) {
        const resolutionMinutes = resolutionDelayMinutes(rng, actualPriority, accountTier);
        const resolvedAt = addMinutes(createdAt, resolutionMinutes);
        ticket.resolved_at = resolvedAt;
        ticket.resolution_category = theme.category;
        ticket.resolution_summary = rng.pick(theme.resolutions) + (rng.chance(0.32)
          ? ` Customer confirmed normal behavior after validation on ${product.name}.`
          : rng.chance(0.22)
            ? ' Monitoring recommendation shared with the account team for follow-up.'
            : '');
        if (rng.chance(0.36)) {
          ticket.triage = {
            triaged_at: addMinutes(createdAt, rng.int(5, 720)),
            triaged_by: rng.pick(TRIAGE_USERS),
            notes: rng.pick([
              'Classified from historical issue pattern and linked to known resolution path.',
              'Escalated after initial review due to customer impact and repeat symptom cluster.',
              'Matched similar prior incident and routed using previous successful resolution ownership.',
              'Reviewed with queue lead because symptoms overlapped multiple support domains.'
            ])
          };
        }
        ticket.embedding = createEmbedding(`${textCombined}\n${ticket.resolution_summary}\n${theme.key}`);
      } else {
        if (rng.chance(0.24)) {
          ticket.triage = {
            triaged_at: addMinutes(createdAt, rng.int(10, 360)),
            triaged_by: rng.pick(TRIAGE_USERS),
            notes: rng.pick([
              'Awaiting confirmation from customer on reproduction steps.',
              'Suggested route differs from prior manual queue assignment for review.',
              'Potential duplicate of recent issue cluster, pending similar-ticket review.',
              'Initial signals point to integration timing, but ownership remains under review.'
            ])
          };
        }
        if (rng.chance(0.82)) {
          ticket.embedding = createEmbedding(`${textCombined}\n${theme.key}`);
        }
      }

      if (!CATEGORY_POOL.includes(theme.category)) {
        throw new Error(`Theme category missing from category pool: ${theme.category}`);
      }

      ticketBulk.push({ insertOne: { document: ticket } });

      if (ticketBulk.length === batchSize || i === totalTickets - 1) {
        await db.collection('support_tickets').bulkWrite(ticketBulk, { ordered: false });
        ticketBulk.length = 0;
      }
    }

    await createIndexes(db, CREATE_SEARCH_INDEXES);

    console.log(JSON.stringify({
      ok: true,
      database: process.env.MONGODB_DB,
      seeded_collections: ['support_teams', 'support_tickets'],
      support_teams: TEAM_SEED.length,
      support_tickets: totalTickets,
      resolved_tickets: resolvedTarget,
      unresolved_tickets: queueTarget,
      search_indexes_created: CREATE_SEARCH_INDEXES
    }, null, 2));
  } finally {
    await client.close();
  }
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
