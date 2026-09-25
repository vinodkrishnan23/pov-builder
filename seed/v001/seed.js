"use strict";

const { MongoClient, ObjectId } = require("mongodb");
const { createHash } = require("node:crypto");

const mongodbUri = process.env.MONGODB_URI;
const databaseNameInput = process.env.DB_NAME;
const maxDocsInput = process.env.SEED_MAX_DOCS;
const collectionCapsInput = process.env.SEED_COLLECTION_CAPS;

const COLLECTIONS = [
  "customers",
  "admin_users",
  "policies",
  "policy_versions",
  "execution_requests",
  "execution_rule_steps",
  "execution_insights"
];

const REQUESTED_COUNTS = Object.freeze({
  customers: 20,
  admin_users: 20,
  policies: 20,
  policy_versions: 20,
  execution_requests: 20,
  execution_rule_steps: 20,
  execution_insights: 20
});

// The data model declares no ordinary indexes. This map is retained so index
// creation remains an explicit part of the deterministic collection lifecycle.
const ORDINARY_INDEXES = Object.freeze({
  customers: [],
  admin_users: [],
  policies: [],
  policy_versions: [],
  execution_requests: [],
  execution_rule_steps: [],
  execution_insights: []
});

function nonNegativeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return parsed;
}

function readLimits() {
  const maxDocs = maxDocsInput === undefined || maxDocsInput === ""
    ? 20
    : nonNegativeInteger(maxDocsInput, "SEED_MAX_DOCS");

  let caps = {};
  if (collectionCapsInput !== undefined && collectionCapsInput !== "") {
    const parsed = JSON.parse(collectionCapsInput);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("SEED_COLLECTION_CAPS must be a JSON object");
    }
    caps = parsed;
  }

  const counts = {};
  for (const name of COLLECTIONS) {
    let cap = maxDocs;
    if (Object.prototype.hasOwnProperty.call(caps, name)) {
      cap = Math.min(cap, nonNegativeInteger(caps[name], `cap for ${name}`));
    }
    counts[name] = Math.min(REQUESTED_COUNTS[name], maxDocs, cap);
  }
  return counts;
}

function deterministicObjectId(collection, index) {
  const hex = createHash("sha256")
    .update(`seed-42:${collection}:${index}`)
    .digest("hex")
    .slice(0, 24);
  return new ObjectId(hex);
}

function dateAt(index, minuteOffset = 0) {
  return new Date(Date.UTC(2024, 0, 1, 0, minuteOffset + index, 0));
}

function customerId(index) {
  return `customer-${String(index % 20).padStart(3, "0")}`;
}

function policyId(index) {
  return `policy-${String(index % 20).padStart(3, "0")}`;
}

function policyVersionId(index) {
  return `policy-version-${String(index % 20).padStart(3, "0")}`;
}

function requestId(index) {
  return `request-${String(index).padStart(4, "0")}`;
}

