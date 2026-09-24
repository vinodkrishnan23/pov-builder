import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { EmptyState, ErrorMessage, InlineWarning, LoadingIndicator } from '../components/StatusBlocks';
import { api } from '../lib/api';
import { formatDateTime, getErrorText } from '../lib/utils';

export default function TicketReviewPage() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [ticketState, setTicketState] = useState({ loading: true, error: null, data: null });
  const [triageState, setTriageState] = useState({ loading: true, error: null, data: null });
  const [similarState, setSimilarState] = useState({ loading: true, error: null, data: null });
  const [teamsWarning, setTeamsWarning] = useState('');
  const [similarLimit, setSimilarLimit] = useState(4);

  useEffect(() => {
    api.listTeams().catch(() => setTeamsWarning('Support team reference could not be refreshed.'));
  }, [ticketId]);

  const loadTicket = useCallback(() => {
    setTicketState({ loading: true, error: null, data: null });
    api.getTicket(ticketId)
      .then((data) => setTicketState({ loading: false, error: null, data }))
      .catch((error) => setTicketState({ loading: false, error, data: null }));
  }, [ticketId]);

  const loadTriage = useCallback(() => {
    setTriageState((prev) => ({ ...prev, loading: true, error: null }));
    api.getTriageSuggestion(ticketId)
      .then((data) => setTriageState({ loading: false, error: null, data }))
      .catch((error) => setTriageState({ loading: false, error, data: null }));
  }, [ticketId]);

  const loadSimilar = useCallback((limitValue = similarLimit) => {
    setSimilarState((prev) => ({ ...prev, loading: true, error: null }));
    api.getSimilarResolved(ticketId, limitValue)
      .then((data) => setSimilarState({ loading: false, error: null, data }))
      .catch((error) => setSimilarState({ loading: false, error, data: null }));
  }, [ticketId, similarLimit]);

  useEffect(() => {
    loadTicket();
    loadTriage();
  }, [loadTicket, loadTriage]);

  useEffect(() => {
    loadSimilar(similarLimit);
  }, [loadSimilar, similarLimit]);

  const pageNotFound = useMemo(() => {
    const ticketMissing = ticketState.error?.status === 404;
    const triageMissing = triageState.error?.status === 404;
    const similarMissing = similarState.error?.status === 404;
    return ticketMissing || (triageMissing && !ticketState.loading && !ticketState.data) || (similarMissing && !ticketState.loading && !ticketState.data);
  }, [ticketState, triageState, similarState]);

  if (ticketState.loading) {
    return (
      <div>
        <PageHeader title="Ticket Review" subtitle="Loading ticket review context..." />
        <LoadingIndicator text="Loading ticket details..." />
      </div>
    );
  }

  if (pageNotFound) {
    return (
      <div>
        <PageHeader title="Ticket Review" subtitle="Direct review for a known ticket ID." />
        <EmptyState text={`Ticket ${ticketId} was not found.`}>
          <div className="inline-actions">
            <button className="button" onClick={() => navigate('/tickets/new')}>Create new simulated ticket</button>
            <Link className="button secondary" to="/">Go home</Link>
          </div>
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Ticket Review"
        subtitle={`Review stored triage assistance and similar resolved tickets for ${ticketId}.`}
        actions={(
          <div className="inline-actions">
            <button className="button secondary" data-testid="review-create-another" onClick={() => navigate('/tickets/new')}>Create another ticket</button>
            <button className="button" data-testid="review-open-dashboard" onClick={() => navigate('/dashboard')}>Open dashboard</button>
          </div>
        )}
      />
      {teamsWarning ? <InlineWarning text={teamsWarning} /> : null}
      {ticketState.error ? <ErrorMessage text={getErrorText(ticketState.error, 'Failed to load ticket.')} /> : null}
      {ticketState.data ? (
        <div className="grid two-up review-layout">
          <section className="card">
            <h2 data-testid="ticket-detail-view">Ticket summary</h2>
            <div className="kv-list">
              <div><span>ID</span><strong>{ticketState.data.ticket_id}</strong></div>
              <div><span>Status</span><strong>{ticketState.data.status}</strong></div>
              <div><span>Product line</span><strong>{ticketState.data.product_line}</strong></div>
              <div><span>Customer tier</span><strong>{ticketState.data.customer_account_tier}</strong></div>
              <div><span>Manual priority</span><strong>{ticketState.data.manual_priority || '—'}</strong></div>
              <div><span>Channel</span><strong>{ticketState.data.channel || '—'}</strong></div>
              <div><span>Created</span><strong>{formatDateTime(ticketState.data.created_at)}</strong></div>
              <div><span>Triaged</span><strong>{formatDateTime(ticketState.data.triaged_at)}</strong></div>
              <div><span>Resolved</span><strong>{formatDateTime(ticketState.data.resolved_at)}</strong></div>
            </div>
            <div className="subsection">
              <h3>Subject</h3>
              <p>{ticketState.data.subject}</p>
              <h3>Description</h3>
              <p className="prewrap">{ticketState.data.description}</p>
            </div>
            {ticketState.data.resolution ? (
              <div className="subsection">
                <h3>Stored resolution</h3>
                <p><strong>{ticketState.data.resolution.category || '—'}</strong></p>
                <p>{ticketState.data.resolution.summary || '—'}</p>
              </div>
            ) : null}
          </section>

          <div className="stack gap-md">
            <section className="card">
              <div className="card-header-row">
                <h2>Triage suggestion</h2>
                <button className="button secondary" data-testid="triage-retry-button" onClick={loadTriage}>Retry</button>
              </div>
              {triageState.loading ? <LoadingIndicator text="Loading triage suggestion..." /> : null}
              {!triageState.loading && triageState.error ? <ErrorMessage text={getErrorText(triageState.error, 'Failed to load triage suggestion.')} /> : null}
              {!triageState.loading && !triageState.error && triageState.data && !triageState.data.triage_suggestion && !triageState.data.suggested_team ? (
                <EmptyState text="No stored triage suggestion is available yet." />
              ) : null}
              {!triageState.loading && !triageState.error && triageState.data && (triageState.data.triage_suggestion || triageState.data.suggested_team) ? (
                <div className="kv-list">
                  <div><span>Suggested priority</span><strong>{triageState.data.triage_suggestion?.suggested_priority || '—'}</strong></div>
                  <div><span>Confidence</span><strong>{triageState.data.triage_suggestion?.confidence ?? '—'}</strong></div>
                  <div><span>Generated at</span><strong>{formatDateTime(triageState.data.triage_suggestion?.generated_at)}</strong></div>
                  <div><span>Model version</span><strong>{triageState.data.triage_suggestion?.model_version || '—'}</strong></div>
                  <div><span>Suggested team</span><strong>{triageState.data.suggested_team?.name || '—'}</strong></div>
                  <div><span>Team description</span><strong>{triageState.data.suggested_team?.description || '—'}</strong></div>
                </div>
              ) : null}
            </section>

            <section className="card">
              <div className="card-header-row">
                <h2>Similar resolved tickets</h2>
                <div className="inline-actions">
                  <select data-testid="similar-limit-toggle" value={similarLimit} onChange={(e) => setSimilarLimit(Number(e.target.value))}>
                    <option value={3}>Show 3</option>
                    <option value={4}>Show 4</option>
                  </select>
                  <button className="button secondary" data-testid="similar-retry-button" onClick={() => loadSimilar(similarLimit)}>Retry</button>
                </div>
              </div>
              {similarState.loading ? <LoadingIndicator text="Loading similar resolved tickets..." /> : null}
              {!similarState.loading && similarState.error?.status === 409 && similarState.error?.code === 'TICKET_EMBEDDING_MISSING' ? (
                <EmptyState text="Similar-ticket retrieval is unavailable because this ticket does not have a stored text_embedding." />
              ) : null}
              {!similarState.loading && similarState.error && !(similarState.error.status === 409 && similarState.error.code === 'TICKET_EMBEDDING_MISSING') ? (
                <ErrorMessage text={getErrorText(similarState.error, 'Failed to load similar tickets.')} />
              ) : null}
              {!similarState.loading && !similarState.error && (!similarState.data?.results || similarState.data.results.length === 0) ? (
                <EmptyState text="No similar resolved tickets were returned." />
              ) : null}
              {!similarState.loading && !similarState.error && similarState.data?.results?.length > 0 ? (
                <div className="stack gap-sm" data-testid="similar-results-list">
                  {similarState.data.results.map((result) => (
                    <article className="similar-ticket" key={result.ticket_id}>
                      <div className="card-header-row">
                        <strong>{result.ticket_id} · {result.subject}</strong>
                        <span className="badge">Similarity {typeof result.similarity_score === 'number' ? result.similarity_score.toFixed(3) : '—'}</span>
                      </div>
                      <p className="prewrap">{result.description}</p>
                      <div className="kv-list compact">
                        <div><span>Product line</span><strong>{result.product_line}</strong></div>
                        <div><span>Tier</span><strong>{result.customer_account_tier}</strong></div>
                        <div><span>Priority</span><strong>{result.manual_priority || '—'}</strong></div>
                        <div><span>Channel</span><strong>{result.channel || '—'}</strong></div>
                        <div><span>Resolved</span><strong>{formatDateTime(result.resolved_at)}</strong></div>
                        <div><span>Assigned team</span><strong>{result.assigned_team?.name || '—'}</strong></div>
                      </div>
                      <div className="resolution-block">
                        <h4>Resolution summary</h4>
                        <p><strong>{result.resolution?.category || '—'}</strong></p>
                        <p>{result.resolution?.summary || '—'}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
