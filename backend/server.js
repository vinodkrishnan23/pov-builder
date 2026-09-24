const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const { URL } = require('url');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB;
const REQUIRE_AUTH = process.env.REQUIRE_AUTH;
const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is required');
}

function resolveDbName() {
  if (MONGODB_DB) return MONGODB_DB;
  try {
    const parsed = new URL(MONGODB_URI);
    const dbPath = (parsed.pathname || '').replace(/^\//, '');
    return dbPath || undefined;
  } catch (e) {
    return undefined;
  }
}

const DB_NAME = resolveDbName();
if (!DB_NAME) {
  throw new Error('MONGODB_DB is required when DB name cannot be inferred from MONGODB_URI');
}

const client = new MongoClient(MONGODB_URI);
let db;

function log(level, message, meta = {}) {
  console.log(JSON.stringify({ level, message, ...meta, timestamp: new Date().toISOString() }));
}

function errorResponse(res, status, code, message, details = null) {
  return res.status(status).json({ error: { code, message, details } });
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseIsoDate(value) {
  if (!isNonEmptyString(value)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function validateGranularity(granularity) {
  return ['hour', 'day', 'week'].includes(granularity);
}

function buildDateTruncUnit(granularity) {
  return granularity;
}

function normalizeTicket(doc) {
  return {
    id: String(doc._id),
    ticket_number: doc.ticket_number,
    source_channel: doc.source_channel,
    subject: doc.subject,
    description: doc.description,
    account_tier: doc.account_tier ?? null,
    product_line: doc.product_line,
    status: doc.status,
    created_at: doc.created_at ? new Date(doc.created_at).toISOString() : null,
    manual_priority: doc.manual_priority ?? null
  };
}

function normalizeTeam(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    team_code: doc.team_code,
    name: doc.name,
    description: doc.description ?? null,
    active: Boolean(doc.active),
    created_at: doc.created_at ? new Date(doc.created_at).toISOString() : null
  };
}

function normalizeTriage(ticketDoc, teamDoc) {
  const triage = ticketDoc.triage_suggestion || {};
  const hasTriage = ticketDoc.triage_suggestion != null;
  if (!hasTriage) {
    return {
      suggested_priority: null,
      confidence: null,
      generated_at: null,
      model_version: null,
      suggested_team: null
    };
  }
  return {
    suggested_priority: triage.suggested_priority ?? null,
    confidence: triage.confidence ?? null,
    generated_at: triage.generated_at ? new Date(triage.generated_at).toISOString() : null,
    model_version: triage.model_version ?? null,
    suggested_team: normalizeTeam(teamDoc)
  };
}

function normalizeSimilarTicket(doc) {
  return {
    id: String(doc._id),
    ticket_number: doc.ticket_number,
    subject: doc.subject,
    description: doc.description,
    product_line: doc.product_line,
    manual_priority: doc.manual_priority ?? null,
    resolution_category: doc.resolution_category ?? null,
    resolution_summary: doc.resolution_summary ?? null,
    score: doc.score
  };
}

function authMiddleware(req, res, next) {
  if (REQUIRE_AUTH === 'false') return next();
  if (!AUTH_TOKEN) return next();
  const header = req.headers.authorization || '';
  if (header === `Bearer ${AUTH_TOKEN}`) return next();
  return errorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required.', null);
}

app.use(authMiddleware);

app.get('/health', async (req, res) => {
  try {
    await db.command({ ping: 1 });
    res.json({ status: 'ok' });
  } catch (e) {
    errorResponse(res, 503, 'HEALTH_CHECK_FAILED', 'Health check failed.', null);
  }
});

app.get('/api/v1/tickets/:ticketNumber', async (req, res, next) => {
  try {
    const { ticketNumber } = req.params;
    if (!isNonEmptyString(ticketNumber)) {
      return errorResponse(res, 400, 'INVALID_TICKET_NUMBER', 'The ticket number path parameter is missing or invalid.', null);
    }

    const ticket = await db.collection('tickets').findOne({ ticket_number: ticketNumber });
    if (!ticket) {
      return errorResponse(res, 404, 'TICKET_NOT_FOUND', 'No ticket found for the supplied ticket number.', null);
    }

    let suggestedTeam = null;
    if (ticket.triage_suggestion && ticket.triage_suggestion.suggested_team_id instanceof ObjectId) {
      suggestedTeam = await db.collection('support_teams').findOne({ _id: ticket.triage_suggestion.suggested_team_id });
    }

    const cache = Array.isArray(ticket.similar_ticket_cache) ? ticket.similar_ticket_cache.slice(0, 4) : [];
    const ids = cache.map(x => x.ticket_id).filter(x => x instanceof ObjectId);
    const similarDocs = ids.length ? await db.collection('tickets').find({ _id: { $in: ids }, status: 'resolved' }).toArray() : [];
    const similarMap = new Map(similarDocs.map(doc => [String(doc._id), doc]));
    const similar_tickets = cache
      .map(item => {
        const doc = similarMap.get(String(item.ticket_id));
        if (!doc) return null;
        return {
          id: String(doc._id),
          ticket_number: doc.ticket_number,
          subject: doc.subject,
          description: doc.description,
          product_line: doc.product_line,
          manual_priority: doc.manual_priority ?? null,
          resolution_category: doc.resolution_category ?? null,
          resolution_summary: doc.resolution_summary ?? null
        };
      })
      .filter(Boolean)
      .slice(0, 4);

    res.json({
      ticket: normalizeTicket(ticket),
      triage_suggestion: normalizeTriage(ticket, suggestedTeam),
      similar_tickets
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/tickets/:ticketNumber/triage-suggestion', async (req, res, next) => {
  try {
    const { ticketNumber } = req.params;
    if (!isNonEmptyString(ticketNumber)) {
      return errorResponse(res, 400, 'INVALID_TICKET_NUMBER', 'The ticket number path parameter is missing or invalid.', null);
    }
    const ticket = await db.collection('tickets').findOne({ ticket_number: ticketNumber });
    if (!ticket) {
      return errorResponse(res, 404, 'TICKET_NOT_FOUND', 'No ticket found for the supplied ticket number.', null);
    }
    let suggestedTeam = null;
    if (ticket.triage_suggestion && ticket.triage_suggestion.suggested_team_id instanceof ObjectId) {
      suggestedTeam = await db.collection('support_teams').findOne({ _id: ticket.triage_suggestion.suggested_team_id });
    }
    res.json({
      ticket: {
        id: String(ticket._id),
        ticket_number: ticket.ticket_number,
        subject: ticket.subject,
        description: ticket.description,
        manual_priority: ticket.manual_priority ?? null
      },
      triage_suggestion: normalizeTriage(ticket, suggestedTeam)
    });
  } catch (e) {
    next(e);
  }
});

app.post('/api/v1/similar-tickets/search', async (req, res, next) => {
  try {
    const { query_embedding, limit } = req.body || {};
    if (!Array.isArray(query_embedding) || query_embedding.length === 0 || !query_embedding.every(n => typeof n === 'number' && Number.isFinite(n))) {
      return errorResponse(res, 400, 'INVALID_QUERY_EMBEDDING', 'query_embedding must be a non-empty numeric vector.', null);
    }
    const effectiveLimit = limit === undefined ? 4 : limit;
    if (!Number.isInteger(effectiveLimit) || effectiveLimit < 1 || effectiveLimit > 4) {
      return errorResponse(res, 400, 'INVALID_LIMIT', 'limit must be between 1 and 4.', null);
    }

    const pipeline = [
      {
        $vectorSearch: {
          index: 'ticket_embedding_vector',
          path: 'embedding',
          queryVector: query_embedding,
          numCandidates: Math.max(20, effectiveLimit),
          limit: effectiveLimit,
          filter: { status: 'resolved' }
        }
      },
      {
        $project: {
          _id: 1,
          ticket_number: 1,
          subject: 1,
          description: 1,
          product_line: 1,
          manual_priority: 1,
          resolution_category: 1,
          resolution_summary: 1,
          score: { $meta: 'vectorSearchScore' }
        }
      }
    ];

    const results = await db.collection('tickets').aggregate(pipeline).toArray();
    res.json({ results: results.map(normalizeSimilarTicket) });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/dashboard/ticket-volume', async (req, res, next) => {
  try {
    const { granularity, start_date, end_date } = req.query;
    if (!validateGranularity(granularity)) {
      return errorResponse(res, 400, 'INVALID_GRANULARITY', 'granularity must be one of hour, day, or week.', null);
    }
    const start = parseIsoDate(start_date);
    const end = parseIsoDate(end_date);
    if (!start || !end || start >= end) {
      return errorResponse(res, 400, 'INVALID_DATE_RANGE', 'start_date must be before end_date and both must be valid ISO-8601 datetimes.', null);
    }
    const points = await db.collection('dashboard_metric_snapshots').find({
      metric_type: 'ticket_volume',
      time_granularity: granularity,
      bucket_start: { $gte: start, $lt: end }
    }).sort({ bucket_start: 1, product_line: 1, priority: 1 }).toArray();

    res.json({
      metric_type: 'ticket_volume',
      granularity,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      points: points.map(p => ({
        bucket_start: new Date(p.bucket_start).toISOString(),
        product_line: p.product_line ?? null,
        priority: p.priority ?? null,
        value: p.value,
        ticket_count: p.ticket_count ?? null,
        refreshed_at: new Date(p.refreshed_at).toISOString()
      }))
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/dashboard/avg-resolution-time', async (req, res, next) => {
  try {
    const { granularity, start_date, end_date } = req.query;
    if (!validateGranularity(granularity)) {
      return errorResponse(res, 400, 'INVALID_GRANULARITY', 'granularity must be one of hour, day, or week.', null);
    }
    const start = parseIsoDate(start_date);
    const end = parseIsoDate(end_date);
    if (!start || !end || start >= end) {
      return errorResponse(res, 400, 'INVALID_DATE_RANGE', 'start_date must be before end_date and both must be valid ISO-8601 datetimes.', null);
    }

    const points = await db.collection('dashboard_metric_snapshots').aggregate([
      {
        $match: {
          metric_type: 'avg_resolution_time',
          time_granularity: granularity,
          bucket_start: { $gte: start, $lt: end }
        }
      },
      {
        $lookup: {
          from: 'support_teams',
          localField: 'team_id',
          foreignField: '_id',
          as: 'team'
        }
      },
      { $unwind: { path: '$team', preserveNullAndEmptyArrays: true } },
      { $sort: { bucket_start: 1, 'team.name': 1 } }
    ]).toArray();

    res.json({
      metric_type: 'avg_resolution_time',
      granularity,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      points: points.map(p => ({
        bucket_start: new Date(p.bucket_start).toISOString(),
        value: p.value,
        ticket_count: p.ticket_count ?? null,
        refreshed_at: new Date(p.refreshed_at).toISOString(),
        team: normalizeTeam(p.team)
      }))
    });
  } catch (e) {
    next(e);
  }
});

async function refreshTicketVolume(granularity, start, end) {
  const unit = buildDateTruncUnit(granularity);
  const refreshedAt = new Date();
  const docs = await db.collection('tickets').aggregate([
    {
      $match: {
        created_at: { $gte: start, $lt: end }
      }
    },
    {
      $project: {
        bucket_start: { $dateTrunc: { date: '$created_at', unit } },
        product_line: '$product_line',
        priority: '$manual_priority'
      }
    },
    {
      $group: {
        _id: {
          bucket_start: '$bucket_start',
          product_line: '$product_line',
          priority: '$priority'
        },
        ticket_count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        metric_type: 'ticket_volume',
        time_granularity: granularity,
        bucket_start: '$_id.bucket_start',
        product_line: '$_id.product_line',
        priority: '$_id.priority',
        team_id: null,
        value: { $toDouble: '$ticket_count' },
        ticket_count: '$ticket_count',
        refreshed_at: refreshedAt
      }
    }
  ]).toArray();

  await db.collection('dashboard_metric_snapshots').deleteMany({
    metric_type: 'ticket_volume',
    time_granularity: granularity,
    bucket_start: { $gte: start, $lt: end }
  });
  if (docs.length) {
    await db.collection('dashboard_metric_snapshots').insertMany(docs);
  }
}

async function refreshAvgResolutionTime(granularity, start, end) {
  const unit = buildDateTruncUnit(granularity);
  const refreshedAt = new Date();
  const docs = await db.collection('tickets').aggregate([
    {
      $match: {
        status: 'resolved',
        resolved_at: { $gte: start, $lt: end },
        assigned_team_id: { $exists: true, $ne: null },
        resolution_time_minutes: { $exists: true, $ne: null }
      }
    },
    {
      $project: {
        bucket_start: { $dateTrunc: { date: '$resolved_at', unit } },
        team_id: '$assigned_team_id',
        resolution_time_minutes: '$resolution_time_minutes'
      }
    },
    {
      $group: {
        _id: {
          bucket_start: '$bucket_start',
          team_id: '$team_id'
        },
        value: { $avg: '$resolution_time_minutes' },
        ticket_count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        metric_type: 'avg_resolution_time',
        time_granularity: granularity,
        bucket_start: '$_id.bucket_start',
        product_line: null,
        priority: null,
        team_id: '$_id.team_id',
        value: { $toDouble: '$value' },
        ticket_count: '$ticket_count',
        refreshed_at: refreshedAt
      }
    }
  ]).toArray();

  await db.collection('dashboard_metric_snapshots').deleteMany({
    metric_type: 'avg_resolution_time',
    time_granularity: granularity,
    bucket_start: { $gte: start, $lt: end }
  });
  if (docs.length) {
    await db.collection('dashboard_metric_snapshots').insertMany(docs);
  }
}

app.post('/api/v1/admin/dashboard-metrics/ticket-volume/refresh', async (req, res, next) => {
  try {
    const { granularity, start_date, end_date } = req.body || {};
    if (!validateGranularity(granularity)) {
      return errorResponse(res, 400, 'INVALID_GRANULARITY', 'granularity must be one of hour, day, or week.', null);
    }
    const start = parseIsoDate(start_date);
    const end = parseIsoDate(end_date);
    if (!start || !end || start >= end) {
      return errorResponse(res, 400, 'INVALID_DATE_RANGE', 'start_date must be before end_date and both must be valid ISO-8601 datetimes.', null);
    }
    await refreshTicketVolume(granularity, start, end);
    res.status(202).json({
      job: 'synchronous_or_background_execution_not_specified',
      metric_type: 'ticket_volume',
      granularity,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      status: 'accepted'
    });
  } catch (e) {
    next(e);
  }
});

app.post('/api/v1/admin/dashboard-metrics/avg-resolution-time/refresh', async (req, res, next) => {
  try {
    const { granularity, start_date, end_date } = req.body || {};
    if (!validateGranularity(granularity)) {
      return errorResponse(res, 400, 'INVALID_GRANULARITY', 'granularity must be one of hour, day, or week.', null);
    }
    const start = parseIsoDate(start_date);
    const end = parseIsoDate(end_date);
    if (!start || !end || start >= end) {
      return errorResponse(res, 400, 'INVALID_DATE_RANGE', 'start_date must be before end_date and both must be valid ISO-8601 datetimes.', null);
    }
    await refreshAvgResolutionTime(granularity, start, end);
    res.status(202).json({
      job: 'synchronous_or_background_execution_not_specified',
      metric_type: 'avg_resolution_time',
      granularity,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      status: 'accepted'
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/support-teams', async (req, res, next) => {
  try {
    const { active } = req.query;
    const filter = {};
    if (active !== undefined) {
      if (active !== 'true' && active !== 'false') {
        return errorResponse(res, 400, 'INVALID_ACTIVE_FILTER', 'active must be true or false when supplied.', null);
      }
      filter.active = active === 'true';
    }
    const teams = await db.collection('support_teams').find(filter).sort({ name: 1 }).toArray();
    res.json({ teams: teams.map(normalizeTeam) });
  } catch (e) {
    next(e);
  }
});

app.patch('/api/v1/tickets/:ticketNumber/status', async (req, res, next) => {
  try {
    const { ticketNumber } = req.params;
    if (!isNonEmptyString(ticketNumber)) {
      return errorResponse(res, 400, 'INVALID_TICKET_NUMBER', 'The ticket number path parameter is missing or invalid.', null);
    }
    const { status, resolved_at, resolution_time_minutes, assigned_team_id } = req.body || {};
    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return errorResponse(res, 400, 'INVALID_STATUS', 'status must be one of open, in_progress, resolved, or closed.', null);
    }

    let teamObjectId = null;
    if (assigned_team_id !== undefined) {
      if (!ObjectId.isValid(assigned_team_id)) {
        return errorResponse(res, 400, 'INVALID_TEAM_ID', 'assigned_team_id must be a valid support team id when supplied.', null);
      }
      teamObjectId = new ObjectId(assigned_team_id);
      const teamExists = await db.collection('support_teams').findOne({ _id: teamObjectId });
      if (!teamExists) {
        return errorResponse(res, 400, 'INVALID_TEAM_ID', 'assigned_team_id must be a valid support team id when supplied.', null);
      }
    }

    let resolvedAtValue;
    if (resolved_at !== undefined) {
      const parsed = parseIsoDate(resolved_at);
      resolvedAtValue = parsed ? parsed : null;
    }

    let resolutionTimeValue;
    if (resolution_time_minutes !== undefined) {
      if (typeof resolution_time_minutes !== 'number' || !Number.isFinite(resolution_time_minutes)) {
        resolutionTimeValue = null;
      } else {
        resolutionTimeValue = resolution_time_minutes;
      }
    }

    const update = { status };
    if (resolved_at !== undefined) update.resolved_at = resolvedAtValue;
    if (resolution_time_minutes !== undefined) update.resolution_time_minutes = resolutionTimeValue;
    if (assigned_team_id !== undefined) update.assigned_team_id = teamObjectId;

    const result = await db.collection('tickets').findOneAndUpdate(
      { ticket_number: ticketNumber },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!result) {
      return errorResponse(res, 404, 'TICKET_NOT_FOUND', 'No ticket found for the supplied ticket number.', null);
    }

    res.json({
      ticket_number: result.ticket_number,
      status: result.status,
      resolved_at: result.resolved_at ? new Date(result.resolved_at).toISOString() : null,
      resolution_time_minutes: result.resolution_time_minutes ?? null,
      assigned_team_id: result.assigned_team_id ? String(result.assigned_team_id) : null,
      updated: true
    });
  } catch (e) {
    next(e);
  }
});

app.use((req, res) => {
  errorResponse(res, 404, 'NOT_FOUND', 'Resource not found.', null);
});

app.use((err, req, res, next) => {
  log('error', 'Unhandled error', { error: err.message, stack: err.stack, path: req.path, method: req.method });
  errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.', null);
});

async function start() {
  await client.connect();
  db = client.db(DB_NAME);
  app.locals.db = db;
  app.locals.client = client;
  app.listen(PORT, () => {
    log('info', 'Server started', { port: PORT });
  });
}

if (require.main === module) {
  start().catch(err => {
    log('error', 'Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

module.exports = { app, start, client, getDb: () => db, errorResponse, parseIsoDate, validateGranularity };
