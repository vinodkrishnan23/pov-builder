import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatConfidence, formatDateTime } from '../lib/format';
import { ConfidenceIndicator, PriorityBadge, StatusBadge } from '../components/Badges';
import { EmptyState, ErrorMessage, LoadingIndicator, PageHeader, SectionCard } from '../components/Common';

export default function TicketDetailPage() {
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [ticketLoading, setTicketLoading] = useState(true);
  const [ticketError, setTicketError] = useState(null);
  const [similarLoading, setSimilarLoading] = useState(true);
  const [similarError, setSimilarError] = useState(null);
  const [similarUnavailable, setSimilarUnavailable] = useState(null);
  const [similarTickets, setSimilarTickets] = useState([]);
  const [formValues, setFormValues] = useState({ resolution_category: '', resolution_summary: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadTicket = async (isRefresh = false) => {
    setTicketError(null);
    if (isRefresh) setRefreshing(true);
    else setTicketLoading(true);
    try {
      const data = await api.getTicketDetails(ticketId);
      setTicket(data.ticket);
    } catch (err) {
      setTicketError(err);
    } finally {
      setTicketLoading(false);
      setRefreshing(false);
    }
  };

  const loadSimilar = async () => {
    setSimilarLoading(true);
    setSimilarError(null);
    setSimilarUnavailable(null);
    try {
      const data = await api.getSimilarResolvedTickets(ticketId);
      setSimilarTickets(data.similar_tickets || []);
    } catch (err) {
      if (err.status === 422 && err.code === 'EMBEDDING_UNAVAILABLE') {
        setSimilarUnavailable('Similar historical matches are unavailable for this ticket right now.');
      } else if (err.status === 404 && err.code === 'TICKET_NOT_FOUND') {
        setSimilarError('Similar ticket lookup could not confirm the source ticket.');
      } else {
        setSimilarError('Unable to load similar resolved tickets.');
      }
    } finally {
      setSimilarLoading(false);
    }
  };

  useEffect(() => {
    loadTicket();
    loadSimilar();
  }, [ticketId]);

  const submitResolve = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!formValues.resolution_category.trim()) errors.resolution_category = 'Resolution category is required.';
    if (!formValues.resolution_summary.trim()) errors.resolution_summary = 'Resolution summary is required.';
    setFieldErrors(errors);
    setSubmitError(null);
    setSubmitSuccess(null);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      const result = await api.resolveTicket(ticketId, formValues);
      setSubmitSuccess(`Ticket ${result.ticket_id} marked resolved.`);
      await loadTicket(true);
    } catch (err) {
      if (err.status === 400 && err.code === 'INVALID_REQUEST_BODY') {
        setSubmitError('Please correct the required resolution fields.');
      } else if (err.status === 404 && err.code === 'TICKET_NOT_FOUND') {
        setSubmitError('Ticket was not found. Return to the queue to continue.');
      } else if (err.status === 409 && err.code === 'TICKET_ALREADY_RESOLVED') {
        setSubmitError('This ticket was already resolved. Ticket details have been refreshed.');
        await loadTicket(true);
      } else {
        setSubmitError('Unable to resolve the ticket right now. Please retry.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (ticketLoading && !ticket) {
    return (
      <div>
        <PageHeader title="Ticket Triage Workspace" actions={<Link className="button secondary" to="/tickets">Back to Queue</Link>}>
          Review ticket details, AI suggestions, and historical context.
        </PageHeader>
        <LoadingIndicator text="Loading ticket workspace…" />
      </div>
    );
  }

  if (ticketError) {
    if (ticketError.status === 404 && ticketError.code === 'TICKET_NOT_FOUND') {
      return (
        <div>
          <PageHeader title="Ticket Triage Workspace" actions={<Link className="button secondary" to="/tickets">Back to Queue</Link>}>
            Review ticket details, AI suggestions, and historical context.
          </PageHeader>
          <ErrorMessage message="Ticket not found." action={<Link className="button" to="/tickets">Return to Queue</Link>} />
        </div>
      );
    }
    if (ticketError.status === 400 && ticketError.code === 'INVALID_TICKET_ID') {
      return (
        <div>
          <PageHeader title="Ticket Triage Workspace" actions={<Link className="button secondary" to="/tickets">Back to Queue</Link>}>
            Review ticket details, AI suggestions, and historical context.
          </PageHeader>
          <ErrorMessage message="Invalid ticket identifier." action={<Link className="button" to="/tickets">Return to Queue</Link>} />
        </div>
      );
    }
    return (
      <div>
        <PageHeader title="Ticket Triage Workspace" actions={<Link className="button secondary" to="/tickets">Back to Queue</Link>}>
          Review ticket details, AI suggestions, and historical context.
        </PageHeader>
        <ErrorMessage message="Unable to load ticket details." action={<button className="button" onClick={() => loadTicket()}>Retry</button>} />
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Ticket Triage Workspace"
        actions={
          <div className="action-row">
            <button data-testid="ticket-detail-refresh" className="button" onClick={() => loadTicket(true)} disabled={refreshing}>
              {refreshing ? 'Updating…' : 'Refresh Ticket'}
            </button>
            <Link className="button secondary" to="/tickets">Back to Queue</Link>
          </div>
        }
      >
        Ticket {ticket?.ticket_id} · Advisory routing suggestions only.
      </PageHeader>

      {submitSuccess ? <div className="success-banner">{submitSuccess}</div> : null}
      {refreshing ? <LoadingIndicator text="Refreshing ticket details…" /> : null}

      <div className="detail-grid">
        <SectionCard title="Ticket Details">
          <div className="details-grid" data-testid="ticket-detail-view">
            <div><strong>Ticket ID:</strong> {ticket.ticket_id}</div>
            <div><strong>Channel:</strong> {ticket.channel}</div>
            <div><strong>Status:</strong> <StatusBadge status={ticket.status} /></div>
            <div><strong>Created:</strong> {formatDateTime(ticket.created_at)}</div>
            <div><strong>Customer Tier:</strong> {ticket.customer_account_tier}</div>
            <div><strong>Product Line:</strong> {ticket.product_line}</div>
            <div><strong>Actual Priority:</strong> <PriorityBadge priority={ticket.priority} /></div>
            <div><strong>Resolution Category:</strong> {ticket.resolution_category || '—'}</div>
            <div className="full-width"><strong>Subject:</strong> {ticket.subject}</div>
            <div className="full-width"><strong>Description:</strong><p>{ticket.description}</p></div>
            <div className="full-width"><strong>Combined Text:</strong><p>{ticket.text_combined}</p></div>
            <div><strong>Triaged At:</strong> {formatDateTime(ticket.triage?.triaged_at)}</div>
            <div><strong>Triaged By:</strong> {ticket.triage?.triaged_by || '—'}</div>
            <div className="full-width"><strong>Triage Notes:</strong><p>{ticket.triage?.notes || '—'}</p></div>
            <div className="full-width"><strong>Resolution Summary:</strong><p>{ticket.resolution_summary || '—'}</p></div>
          </div>
        </SectionCard>

        <SectionCard title="Triage Suggestions">
          <div className="stack-md">
            <div>
              <h3>Suggested Priority</h3>
              <PriorityBadge priority={ticket.priority_suggestion?.value} />
              <div><ConfidenceIndicator value={ticket.priority_suggestion?.confidence} /></div>
              <div>Generated: {formatDateTime(ticket.priority_suggestion?.generated_at)}</div>
              <div>Model Version: {ticket.priority_suggestion?.model_version || '—'}</div>
            </div>
            <div>
              <h3>Suggested Routing</h3>
              <div>Suggested Team ID: {ticket.routing_suggestion?.team_id || '—'}</div>
              <div>Suggested Team: {ticket.suggested_team?.name || '—'}</div>
              <div>Suggested Team Code: {ticket.suggested_team?.team_code || '—'}</div>
              <div>Confidence: {formatConfidence(ticket.routing_suggestion?.confidence)}</div>
              <div>Generated: {formatDateTime(ticket.routing_suggestion?.generated_at)}</div>
              <div>Model Version: {ticket.routing_suggestion?.model_version || '—'}</div>
              <div>Advisory Only: {String(ticket.routing_suggestion?.advisory_only ?? true)}</div>
            </div>
            <div>
              <h3>Actual Routing Context</h3>
              <div>Actual Team ID: {ticket.routing_team_id || '—'}</div>
              <div>Actual Team: {ticket.actual_team?.name || '—'}</div>
              <div>Actual Team Code: {ticket.actual_team?.team_code || '—'}</div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Similar Resolved Tickets"
        extra={!similarLoading ? <button data-testid="similar-tickets-retry" className="button secondary" onClick={loadSimilar}>Refresh Similar Matches</button> : null}
      >
        {similarLoading ? (
          <LoadingIndicator text="Loading similar resolved tickets…" />
        ) : similarUnavailable ? (
          <ErrorMessage message={similarUnavailable} />
        ) : similarError ? (
          <ErrorMessage message={similarError} action={<button className="button" onClick={loadSimilar}>Retry</button>} />
        ) : similarTickets.length === 0 ? (
          <EmptyState message="No similar resolved tickets were found for this ticket." />
        ) : (
          <div className="similar-grid" data-testid="similar-tickets-list">
            {similarTickets.map((item) => (
              <article className="similar-card" key={item.id || item.ticket_id}>
                <div className="similar-top">
                  <strong>{item.ticket_id}</strong>
                  <span className="score">Similarity score: {item.score?.toFixed ? item.score.toFixed(3) : item.score}</span>
                </div>
                <h3>{item.subject}</h3>
                <p>{item.description}</p>
                <div className="meta-grid">
                  <div><strong>Product:</strong> {item.product_line}</div>
                  <div><strong>Tier:</strong> {item.customer_account_tier}</div>
                  <div><strong>Priority:</strong> {item.priority || '—'}</div>
                  <div><strong>Resolved Team:</strong> {item.resolved_team?.name || '—'}</div>
                  <div><strong>Resolution Category:</strong> {item.resolution_category || '—'}</div>
                  <div><strong>Resolved At:</strong> {formatDateTime(item.resolved_at)}</div>
                </div>
                <div><strong>Resolution Summary:</strong> {item.resolution_summary || '—'}</div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Resolve Ticket">
        {submitError ? <ErrorMessage message={submitError} /> : null}
        <form className="resolve-form" onSubmit={submitResolve} data-testid="resolve-ticket-form">
          <label>
            <span>Resolution Category</span>
            <input
              data-testid="resolve-category-input"
              value={formValues.resolution_category}
              onChange={(e) => setFormValues((current) => ({ ...current, resolution_category: e.target.value }))}
              placeholder="e.g. billing correction"
            />
            {fieldErrors.resolution_category ? <div className="field-error">{fieldErrors.resolution_category}</div> : null}
          </label>
          <label>
            <span>Resolution Summary</span>
            <textarea
              data-testid="resolve-summary-input"
              rows="5"
              value={formValues.resolution_summary}
              onChange={(e) => setFormValues((current) => ({ ...current, resolution_summary: e.target.value }))}
              placeholder="Describe the issue resolution for future triage context."
            />
            {fieldErrors.resolution_summary ? <div className="field-error">{fieldErrors.resolution_summary}</div> : null}
          </label>
          <button data-testid="resolve-submit-button" className="button" type="submit" disabled={submitting}>
            {submitting ? 'Resolving…' : 'Mark Ticket Resolved'}
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
