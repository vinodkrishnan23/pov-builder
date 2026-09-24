const express = require('express');
const { ObjectId } = require('mongodb');

function log(level, msg, extra = {}) {
  const payload = { level, msg, ...extra };
  if (level === 'error') {
    console.error(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

function createError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseDateRange(req) {
  const { start_date, end_date } = req.query;
  const start = new Date(start_date);
  const end = new Date(end_date);
  if (!start_date || !end_date || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw createError(400, 'INVALID_DATE_RANGE', 'start_date and end_date must be valid and start_date must be earlier than or equal to end_date.');
  }
  return { start, end };
}

function projectTeam(team) {
  if (!team) return null;
  return {
    _id: team._id,
    team_code: team.team_code,
    name: team.name,
    description: team.description ?? null,
    active: team.active
  };
}

function buildListTicket(ticket) {
  return {
    id: ticket._id,
    ticket_id: ticket.ticket_id,
    channel: ticket.channel,
    subject: ticket.subject,
    customer_account_tier: ticket.customer_account_tier,
    product_line: ticket.product_line,
    status: ticket.status,
    created_at: ticket.created_at,
    priority: ticket.priority ?? null,
    priority_suggestion: {
      value: ticket.priority_suggestion?.value ?? null,
      confidence: ticket.priority_suggestion?.confidence ?? null
    },
    routing_suggestion: {
      team_id: ticket.routing_suggestion?.team_id ?? null,
      confidence: ticket.routing_suggestion?.confidence ?? null
    }
  };
}

function createApp({ db }) {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    log('info', 'request', { method: req.method, path: req.path, query: req.query });
    next();
  });

  app.get('/health', async (req, res, next) => {
    try {
      await db.command({ ping: 1 });
      res.status(200).json({ status: 'ok' });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/tickets', async (req, res, next) => {
    try {
      let status = req.query.status;
      if (status === undefined) {
        status = ['new', 'open'];
      } else if (Array.isArray(status)) {
        status = status;
      } else if (typeof status === 'string') {
        status = status.split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        throw createError(400, 'INVALID_QUERY_PARAMETER', 'One or more query parameters are invalid.');
      }

      const allowedStatuses = ['new', 'open'];
      if (status.length === 0 || status.some((s) => !allowedStatuses.includes(s))) {
        throw createError(400, 'INVALID_QUERY_PARAMETER', 'One or more query parameters are invalid.');
      }

      const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw createError(400, 'INVALID_QUERY_PARAMETER', 'One or more query parameters are invalid.');
      }

      const sort = req.query.sort === undefined ? '-created_at' : req.query.sort;
      if (sort !== '-created_at') {
        throw createError(400, 'INVALID_QUERY_PARAMETER', 'One or more query parameters are invalid.');
      }

      const tickets = await db.collection('support_tickets')
        .find({ status: { $in: status } })
        .sort({ created_at: -1 })
        .limit(limit)
        .project({
          ticket_id: 1,
          channel: 1,
          subject: 1,
          customer_account_tier: 1,
          product_line: 1,
          status: 1,
          created_at: 1,
          priority: 1,
          priority_suggestion: 1,
          routing_suggestion: 1
        })
        .toArray();

      res.status(200).json({ tickets: tickets.map(buildListTicket), count: tickets.length });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/tickets/:ticketId', async (req, res, next) => {
    try {
      const ticketId = req.params.ticketId;
      if (!isNonEmptyString(ticketId)) {
        throw createError(400, 'INVALID_TICKET_ID', 'ticketId is invalid or empty.');
      }

      const results = await db.collection('support_tickets').aggregate([
        { $match: { ticket_id: ticketId } },
        {
          $lookup: {
            from: 'support_teams',
            localField: 'routing_suggestion.team_id',
            foreignField: '_id',
            as: 'suggested_team_docs'
          }
        },
        {
          $lookup: {
            from: 'support_teams',
            localField: 'routing_team_id',
            foreignField: '_id',
            as: 'actual_team_docs'
          }
        },
        {
          $addFields: {
            suggested_team: { $arrayElemAt: ['$suggested_team_docs', 0] },
            actual_team: { $arrayElemAt: ['$actual_team_docs', 0] }
          }
        },
        {
          $project: {
            suggested_team_docs: 0,
            actual_team_docs: 0
          }
        }
      ]).toArray();

      const ticket = results[0];
      if (!ticket) {
        throw createError(404, 'TICKET_NOT_FOUND', 'No ticket exists for the provided ticketId.');
      }

      res.status(200).json({
        ticket: {
          id: ticket._id,
          ticket_id: ticket.ticket_id,
          channel: ticket.channel,
          subject: ticket.subject,
          description: ticket.description,
          text_combined: ticket.text_combined,
          customer_account_tier: ticket.customer_account_tier,
          product_line: ticket.product_line,
          status: ticket.status,
          created_at: ticket.created_at,
          priority: ticket.priority ?? null,
          priority_suggestion: {
            value: ticket.priority_suggestion?.value ?? null,
            confidence: ticket.priority_suggestion?.confidence ?? null,
            generated_at: ticket.priority_suggestion?.generated_at ?? null,
            model_version: ticket.priority_suggestion?.model_version ?? null
          },
          routing_suggestion: {
            team_id: ticket.routing_suggestion?.team_id ?? null,
            confidence: ticket.routing_suggestion?.confidence ?? null,
            generated_at: ticket.routing_suggestion?.generated_at ?? null,
            model_version: ticket.routing_suggestion?.model_version ?? null,
            advisory_only: ticket.routing_suggestion?.advisory_only ?? null
          },
          suggested_team: projectTeam(ticket.suggested_team),
          routing_team_id: ticket.routing_team_id ?? null,
          actual_team: projectTeam(ticket.actual_team),
          resolution_category: ticket.resolution_category ?? null,
          resolution_summary: ticket.resolution_summary ?? null,
          triage: {
            triaged_at: ticket.triage?.triaged_at ?? null,
            triaged_by: ticket.triage?.triaged_by ?? null,
            notes: ticket.triage?.notes ?? null
          }
        }
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/tickets/:ticketId/similar-resolved', async (req, res, next) => {
    try {
      const ticketId = req.params.ticketId;
      const sourceTicket = await db.collection('support_tickets').findOne({ ticket_id: ticketId });
      if (!sourceTicket) {
        throw createError(404, 'TICKET_NOT_FOUND', 'No source ticket exists for the provided ticketId.');
      }
      if (!Array.isArray(sourceTicket.embedding) || sourceTicket.embedding.length === 0 || !isNonEmptyString(sourceTicket.text_combined)) {
        throw createError(422, 'EMBEDDING_UNAVAILABLE', 'Similarity retrieval could not be performed because query text or embedding could not be produced for the source ticket.');
      }

      const pipeline = [
        {
          $vectorSearch: {
            index: 'ticket_similarity_vector',
            path: 'embedding',
            queryVector: sourceTicket.embedding,
            numCandidates: 50,
            limit: 4,
            filter: {
              status: 'resolved',
              ticket_id: { $ne: sourceTicket.ticket_id }
            }
          }
        },
        {
          $lookup: {
            from: 'support_teams',
            localField: 'routing_team_id',
            foreignField: '_id',
            as: 'resolved_team_docs'
          }
        },
        {
          $addFields: {
            resolved_team: { $arrayElemAt: ['$resolved_team_docs', 0] },
            score: { $meta: 'vectorSearchScore' }
          }
        },
        {
          $project: {
            resolved_team_docs: 0
          }
        }
      ];

      let similar;
      try {
        similar = await db.collection('support_tickets').aggregate(pipeline).toArray();
      } catch (err) {
        throw createError(500, 'SIMILARITY_QUERY_FAILED', 'The similar-ticket retrieval query failed.');
      }

      res.status(200).json({
        ticket_id: sourceTicket.ticket_id,
        similar_tickets: similar.map((ticket) => ({
          id: ticket._id,
          ticket_id: ticket.ticket_id,
          subject: ticket.subject,
          description: ticket.description,
          product_line: ticket.product_line,
          customer_account_tier: ticket.customer_account_tier,
          priority: ticket.priority ?? null,
          routing_team_id: ticket.routing_team_id ?? null,
          resolved_team: projectTeam(ticket.resolved_team),
          resolution_category: ticket.resolution_category ?? null,
          resolution_summary: ticket.resolution_summary ?? null,
          resolved_at: ticket.resolved_at ?? null,
          score: ticket.score
        }))
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/dashboard/ticket-volume-by-product-line', async (req, res, next) => {
    try {
      const { start, end } = parseDateRange(req);
      const results = await db.collection('support_tickets').aggregate([
        { $match: { created_at: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: {
              date: { $dateTrunc: { date: '$created_at', unit: 'day' } },
              product_line: '$product_line'
            },
            ticket_count: { $sum: 1 }
          }
        },
        { $sort: { '_id.date': 1, '_id.product_line': 1 } },
        {
          $project: {
            _id: 0,
            date: '$_id.date',
            product_line: '$_id.product_line',
            ticket_count: 1
          }
        }
      ]).toArray();

      res.status(200).json({
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        granularity: 'day',
        results
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/dashboard/ticket-volume-by-priority', async (req, res, next) => {
    try {
      const { start, end } = parseDateRange(req);
      const results = await db.collection('support_tickets').aggregate([
        { $match: { created_at: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: {
              date: { $dateTrunc: { date: '$created_at', unit: 'day' } },
              priority: '$priority'
            },
            ticket_count: { $sum: 1 }
          }
        },
        { $sort: { '_id.date': 1, '_id.priority': 1 } },
        {
          $project: {
            _id: 0,
            date: '$_id.date',
            priority: '$_id.priority',
            ticket_count: 1
          }
        }
      ]).toArray();

      res.status(200).json({
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        granularity: 'day',
        results
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/dashboard/average-resolution-time-by-team', async (req, res, next) => {
    try {
      const { start, end } = parseDateRange(req);
      const results = await db.collection('support_tickets').aggregate([
        {
          $match: {
            status: 'resolved',
            resolved_at: { $gte: start, $lte: end },
            routing_team_id: { $exists: true },
            created_at: { $type: 'date' },
            resolved_at: { $type: 'date', $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: '$routing_team_id',
            avg_resolution_time_hours: {
              $avg: {
                $divide: [
                  { $subtract: ['$resolved_at', '$created_at'] },
                  1000 * 60 * 60
                ]
              }
            },
            resolved_ticket_count: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'support_teams',
            localField: '_id',
            foreignField: '_id',
            as: 'team_docs'
          }
        },
        {
          $addFields: {
            team: { $arrayElemAt: ['$team_docs', 0] }
          }
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            team_id: '$_id',
            team: 1,
            avg_resolution_time_hours: 1,
            resolved_ticket_count: 1
          }
        }
      ]).toArray();

      res.status(200).json({
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        results: results.map((r) => ({
          team_id: r.team_id,
          team: projectTeam(r.team),
          avg_resolution_time_hours: r.avg_resolution_time_hours,
          resolved_ticket_count: r.resolved_ticket_count
        }))
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/tickets/:ticketId/resolve', async (req, res, next) => {
    try {
      const ticketId = req.params.ticketId;
      if (!isNonEmptyString(ticketId)) {
        throw createError(404, 'TICKET_NOT_FOUND', 'No ticket exists for the provided ticketId.');
      }

      const { resolution_category, resolution_summary, resolved_at } = req.body || {};
      if (!isNonEmptyString(resolution_category) || !isNonEmptyString(resolution_summary)) {
        throw createError(400, 'INVALID_REQUEST_BODY', 'resolution_category and resolution_summary are required and must be valid strings.');
      }

      let resolvedAt = new Date();
      if (resolved_at !== undefined) {
        resolvedAt = new Date(resolved_at);
        if (Number.isNaN(resolvedAt.getTime())) {
          throw createError(400, 'INVALID_REQUEST_BODY', 'resolution_category and resolution_summary are required and must be valid strings.');
        }
      }

      const existing = await db.collection('support_tickets').findOne({ ticket_id: ticketId }, { projection: { status: 1, ticket_id: 1 } });
      if (!existing) {
        throw createError(404, 'TICKET_NOT_FOUND', 'No ticket exists for the provided ticketId.');
      }
      if (existing.status === 'resolved') {
        throw createError(409, 'TICKET_ALREADY_RESOLVED', 'The ticket is already resolved.');
      }

      await db.collection('support_tickets').updateOne(
        { ticket_id: ticketId },
        {
          $set: {
            status: 'resolved',
            resolved_at: resolvedAt,
            resolution_category: resolution_category.trim(),
            resolution_summary: resolution_summary.trim()
          }
        }
      );

      res.status(200).json({
        ticket_id: ticketId,
        status: 'resolved',
        resolved_at: resolvedAt.toISOString(),
        resolution_category: resolution_category.trim(),
        resolution_summary: resolution_summary.trim()
      });
    } catch (err) {
      next(err);
    }
  });

  app.use((req, res) => {
    sendError(res, 404, 'NOT_FOUND', 'Route not found.');
  });

  app.use((err, req, res, next) => {
    log('error', 'request_failed', {
      method: req.method,
      path: req.path,
      error: err.message,
      code: err.code,
      status: err.status,
      stack: err.stack
    });
    const status = err.status || 500;
    const code = err.code || 'INTERNAL_SERVER_ERROR';
    const message = err.code ? err.message : 'An unexpected error occurred.';
    res.status(status).json({ error: { code, message } });
  });

  return app;
}

module.exports = { createApp };
