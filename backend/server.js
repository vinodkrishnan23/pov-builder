const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const { test } = require('node:test');
const assert = require('node:assert');

const REQUIRED_ENVS = ['MONGODB_URI', 'MONGODB_DB', 'PORT'];
for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const app = express();
app.use(express.json({ limit: '1mb' }));

function log(level, message, meta = {}) {
  const entry = {
    level,
    message,
    ...meta,
    timestamp: new Date().toISOString()
  };
  console.log(JSON.stringify(entry));
}

function sendError(res, status, code, message, details) {
  return res.status(status).json({
    error: {
      code,
      message,
      details: details || null
    }
  });
}

function isValidDateTime(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseNullableObjectId(value) {
  if (value === null || value === undefined) return { value: null };
  if (typeof value !== 'string' || !ObjectId.isValid(value)) {
    return { error: 'Invalid ObjectId string' };
  }
  return { value: new ObjectId(value) };
}

function serializeTicket(doc) {
  if (!doc) return null;
  return {
    ticket_id: doc.ticket_id,
    subject: doc.subject,
    description: doc.description,
    customer_account_tier: doc.customer_account_tier,
    product_line: doc.product_line,
    manual_priority: doc.manual_priority ?? null,
    channel: doc.channel ?? null,
    status: doc.status,
    assigned_team_id: doc.assigned_team_id ? String(doc.assigned_team_id) : null,
    created_at: toIsoOrNull(doc.created_at),
    triaged_at: toIsoOrNull(doc.triaged_at),
    resolved_at: toIsoOrNull(doc.resolved_at),
    resolution: doc.resolution ?? null,
    triage_suggestion: doc.triage_suggestion
      ? {
          suggested_priority: doc.triage_suggestion.suggested_priority ?? null,
          suggested_team_id: doc.triage_suggestion.suggested_team_id ? String(doc.triage_suggestion.suggested_team_id) : null,
          generated_at: toIsoOrNull(doc.triage_suggestion.generated_at),
          model_version: doc.triage_suggestion.model_version ?? null,
          confidence: doc.triage_suggestion.confidence ?? null
        }
      : null,
    ingest_batch_id: doc.ingest_batch_id ?? null,
    is_historical_import: doc.is_historical_import
  };
}

function serializeTeam(doc) {
  return {
    id: String(doc._id),
    team_id: doc.team_id,
    name: doc.name,
    description: doc.description ?? null,
    active: doc.active
  };
}

function parseBooleanQuery(value) {
  if (value === undefined) return { value: undefined };
  if (value === 'true') return { value: true };
  if (value === 'false') return { value: false };
  return { error: 'Expected boolean query param true or false' };
}

function bucketDateExpression(field, granularity) {
  return {
    $dateTrunc: {
      date: field,
      unit: granularity,
      binSize: 1
    }
  };
}

function buildRawVolumePipeline(dimensionField, startDate, endDate, granularity) {
  return [
    {
      $match: {
        created_at: { $gte: startDate, $lt: endDate }
      }
    },
    {
      $project: {
        time_bucket: bucketDateExpression('$created_at', granularity),
        dimension: { $ifNull: [dimensionField, 'unknown'] }
      }
    },
    {
      $group: {
        _id: {
          time_bucket: '$time_bucket',
          dimension: '$dimension'
        },
        ticket_count: { $sum: 1 }
      }
    },
    {
      $sort: {
        '_id.time_bucket': 1,
        '_id.dimension': 1
      }
    }
  ];
}

function validateDashboardQuery(query, requireGranularityForSnapshot = false) {
  const { startDate, endDate, granularity, source = 'raw' } = query;
  if (!isValidDateTime(startDate) || !isValidDateTime(endDate)) {
    return { error: { status: 400, code: 'INVALID_DATE_RANGE', message: 'startDate/endDate are missing or malformed.' } };
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (!(start < end)) {
    return { error: { status: 400, code: 'INVALID_DATE_RANGE', message: 'startDate must be before endDate.' } };
  }
  if (!['raw', 'snapshot'].includes(source)) {
    return { error: { status: 400, code: 'INVALID_REQUEST', message: 'source must be raw or snapshot.' } };
  }
  if (source === 'snapshot' && requireGranularityForSnapshot && !granularity) {
    return { error: { status: 400, code: 'INVALID_GRANULARITY', message: 'granularity is required when source=snapshot.' } };
  }
  if (granularity !== undefined && !['hour', 'day', 'week'].includes(granularity)) {
    return { error: { status: 400, code: 'INVALID_GRANULARITY', message: 'granularity must be one of hour, day, or week.' } };
  }
  if (source === 'raw' && !granularity && !requireGranularityForSnapshot) {
    return { value: { start, end, granularity: null, source } };
  }
  if (!granularity && !requireGranularityForSnapshot) {
    return { value: { start, end, granularity: null, source } };
  }
  if (!granularity && requireGranularityForSnapshot === false) {
    return { value: { start, end, granularity: null, source } };
  }
  if (!granularity && source === 'snapshot') {
    return { error: { status: 400, code: 'INVALID_GRANULARITY', message: 'granularity is required.' } };
  }
  return { value: { start, end, granularity: granularity ?? null, source } };
}

let client;
let db;

async function connectDb() {
  if (db) return db;
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.MONGODB_DB);
  await db.collection('support_tickets').createIndex({ ticket_id: 1 }, { unique: true });
  return db;
}

app.get('/health', async (req, res) => {
  try {
    const database = await connectDb();
    await database.command({ ping: 1 });
    res.json({ status: 'ok' });
  } catch (err) {
    log('error', 'health_check_failed', { error: err.message });
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Health check failed');
  }
});

app.post('/api/tickets', async (req, res) => {
  try {
    const body = req.body;
    const required = ['ticket_id', 'subject', 'description', 'customer_account_tier', 'product_line', 'status', 'created_at', 'is_historical_import'];
    for (const field of required) {
      if (!(field in body)) {
        return sendError(res, 400, 'INVALID_REQUEST', `Missing required field: ${field}`);
      }
    }
    if (typeof body.ticket_id !== 'string' || typeof body.subject !== 'string' || typeof body.description !== 'string' || typeof body.customer_account_tier !== 'string' || typeof body.product_line !== 'string') {
      return sendError(res, 400, 'INVALID_REQUEST', 'Invalid string fields in request body');
    }
    if (body.manual_priority !== undefined && body.manual_priority !== null && typeof body.manual_priority !== 'string') {
      return sendError(res, 400, 'INVALID_REQUEST', 'manual_priority must be a string or null');
    }
    if (body.channel !== undefined && body.channel !== null && !['email', 'chat', 'phone'].includes(body.channel)) {
      return sendError(res, 400, 'INVALID_REQUEST', 'channel must be email, chat, phone, or null');
    }
    if (!['new', 'open', 'resolved', 'closed'].includes(body.status)) {
      return sendError(res, 400, 'INVALID_REQUEST', 'status must be new, open, resolved, or closed');
    }
    if (!isValidDateTime(body.created_at) || (body.triaged_at !== undefined && body.triaged_at !== null && !isValidDateTime(body.triaged_at)) || (body.resolved_at !== undefined && body.resolved_at !== null && !isValidDateTime(body.resolved_at))) {
      return sendError(res, 400, 'INVALID_REQUEST', 'Invalid date-time field');
    }
    if (body.is_historical_import !== false) {
      return sendError(res, 400, 'INVALID_REQUEST', 'is_historical_import must be false');
    }
    const assignedTeamParsed = parseNullableObjectId(body.assigned_team_id);
    if (assignedTeamParsed.error) {
      return sendError(res, 400, 'INVALID_REQUEST', 'assigned_team_id must be a valid ObjectId string or null');
    }
    let triageSuggestion = undefined;
    if (body.triage_suggestion !== undefined) {
      if (body.triage_suggestion !== null && typeof body.triage_suggestion !== 'object') {
        return sendError(res, 400, 'INVALID_REQUEST', 'triage_suggestion must be an object or null');
      }
      if (body.triage_suggestion === null) {
        triageSuggestion = null;
      } else {
        const suggestedTeamParsed = parseNullableObjectId(body.triage_suggestion.suggested_team_id);
        if (suggestedTeamParsed.error) {
          return sendError(res, 400, 'INVALID_REQUEST', 'triage_suggestion.suggested_team_id must be a valid ObjectId string or null');
        }
        if (body.triage_suggestion.generated_at !== undefined && body.triage_suggestion.generated_at !== null && !isValidDateTime(body.triage_suggestion.generated_at)) {
          return sendError(res, 400, 'INVALID_REQUEST', 'triage_suggestion.generated_at must be a valid date-time or null');
        }
        if (body.triage_suggestion.confidence !== undefined && body.triage_suggestion.confidence !== null && typeof body.triage_suggestion.confidence !== 'number') {
          return sendError(res, 400, 'INVALID_REQUEST', 'triage_suggestion.confidence must be a number or null');
        }
        triageSuggestion = {
          suggested_priority: body.triage_suggestion.suggested_priority ?? null,
          suggested_team_id: suggestedTeamParsed.value,
          generated_at: body.triage_suggestion.generated_at ? new Date(body.triage_suggestion.generated_at) : null,
          model_version: body.triage_suggestion.model_version ?? null,
          confidence: body.triage_suggestion.confidence ?? null
        };
      }
    }
    if (body.resolution !== undefined && body.resolution !== null) {
      if (typeof body.resolution !== 'object' || typeof body.resolution.category !== 'string' || typeof body.resolution.summary !== 'string') {
        return sendError(res, 400, 'INVALID_REQUEST', 'resolution must contain category and summary strings');
      }
    }
    if (body.text_embedding !== undefined && body.text_embedding !== null) {
      if (!Array.isArray(body.text_embedding) || body.text_embedding.some((v) => typeof v !== 'number')) {
        return sendError(res, 400, 'INVALID_REQUEST', 'text_embedding must be an array of numbers or null');
      }
    }
    const doc = {
      ticket_id: body.ticket_id,
      subject: body.subject,
      description: body.description,
      customer_account_tier: body.customer_account_tier,
      product_line: body.product_line,
      manual_priority: body.manual_priority ?? null,
      channel: body.channel ?? null,
      status: body.status,
      assigned_team_id: assignedTeamParsed.value,
      created_at: new Date(body.created_at),
      triaged_at: body.triaged_at ? new Date(body.triaged_at) : null,
      resolved_at: body.resolved_at ? new Date(body.resolved_at) : null,
      resolution: body.resolution ?? null,
      triage_suggestion: triageSuggestion === undefined ? null : triageSuggestion,
      text_embedding: body.text_embedding ?? null,
      ingest_batch_id: body.ingest_batch_id ?? null,
      is_historical_import: false
    };
    const database = await connectDb();
    await database.collection('support_tickets').insertOne(doc);
    log('info', 'ticket_created', { ticket_id: doc.ticket_id });
    return res.status(201).json({
      ticket_id: doc.ticket_id,
      created: true,
      ticket: serializeTicket(doc)
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return sendError(res, 409, 'TICKET_ID_ALREADY_EXISTS', 'A ticket with the same ticket_id already exists.');
    }
    log('error', 'create_ticket_failed', { error: err.message });
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
  }
});

app.get('/api/tickets/:ticketId', async (req, res) => {
  try {
    const database = await connectDb();
    const ticket = await database.collection('support_tickets').findOne({ ticket_id: req.params.ticketId });
    if (!ticket) {
      return sendError(res, 404, 'TICKET_NOT_FOUND', 'No ticket exists for the supplied ticket_id.');
    }
    return res.json(serializeTicket(ticket));
  } catch (err) {
    log('error', 'get_ticket_failed', { error: err.message, ticket_id: req.params.ticketId });
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
  }
});

app.get('/api/tickets/:ticketId/triage-suggestion', async (req, res) => {
  try {
    const database = await connectDb();
    const ticket = await database.collection('support_tickets').findOne({ ticket_id: req.params.ticketId });
    if (!ticket) {
      return sendError(res, 404, 'TICKET_NOT_FOUND', 'No ticket exists for the supplied ticket_id.');
    }
    let suggestedTeam = null;
    const suggestedTeamId = ticket.triage_suggestion && ticket.triage_suggestion.suggested_team_id;
    if (suggestedTeamId) {
      const team = await database.collection('support_teams').findOne({ _id: suggestedTeamId });
      if (team) {
        suggestedTeam = {
          team_id: team.team_id,
          name: team.name,
          description: team.description ?? null,
          active: team.active
        };
      }
    }
    return res.json({
      ticket_id: ticket.ticket_id,
      subject: ticket.subject,
      description: ticket.description,
      customer_account_tier: ticket.customer_account_tier,
      product_line: ticket.product_line,
      manual_priority: ticket.manual_priority ?? null,
      status: ticket.status,
      triage_suggestion: ticket.triage_suggestion
        ? {
            suggested_priority: ticket.triage_suggestion.suggested_priority ?? null,
            generated_at: toIsoOrNull(ticket.triage_suggestion.generated_at),
            model_version: ticket.triage_suggestion.model_version ?? null,
            confidence: ticket.triage_suggestion.confidence ?? null
          }
        : null,
      suggested_team: suggestedTeam
    });
  } catch (err) {
    log('error', 'get_triage_suggestion_failed', { error: err.message, ticket_id: req.params.ticketId });
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
  }
});

app.get('/api/tickets/:ticketId/similar-resolved', async (req, res) => {
  try {
    const limit = req.query.limit === undefined ? 4 : Number(req.query.limit);
    if (![3, 4].includes(limit)) {
      return sendError(res, 400, 'INVALID_REQUEST', 'limit must be 3 or 4');
    }
    const database = await connectDb();
    const currentTicket = await database.collection('support_tickets').findOne({ ticket_id: req.params.ticketId });
    if (!currentTicket) {
      return sendError(res, 404, 'TICKET_NOT_FOUND', 'No current ticket exists for the supplied ticket_id.');
    }
    if (!Array.isArray(currentTicket.text_embedding) || currentTicket.text_embedding.length === 0) {
      return sendError(res, 409, 'TICKET_EMBEDDING_MISSING', 'The current ticket does not have text_embedding, so the vector-search query pattern cannot be run.');
    }

    const pipeline = [
      {
        $vectorSearch: {
          index: 'support_tickets_text_embedding_index',
          path: 'text_embedding',
          queryVector: currentTicket.text_embedding,
          numCandidates: 50,
          limit,
          filter: {
            ticket_id: { $ne: currentTicket.ticket_id },
            is_historical_import: true,
            status: 'resolved'
          }
        }
      },
      {
        $lookup: {
          from: 'support_teams',
          localField: 'assigned_team_id',
          foreignField: '_id',
          as: 'assigned_team'
        }
      },
      {
        $unwind: {
          path: '$assigned_team',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 0,
          ticket_id: 1,
          subject: 1,
          description: 1,
          product_line: 1,
          customer_account_tier: 1,
          manual_priority: 1,
          channel: 1,
          resolved_at: 1,
          resolution: 1,
          assigned_team: {
            $cond: [
              { $ifNull: ['$assigned_team._id', false] },
              {
                team_id: '$assigned_team.team_id',
                name: '$assigned_team.name'
              },
              null
            ]
          },
          similarity_score: { $meta: 'vectorSearchScore' }
        }
      }
    ];

    const results = await database.collection('support_tickets').aggregate(pipeline).toArray();
    return res.json({
      ticket_id: currentTicket.ticket_id,
      results: results.map((doc) => ({
        ticket_id: doc.ticket_id,
        subject: doc.subject,
        description: doc.description,
        product_line: doc.product_line,
        customer_account_tier: doc.customer_account_tier,
        manual_priority: doc.manual_priority ?? null,
        channel: doc.channel ?? null,
        resolved_at: toIsoOrNull(doc.resolved_at),
        resolution: doc.resolution,
        assigned_team: doc.assigned_team,
        similarity_score: doc.similarity_score
      }))
    });
  } catch (err) {
    log('error', 'similar_resolved_failed', { error: err.message, ticket_id: req.params.ticketId });
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
  }
});

app.get('/api/teams', async (req, res) => {
  try {
    const activeParsed = parseBooleanQuery(req.query.active);
    if (activeParsed.error) {
      return sendError(res, 400, 'INVALID_REQUEST', activeParsed.error);
    }
    const filter = {};
    if (activeParsed.value !== undefined) {
      filter.active = activeParsed.value;
    }
    const database = await connectDb();
    const teams = await database.collection('support_teams').find(filter).toArray();
    return res.json({ teams: teams.map(serializeTeam) });
  } catch (err) {
    log('error', 'list_teams_failed', { error: err.message });
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
  }
});

app.get('/api/dashboard/ticket-volume-by-product-line', async (req, res) => {
  try {
    const validation = validateDashboardQuery(req.query, false);
    if (validation.error) {
      return sendError(res, validation.error.status, validation.error.code, validation.error.message);
    }
    const { start, end, granularity, source } = validation.value;
    if (!granularity) {
      return sendError(res, 400, 'INVALID_GRANULARITY', 'granularity is required.');
    }
    const database = await connectDb();
    let points;
    if (source === 'raw') {
      const rows = await database.collection('support_tickets').aggregate(buildRawVolumePipeline('$product_line', start, end, granularity)).toArray();
      points = rows.map((row) => ({
        time_bucket: row._id.time_bucket.toISOString(),
        product_line: row._id.dimension,
        ticket_count: row.ticket_count,
        last_computed_at: null
      }));
    } else {
      const rows = await database.collection('dashboard_metric_snapshots').find({
        metric_name: 'ticket_volume_by_product_line',
        time_bucket_start: { $gte: start, $lt: end },
        time_bucket_granularity: granularity
      }).sort({ time_bucket_start: 1, dimension_key: 1 }).toArray();
      points = rows.map((row) => ({
        time_bucket: row.time_bucket_start.toISOString(),
        product_line: row.dimension_key,
        ticket_count: row.metric_value,
        last_computed_at: toIsoOrNull(row.last_computed_at)
      }));
    }
    return res.json({
      metric: 'ticket_volume_by_product_line',
      source,
      granularity,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      points
    });
  } catch (err) {
    log('error', 'dashboard_product_line_failed', { error: err.message });
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
  }
});

app.get('/api/dashboard/ticket-volume-by-priority', async (req, res) => {
  try {
    const validation = validateDashboardQuery(req.query, false);
    if (validation.error) {
      return sendError(res, validation.error.status, validation.error.code, validation.error.message);
    }
    const { start, end, granularity, source } = validation.value;
    if (!granularity) {
      return sendError(res, 400, 'INVALID_GRANULARITY', 'granularity is required.');
    }
    const database = await connectDb();
    let points;
    if (source === 'raw') {
      const rows = await database.collection('support_tickets').aggregate(buildRawVolumePipeline('$manual_priority', start, end, granularity)).toArray();
      points = rows.map((row) => ({
        time_bucket: row._id.time_bucket.toISOString(),
        priority: row._id.dimension,
        ticket_count: row.ticket_count,
        last_computed_at: null
      }));
    } else {
      const rows = await database.collection('dashboard_metric_snapshots').find({
        metric_name: 'ticket_volume_by_priority',
        time_bucket_start: { $gte: start, $lt: end },
        time_bucket_granularity: granularity
      }).sort({ time_bucket_start: 1, dimension_key: 1 }).toArray();
      points = rows.map((row) => ({
        time_bucket: row.time_bucket_start.toISOString(),
        priority: row.dimension_key,
        ticket_count: row.metric_value,
        last_computed_at: toIsoOrNull(row.last_computed_at)
      }));
    }
    return res.json({
      metric: 'ticket_volume_by_priority',
      source,
      granularity,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      points
    });
  } catch (err) {
    log('error', 'dashboard_priority_failed', { error: err.message });
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
  }
});

app.get('/api/dashboard/avg-resolution-time-by-team', async (req, res) => {
  try {
    const validation = validateDashboardQuery(req.query, true);
    if (validation.error) {
      return sendError(res, validation.error.status, validation.error.code, validation.error.message);
    }
    const { start, end, granularity, source } = validation.value;
    const database = await connectDb();
    let points;
    if (source === 'raw') {
      const rows = await database.collection('support_tickets').aggregate([
        {
          $match: {
            resolved_at: { $gte: start, $lt: end },
            assigned_team_id: { $ne: null },
            resolved_at: { $ne: null },
            created_at: { $ne: null }
          }
        },
        {
          $project: {
            assigned_team_id: 1,
            resolution_hours: {
              $divide: [
                { $subtract: ['$resolved_at', '$created_at'] },
                1000 * 60 * 60
              ]
            }
          }
        },
        {
          $group: {
            _id: '$assigned_team_id',
            avg_resolution_hours: { $avg: '$resolution_hours' },
            resolved_ticket_count: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'support_teams',
            localField: '_id',
            foreignField: '_id',
            as: 'team'
          }
        },
        {
          $unwind: {
            path: '$team',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            _id: 0,
            team_id: '$team.team_id',
            team_name: '$team.name',
            avg_resolution_hours: 1,
            resolved_ticket_count: 1,
            time_bucket: null,
            last_computed_at: null
          }
        },
        {
          $sort: { team_name: 1 }
        }
      ]).toArray();
      points = rows.map((row) => ({
        team_id: row.team_id,
        team_name: row.team_name,
        avg_resolution_hours: row.avg_resolution_hours ?? null,
        resolved_ticket_count: row.resolved_ticket_count ?? null,
        time_bucket: null,
        last_computed_at: null
      }));
    } else {
      const rows = await database.collection('dashboard_metric_snapshots').find({
        metric_name: 'avg_resolution_time_by_team',
        time_bucket_start: { $gte: start, $lt: end },
        time_bucket_granularity: granularity
      }).sort({ time_bucket_start: 1, dimension_key: 1 }).toArray();
      points = rows.map((row) => ({
        team_id: row.dimension_key,
        team_name: row.dimension_label,
        avg_resolution_hours: row.metric_value,
        resolved_ticket_count: null,
        time_bucket: row.time_bucket_start.toISOString(),
        last_computed_at: toIsoOrNull(row.last_computed_at)
      }));
    }
    return res.json({
      metric: 'avg_resolution_time_by_team',
      source,
      granularity: source === 'raw' ? null : granularity,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      points
    });
  } catch (err) {
    log('error', 'dashboard_avg_resolution_failed', { error: err.message });
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
  }
});

app.use((req, res) => {
  sendError(res, 404, 'NOT_FOUND', 'Route not found');
});

if (process.env.NODE_ENV === 'test') {
  test('serializeTicket returns expected shape', () => {
    const now = new Date('2024-01-01T00:00:00.000Z');
    const result = serializeTicket({
      ticket_id: 'T1',
      subject: 'S',
      description: 'D',
      customer_account_tier: 'gold',
      product_line: 'atlas',
      status: 'new',
      created_at: now,
      is_historical_import: false
    });
    assert.equal(result.ticket_id, 'T1');
    assert.equal(result.created_at, '2024-01-01T00:00:00.000Z');
    assert.equal(result.manual_priority, null);
  });

  test('parseBooleanQuery validates values', () => {
    assert.equal(parseBooleanQuery('true').value, true);
    assert.equal(parseBooleanQuery('false').value, false);
    assert.ok(parseBooleanQuery('x').error);
  });
}

if (require.main === module) {
  connectDb()
    .then(() => {
      app.listen(process.env.PORT, () => {
        log('info', 'server_started', { port: Number(process.env.PORT) });
      });
    })
    .catch((err) => {
      log('error', 'startup_failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = { app, serializeTicket, parseBooleanQuery, validateDashboardQuery };