const builders = {
  customers(index) {
    return {
      _id: deterministicObjectId("customers", index),
      customer_id: customerId(index),
      name: `Customer ${String(index).padStart(3, "0")}`,
      industry: ["financial_services", "insurance", "retail"][index % 3],
      deployment_cloud: ["aws", "azure", "other"][index % 3],
      logging_enabled: index % 4 !== 0,
      retention_days: 30 + (index % 4) * 30,
      purge_after: dateAt(index, 525600),
      created_at: dateAt(index),
      updated_at: dateAt(index, 60)
    };
  },

  admin_users(index) {
    return {
      _id: deterministicObjectId("admin_users", index),
      user_id: `user-${String(index).padStart(3, "0")}`,
      customer_id: customerId(index),
      name: `Administrator ${String(index).padStart(3, "0")}`,
      email: `admin${index}@example.invalid`,
      roles: index % 2 === 0 ? ["admin", "auditor"] : ["operator"],
      is_active: index % 5 !== 0,
      created_at: dateAt(index, 120),
      updated_at: dateAt(index, 180)
    };
  },

  policies(index) {
    return {
      _id: deterministicObjectId("policies", index),
      policy_id: policyId(index),
      customer_id: customerId(index),
      policy_name: `Eligibility Policy ${String(index).padStart(3, "0")}`,
      service_name: `eligibility-service-${index % 4}`,
      service_endpoint: `/rules/eligibility/${index}`,
      status: ["draft", "published", "retired"][index % 3],
      created_at: dateAt(index, 240),
      updated_at: dateAt(index, 300)
    };
  },

  policy_versions(index) {
    return {
      _id: deterministicObjectId("policy_versions", index),
      policy_version_id: policyVersionId(index),
      policy_id: policyId(index),
      customer_id: customerId(index),
      version_label: `v${1 + (index % 5)}.0`,
      version_number: 1 + (index % 5),
      published_at: dateAt(index, 360),
      is_active: index % 3 !== 0,
      rule_definitions: [
        {
          rule_id: `rule-${String(index).padStart(3, "0")}-01`,
          rule_name: `Eligibility threshold ${index}`,
          sequence: 1,
          description: `Deterministic rule definition ${index}`
        },
        {
          rule_id: `rule-${String(index).padStart(3, "0")}-02`,
          rule_name: `Risk classification ${index}`,
          sequence: 2,
          description: `Deterministic follow-up rule ${index}`
        }
      ]
    };
  },

  execution_requests(index) {
    const status = ["in_progress", "completed", "failed"][index % 3];
    return {
      _id: deterministicObjectId("execution_requests", index),
      request_id: requestId(index),
      correlation_id: `correlation-${String(index).padStart(4, "0")}`,
      customer_id: customerId(index),
      policy_id: policyId(index),
      policy_version_id: policyVersionId(index),
      service_context: {
        channel: ["api", "batch", "portal"][index % 3],
        source_application: `application-${index % 5}`,
        endpoint: `/evaluate/${index % 4}`
      },
      request_received_at: dateAt(index, 420),
      request_payload: {
        applicant: {
          reference: `applicant-${index}`,
          age: 21 + (index % 50),
          verified: index % 2 === 0
        },
        requested_products: [`product-${index % 3}`, `product-${(index + 1) % 3}`]
      },
      response_payload: {
        decision: index % 2 === 0 ? "approved" : "rejected",
        score: 600 + index,
        reasons: [`reason-${index % 4}`]
      },
      request_status: status,
      final_outcome: index % 2 === 0 ? "approved" : "rejected",
      outcome_code: index % 2 === 0 ? "APPROVED" : "REVIEW_REQUIRED",
      total_rules_executed: 2 + (index % 5),
      execution_duration_ms: 25 + index * 3,
      input_attributes_flat: [
        {
          path: "applicant.reference",
          value_string: `applicant-${index}`,
          value_number: Number(index) + 0.5,
          value_bool: index % 2 === 0
        }
      ],
      tags: ["deterministic", `cohort-${index % 4}`],
      expire_at: dateAt(index, 131400),
      created_at: dateAt(index, 420),
      updated_at: dateAt(index, 421)
    };
  },

  execution_rule_steps(index) {
    return {
      _id: deterministicObjectId("execution_rule_steps", index),
      request_id: requestId(index),
      correlation_id: `correlation-${String(index).padStart(4, "0")}`,
      customer_id: customerId(index),
      policy_id: policyId(index),
      policy_version_id: policyVersionId(index),
      rule_id: `rule-${String(index).padStart(3, "0")}-01`,
      rule_name: `Eligibility threshold ${index}`,
      step_sequence: 1 + (index % 4),
      stage_name: `stage-${1 + (index % 3)}`,
      executed_at: dateAt(index, 480),
      step_status: ["started", "completed", "skipped", "failed"][index % 4],
      condition_result: index % 2 === 0,
      input_snapshot: {
        applicant: { age: 21 + (index % 50), region: `region-${index % 5}` },
        flags: ["seeded", `group-${index % 3}`]
      },
      output_snapshot: {
        eligible: index % 2 === 0,
        score: 600 + index
      },
      intermediate_values: {
        threshold: 650,
        currentScore: 600 + index,
        checks: { identity: true, affordability: index % 2 === 0 }
      },
      searched_attributes_flat: [
        {
          path: "applicant.age",
          value_string: String(21 + (index % 50)),
          value_number: Number(21 + (index % 50)),
          value_bool: index % 2 === 0
        }
      ],
      duration_ms: 5 + index,
      error_code: index % 4 === 3 ? "RULE_FAILURE" : "NONE",
      error_message: index % 4 === 3 ? `Deterministic failure ${index}` : "No error",
      created_at: dateAt(index, 481)
    };
  },

  execution_insights(index) {
    return {
      _id: deterministicObjectId("execution_insights", index),
      request_id: requestId(index),
      customer_id: customerId(index),
      policy_id: policyId(index),
      policy_version_id: policyVersionId(index),
      insight_type: [
        "request_summary",
        "policy_version_comparison",
        "dashboard_annotation",
        "ai_generated_note"
      ][index % 4],
      source_window: {
        start_at: dateAt(index, 540),
        end_at: dateAt(index, 600)
      },
      summary_text: `Deterministic execution insight ${index}`,
      structured_findings: {
        severity: ["low", "medium", "high"][index % 3],
        metrics: { requestCount: index + 1, failureRate: (index % 5) / 10 },
        labels: ["seeded", `segment-${index % 4}`]
      },
      generated_by: ["aggregation_pipeline", "manual", "ai_model"][index % 3],
      model_name: `model-${1 + (index % 2)}`,
      created_at: dateAt(index, 660)
    };
  }
};

async function replaceCollection(db, name, count) {
  try {
    await db.collection(name).drop();
  } catch (error) {
    if (error.code !== 26 && error.codeName !== "NamespaceNotFound") {
      throw error;
    }
  }

  await db.createCollection(name);
  const documents = Array.from({ length: count }, (_, index) => builders[name](index));
  if (documents.length > 0) {
    await db.collection(name).insertMany(documents, { ordered: true });
  }
  for (const index of ORDINARY_INDEXES[name]) {
    await db.collection(name).createIndex(index.key, index.options);
  }
}

async function seed() {
  if (!mongodbUri) {
    throw new Error("MONGODB_URI is required");
  }

  const databaseName = databaseNameInput || "1790364549944";
  const counts = readLimits();
  const client = new MongoClient(mongodbUri);

  try {
    await client.connect();
    const db = client.db(databaseName);
    for (const name of COLLECTIONS) {
      await replaceCollection(db, name, counts[name]);
    }
  } finally {
    await client.close();
  }

  return counts;
}

seed()
  .then((counts) => {
    console.log(JSON.stringify({ seed_summary: counts }));
  })
  .catch(() => {
    console.error("seed failed");
    process.exitCode = 1;
  });
