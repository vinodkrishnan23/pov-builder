const express = require('express');
const {
  parseBoolean,
  parseDateString,
  validateCreateTicket,
  parseLimit,
  serializeTicket,
  errorResponse,
  normalizeObjectIdString,
  getBucketDateExpression,
  getWeekBucketStart,
  escapeRegex,
} = require('./utils');

function createApp({ db, client, ObjectId }) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.use((req, res, next) => {
    console.log(JSON.stringify({
      level: 'info',
      message: 'request_received',
      method: req.method,
      path: req.path,
      query: req.query,
    }));
    next();
  });

  const tickets = db.collection('support_tickets');
  const teams = db.collection('support_teams');
  const snapshots = db.collection('dashboard_metric_snapshots');

  app.get('/health', async (req, res, next) => {
    try {
      await db.command({ ping: 1 });
      res.status(200).json({ status: 'ok' });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/tickets', async (req, res, next) => {
    try {
      const validation = validateCreateTicket(req.body, ObjectId);
      if (!validation.valid) {
        return res.status(400).json(errorResponse('INVALID_REQUEST', validation.message));
      }

      const doc = validation.document;
      try {
        await tickets.insertOne(doc);
      } catch (err) {
        if (err && err.code === 11000) {
          return res.status(409).json(errorResponse('TICKET_ID_ALREADY_EXISTS', 'A ticket with the same ticket_id already exists.'));
        }
        const existing = await tickets.findOne({ ticket_id: doc.ticket_id }, { projection: { _id: 1 } });
        if (existing) {
          return res.status(409).json(errorResponse('TICKET_ID_ALREADY_EXISTS', 'A ticket with the same ticket_id already exists.'));
        }
        throw err;
      }

      res.status(201).json({
        ticket_id: doc.ticket_id,
        created: true,
        ticket: serializeTicket(doc),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/tickets/:ticketId', async (req, res, next) => {
    try {
      const ticket = await tickets.findOne({ ticket_id: req.params.ticketId });
      if (!ticket) {
        return res.status(404).json(errorResponse('TICKET_NOT_FOUND', 'No ticket exists for the supplied ticket_id.'));
      }
      res.status(200).json(serializeTicket(ticket));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/tickets/:ticketId/triage-suggestion', async (req, res, next) => {
    try {
      const ticket = await tickets.findOne({ ticket_id: req.params.ticketId });
      if (!ticket) {
        return res.status(404).json(errorResponse('TICKET_NOT_FOUND', 'No ticket exists for the supplied ticket_id.'));
      }

      let suggestedTeam = null;
      const suggestedTeamId = ticket.triage_suggestion && ticket.triage_suggestion.suggested_team_id;
      if (suggestedTeamId) {
        const team = await teams.findOne({ _id: suggestedTeamId });
        if (team) {
          suggestedTeam = {
            team_id: team.team_id,
            name: team.name,
            description: team.description ?? null,
            active: !!team.active,
          };
        }
      }

      res.status(200).json({
        ticket_id: ticket.ticket_id,
        subject: ticket.subject,
        description: ticket.description,
        customer_account_tier: ticket.customer_account_tier,
        product_line: ticket.product_line,
        manual_priority: ticket.manual_priority ?? null,
        status: ticket.status,
        triage_suggestion: ticket.triage_suggestion ? {
          suggested_priority: ticket.triage_suggestion.suggested_priority ?? null,
          generated_at: ticket.triage_suggestion.generated_at ? new Date(ticket.triage_suggestion.generated_at).toISOString() : null,
          model_version: ticket.triage_suggestion.model_version ?? null,
          confidence: typeof ticket.triage_suggestion.confidence === 'number' ? ticket.triage_suggestion.confidence : null,
        } : null,
        suggested_team: suggestedTeam,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/tickets/:ticketId/similar-resolved', async (req, res, next) => {
    try {
      const limit = parseLimit(req.query.limit);
      if (!limit.valid) {
        return res.status(400).json(errorResponse('INVALID_REQUEST', limit.message));
      }

      const current = await tickets.findOne({ ticket_id: req.params.ticketId });
      if (!current) {
        return res.status(404).json(errorResponse('TICKET_NOT_FOUND', 'No current ticket exists for the supplied ticket_id.'));
      }
      if (!Array.isArray(current.text_embedding) || current.text_embedding.length === 0) {
        return res.status(409).json(errorResponse('TICKET_EMBEDDING_MISSING', 'The current ticket does not have text_embedding, so the vector-search query pattern cannot be run.'));
      }

      let results = [];
      try {
        const pipeline = [
          {
            $vectorSearch: {
              index: 'default',
              path: 'text_embedding',
              queryVector: current.text_embedding,
              numCandidates: 50,
              limit: limit.value,
              filter: {
                is_historical_import: true,
                status: 'resolved',
                ticket_id: { $ne: current.ticket_id },
              },
            },
          },
          {
            $lookup: {
              from: 'support_teams',
              localField: 'assigned_team_id',
              foreignField: '_id',
              as: 'assigned_team_docs',
            },
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
              similarity_score: { $meta: 'vectorSearchScore' },
              assigned_team_docs: 1,
            },
          },
        ];
        results = await tickets.aggregate(pipeline).toArray();
      } catch (err) {
        if (String(err.message || '').toLowerCase().includes('vector')) {
          const historical = await tickets.find({
            is_historical_import: true,
            status: 'resolved',
            ticket_id: { $ne: current.ticket_id },
            text_embedding: { $exists: true, $type: 'array' },
          }).limit(100).toArray();

          const cosine = (a, b) => {
            let dot = 0, na = 0, nb = 0;
            const len = Math.min(a.length, b.length);
            for (let i = 0; i < len; i++) {
              const av = Number(a[i]) || 0;
              const bv = Number(b[i]) || 0;
              dot += av * bv;
              na += av * av;
              nb += bv * bv;
            }
            if (!na || !nb) return 0;
            return dot / (Math.sqrt(na) * Math.sqrt(nb));
          };

          results = historical
            .map((doc) => ({ ...doc, similarity_score: cosine(current.text_embedding, doc.text_embedding || []) }))
            .sort((a, b) => b.similarity_score - a.similarity_score)
            .slice(0, limit.value)
            .map((doc) => ({ ...doc, assigned_team_docs: [] }));
        } else {
          throw err;
        }
      }

      const enriched = [];
      for (const item of results) {
        let assignedTeam = null;
        const joined = item.assigned_team_docs && item.assigned_team_docs[0];
        if (joined) {
          assignedTeam = { team_id: joined.team_id, name: joined.name };
        } else if (item.assigned_team_id) {
          const team = await teams.findOne({ _id: item.assigned_team_id });
          if (team) assignedTeam = { team_id: team.team_id, name: team.name };
        }
        enriched.push({
          ticket_id: item.ticket_id,
          subject: item.subject,
          description: item.description,
          product_line: item.product_line,
          customer_account_tier: item.customer_account_tier,
          manual_priority: item.manual_priority ?? null,
          channel: item.channel ?? null,
          resolved_at: item.resolved_at ? new Date(item.resolved_at).toISOString() : null,
          resolution: item.resolution ? {
            category: item.resolution.category,
            summary: item.resolution.summary,
          } : null,
          assigned_team: assignedTeam,
          similarity_score: item.similarity_score,
        });
      }

      res.status(200).json({ ticket_id: current.ticket_id, results: enriched });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/teams', async (req, res, next) => {
    try {
      const filter = {};
      if (req.query.active !== undefined) {
        const parsed = parseBoolean(req.query.active);
        if (!parsed.valid) {
          return res.status(400).json(errorResponse('INVALID_REQUEST', 'active must be a boolean'));
        }
        filter.active = parsed.value;
      }

      const docs = await teams.find(filter).toArray();
      res.status(200).json({
        teams: docs.map((team) => ({
          id: String(team._id),
          team_id: team.team_id,
          name: team.name,
          description: team.description ?? null,
          active: !!team.active,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/dashboard/ticket-volume-by-product-line', async (req, res, next) => {
    handleDashboardMetric(req, res, next, {
      metric: 'ticket_volume_by_product_line',
      rawBuilder: buildRawProductLinePipeline,
      snapshotMapper: (doc) => ({
        time_bucket: new Date(doc.time_bucket_start).toISOString(),
        product_line: doc.dimension_key,
        ticket_count: doc.metric_value,
        last_computed_at: doc.last_computed_at ? new Date(doc.last_computed_at).toISOString() : null,
      }),
      rawMapper: (doc) => ({
        time_bucket: new Date(doc.time_bucket).toISOString(),
        product_line: doc.product_line,
        ticket_count: doc.ticket_count,
        last_computed_at: null,
      }),
    });
  });

  app.get('/api/dashboard/ticket-volume-by-priority', async (req, res, next) => {
    handleDashboardMetric(req, res, next, {
      metric: 'ticket_volume_by_priority',
      rawBuilder: buildRawPriorityPipeline,
      snapshotMapper: (doc) => ({
        time_bucket: new Date(doc.time_bucket_start).toISOString(),
        priority: doc.dimension_key,
        ticket_count: doc.metric_value,
        last_computed_at: doc.last_computed_at ? new Date(doc.last_computed_at).toISOString() : null,
      }),
      rawMapper: (doc) => ({
        time_bucket: new Date(doc.time_bucket).toISOString(),
        priority: doc.priority,
        ticket_count: doc.ticket_count,
        last_computed_at: null,
      }),
    });
  });

  app.get('/api/dashboard/avg-resolution-time-by-team', async (req, res, next) => {
    try {
      const parsed = parseDashboardParams(req.query, true);
      if (!parsed.valid) {
        return res.status(parsed.status).json(errorResponse(parsed.code, parsed.message));
      }
      const { startDate, endDate, source, granularity } = parsed;
      let points;

      if (source === 'raw') {
        const pipeline = [
          {
            $match: {
              resolved_at: { $gte: startDate, $lt: endDate },
              created_at: { $exists: true },
              assigned_team_id: { $exists: true, $ne: null },
              status: 'resolved',
            },
          },
          {
            $addFields: {
              resolution_hours: {
                $divide: [{ $subtract: ['$resolved_at', '$created_at'] }, 1000 * 60 * 60],
              },
            },
          },
          {
            $group: {
              _id: '$assigned_team_id',
              avg_resolution_hours: { $avg: '$resolution_hours' },
              resolved_ticket_count: { $sum: 1 },
            },
          },
          {
            $lookup: {
              from: 'support_teams',
              localField: '_id',
              foreignField: '_id',
              as: 'team',
            },
          },
          {
            $project: {
              _id: 0,
              team_id: { $toString: '$_id' },
              team_name: { $ifNull: [{ $arrayElemAt: ['$team.name', 0] }, 'Unknown'] },
              avg_resolution_hours: 1,
              resolved_ticket_count: 1,
              time_bucket: null,
              last_computed_at: null,
            },
          },
        ];
        points = (await tickets.aggregate(pipeline).toArray()).map((doc) => ({
          team_id: doc.team_id,
          team_name: doc.team_name,
          avg_resolution_hours: doc.avg_resolution_hours ?? null,
          resolved_ticket_count: doc.resolved_ticket_count ?? null,
          time_bucket: null,
          last_computed_at: null,
        }));
      } else {
        const pipeline = [
          {
            $match: {
              metric_name: 'avg_resolution_time_by_team',
              time_bucket_granularity: granularity,
              time_bucket_start: { $gte: startDate, $lt: endDate },
            },
          },
          {
            $project: {
              _id: 0,
              team_id: '$dimension_key',
              team_name: '$dimension_label',
              avg_resolution_hours: '$metric_value',
              resolved_ticket_count: null,
              time_bucket: '$time_bucket_start',
              last_computed_at: '$last_computed_at',
            },
          },
          { $sort: { time_bucket: 1, team_name: 1 } },
        ];
        points = (await snapshots.aggregate(pipeline).toArray()).map((doc) => ({
          team_id: doc.team_id,
          team_name: doc.team_name,
          avg_resolution_hours: doc.avg_resolution_hours ?? null,
          resolved_ticket_count: doc.resolved_ticket_count ?? null,
          time_bucket: doc.time_bucket ? new Date(doc.time_bucket).toISOString() : null,
          last_computed_at: doc.last_computed_at ? new Date(doc.last_computed_at).toISOString() : null,
        }));
      }

      res.status(200).json({
        metric: 'avg_resolution_time_by_team',
        source,
        granularity: source === 'raw' ? null : granularity,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        points,
      });
    } catch (err) {
      next(err);
    }
  });

  async function handleDashboardMetric(req, res, next, config) {
    try {
      const parsed = parseDashboardParams(req.query, false);
      if (!parsed.valid) {
        return res.status(parsed.status).json(errorResponse(parsed.code, parsed.message));
      }
      const { startDate, endDate, granularity, source } = parsed;
      let points = [];
      if (source === 'raw') {
        const pipeline = config.rawBuilder(startDate, endDate, granularity);
        points = (await tickets.aggregate(pipeline).toArray()).map(config.rawMapper);
      } else {
        const pipeline = [
          {
            $match: {
              metric_name: config.metric,
              time_bucket_granularity: granularity,
              time_bucket_start: { $gte: startDate, $lt: endDate },
            },
          },
          { $sort: { time_bucket_start: 1, dimension_key: 1 } },
          {
            $project: {
              _id: 0,
              time_bucket_start: 1,
              dimension_key: 1,
              dimension_label: 1,
              metric_value: 1,
              last_computed_at: 1,
            },
          },
        ];
        points = (await snapshots.aggregate(pipeline).toArray()).map(config.snapshotMapper);
      }

      res.status(200).json({
        metric: config.metric,
        source,
        granularity,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        points,
      });
    } catch (err) {
      next(err);
    }
  }

  function parseDashboardParams(query, allowMissingGranularityForRaw) {
    const start = parseDateString(query.startDate);
    const end = parseDateString(query.endDate);
    if (!start.valid || !end.valid || start.value >= end.value) {
      return { valid: false, status: 400, code: 'INVALID_DATE_RANGE', message: 'startDate/endDate are missing, malformed, or startDate is not before endDate.' };
    }
    const source = query.source || 'raw';
    if (!['raw', 'snapshot'].includes(source)) {
      return { valid: false, status: 400, code: 'INVALID_REQUEST', message: 'source must be raw or snapshot.' };
    }
    const granularity = query.granularity;
    if (source === 'snapshot' || !allowMissingGranularityForRaw || granularity !== undefined) {
      if (!['hour', 'day', 'week'].includes(granularity)) {
        return { valid: false, status: 400, code: 'INVALID_GRANULARITY', message: 'granularity is invalid, or omitted when required.' };
      }
    }
    return { valid: true, startDate: start.value, endDate: end.value, source, granularity: granularity || null };
  }

  function buildRawProductLinePipeline(startDate, endDate, granularity) {
    return [
      { $match: { created_at: { $gte: startDate, $lt: endDate } } },
      {
        $group: {
          _id: {
            time_bucket: getBucketDateExpression(granularity, '$created_at'),
            product_line: '$product_line',
          },
          ticket_count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          time_bucket: '$_id.time_bucket',
          product_line: '$_id.product_line',
          ticket_count: 1,
        },
      },
      { $sort: { time_bucket: 1, product_line: 1 } },
    ];
  }

  function buildRawPriorityPipeline(startDate, endDate, granularity) {
    return [
      { $match: { created_at: { $gte: startDate, $lt: endDate } } },
      {
        $group: {
          _id: {
            time_bucket: getBucketDateExpression(granularity, '$created_at'),
            priority: { $ifNull: ['$manual_priority', 'unassigned'] },
          },
          ticket_count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          time_bucket: '$_id.time_bucket',
          priority: '$_id.priority',
          ticket_count: 1,
        },
      },
      { $sort: { time_bucket: 1, priority: 1 } },
    ];
  }

  app.use((req, res) => {
    res.status(404).json(errorResponse('NOT_FOUND', 'Endpoint not found.'));
  });

  app.use((err, req, res, next) => {
    console.error(JSON.stringify({
      level: 'error',
      message: 'request_failed',
      method: req.method,
      path: req.path,
      error: err.message,
    }));
    res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'An unexpected error occurred.'));
  });

  return app;
}

module.exports = { createApp };