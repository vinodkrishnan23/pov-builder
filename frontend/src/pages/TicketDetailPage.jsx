import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { EmptyState, ErrorMessage, FieldError, LoadingIndicator, PageTitle, StatRow } from '../components/Common';
import { formatDateTime, toDateTimeLocalValue } from '../utils';
import { useToast } from '../components/ToastProvider';

export default function TicketDetailPage() {
  const { ticketNumber } = useParams();
  const { addToast } = useToast();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [teamsState, setTeamsState] = useState({ loading: true, error: null, teams: [] });
  const [triageRefreshLoading, setTriageRefreshLoading] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: 'in_progress', assigned_team_id: '', resolved_at: '', resolution_time_minutes: '' });
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTicket = async () => {
    setState({ loading: true, error: null, data: null });
    try {
      const data = await api.getTicketDetail(ticketNumber);
      setState({ loading: false, error: null, data });
      setStatusForm((current) => ({
        ...current,
        status: data.ticket.status === 'open' ? 'in_progress' : data.ticket.status,
      }));
    } catch (error) {
      setState({ loading: false, error, data: null });
    }
  };

  useEffect(() => {
    loadTicket();
  }, [ticketNumber]);

  useEffect(() => {
    let active = true;
    setTeamsState({ loading: true, error: null, teams: [] });
    api
      .listSupportTeams()
      .then((data) => {
        if (!active) return;
        setTeamsState({ loading: false, error: null, teams: data.teams || [] });
      })
      .catch((error) => {
        if (!active) return;
        setTeamsState({ loading: false, error, teams: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  const triage = state.data?.triage_suggestion;
  const similarTickets = state.data?.similar_tickets || [];
  const ticket = state.data?.ticket;

  const triageAvailable = useMemo(() => {
    if (!triage) return false;
    return Boolean(
      triage.suggested_priority || triage.confidence !== null || triage.generated_at || triage.model_version || triage.suggested_team
    );
  }, [triage]);

  const refreshTriage = async () => {
    setTriageRefreshLoading(true);
    try {
      const refreshed = await api.getTicketTriageSuggestion(ticketNumber);
      setState((current) => ({
        ...current,
        data: {
          ...current.data,
          triage_suggestion: refreshed.triage_suggestion,
        },
      }));
      addToast('Stored triage panel refreshed.', 'success');
    } catch (error) {
      addToast(error.message || 'Failed to refresh triage suggestion.', 'error');
    } finally {
      setTriageRefreshLoading(false);
    }
  };

  const onStatusChange = (field, value) => {
    setStatusForm((current) => ({ ...current, [field]: value }));
    setSaveError('');
  };

  const submitStatus = async (e) => {
    e.preventDefault();
    setSaveError('');
    const body = { status: statusForm.status };
    if (statusForm.assigned_team_id) body.assigned_team_id = statusForm.assigned_team_id;
    if (statusForm.status === 'resolved') {
      if (statusForm.resolved_at) body.resolved_at = new Date(statusForm.resolved_at).toISOString();
      if (statusForm.resolution_time_minutes) body.resolution_time_minutes = Number(statusForm.resolution_time_minutes);
    }

    setSaving(true);
    try {
      const response = await api.updateTicketStatus(ticketNumber, body);
      setState((current) => ({
        ...current,
        data: {
          ...current.data,
          ticket: {
            ...current.data.ticket,
            status: response.status,
          },
        },
      }));
      addToast(`Ticket ${response.ticket_number} updated to ${response.status}.`, 'success');
    } catch (error) {
      if (error.code === 'INVALID_STATUS' || error.code === 'INVALID_TEAM_ID') {
        setSaveError(error.message);
      } else if (error.code === 'TICKET_NOT_FOUND') {
        setSaveError('Ticket no longer exists. Return to lookup to continue.');
        addToast('Ticket no longer exists.', 'error');
      } else {
        setSaveError(error.message || 'Failed to update ticket status.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (state.loading) {
    return (
      <section>
        <PageTitle>Ticket Detail</PageTitle>
        <LoadingIndicator text="Loading ticket details, triage guidance, and similar tickets…" />
        <div className="card-grid detail-grid">
          <div className="panel skeleton-block" />
          <div className="panel skeleton-block" />
          <div className="panel skeleton-block" />
        </div>
      </section>
    );
  }

  if (state.error) {
    if (state.error.code === 'TICKET_NOT_FOUND') {
      return (
        <section>
          <PageTitle>Ticket Detail</PageTitle>
          <ErrorMessage>
            No ticket found for <strong>{ticketNumber}</strong>.
          </ErrorMessage>
          <Link to="/tickets/lookup" className="secondary-button">Back to lookup</Link>
        </section>
      );
    }
    if (state.error.code === 'INVALID_TICKET_NUMBER') {
      return (
        <section>
          <PageTitle>Ticket Detail</PageTitle>
          <ErrorMessage>
            The ticket number <strong>{ticketNumber}</strong> is invalid.
          </ErrorMessage>
          <Link to="/tickets/lookup" className="secondary-button">Back to lookup</Link>
        </section>
      );
    }
    return (
      <section>
        <PageTitle>Ticket Detail</PageTitle>
        <ErrorMessage
          action={
            <button onClick={loadTicket} className="secondary-button">
              Retry
            </button>
          }
        >
          Failed to load ticket details.
        </ErrorMessage>
      </section>
    );
  }

  return (
    <section>
      <PageTitle>Ticket Detail</PageTitle>
      <div className="button-row page-actions">
        <Link to="/tickets/lookup" className="secondary-button">Return to Lookup</Link>
      </div>

      <div className="card-grid detail-grid">
        <div className="panel" data-testid="ticket-detail-view">
          <h3>{ticket.subject}</h3>
          <div className="badge-row">
            <span className="badge">#{ticket.ticket_number}</span>
            <span className="badge status-badge">{ticket.status}</span>
          </div>
          <StatRow label="Source channel" value={ticket.source_channel} />
          <StatRow label="Account tier" value={ticket.account_tier} />
          <StatRow label="Product line" value={ticket.product_line} />
          <StatRow label="Manual priority" value={ticket.manual_priority} />
          <StatRow label="Created" value={formatDateTime(ticket.created_at)} />
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>Triage Suggestion</h3>
            <button onClick={refreshTriage} disabled={triageRefreshLoading} data-testid="triage-refresh-button">
              {triageRefreshLoading ? 'Refreshing…' : 'Refresh Panel'}
            </button>
          </div>
          {triageRefreshLoading && <LoadingIndicator inline text="Refreshing stored triage guidance…" />}
          {triageAvailable ? (
            <>
              <StatRow label="Suggested priority" value={triage.suggested_priority} />
              <StatRow label="Confidence" value={triage.confidence != null ? `${Math.round(triage.confidence * 100)}%` : '—'} />
              <StatRow label="Generated at" value={formatDateTime(triage.generated_at)} />
              <StatRow label="Model version" value={triage.model_version} />
              <StatRow
                label="Suggested team"
                value={triage.suggested_team ? `${triage.suggested_team.name} (${triage.suggested_team.team_code})` : '—'}
              />
            </>
          ) : (
            <EmptyState>Stored triage suggestion is not available yet for this ticket.</EmptyState>
          )}
        </div>

        <div className="panel full-width">
          <h3>Ticket Description</h3>
          <p className="ticket-description">{ticket.description}</p>
        </div>

        <div className="panel full-width">
          <h3>Similar Resolved Tickets</h3>
          {similarTickets.length === 0 ? (
            <EmptyState>No cached similar resolved tickets are available for this ticket.</EmptyState>
          ) : (
            <div className="similar-ticket-list" data-testid="similar-ticket-list">
              {similarTickets.map((item) => (
                <article key={item.id} className="similar-card" data-testid={`similar-ticket-card-${item.id}`}>
                  <div className="badge-row">
                    <span className="badge">#{item.ticket_number}</span>
                    <span className="badge">{item.product_line}</span>
                    <span className="badge">{item.manual_priority || 'No priority'}</span>
                  </div>
                  <h4>{item.subject}</h4>
                  <p>{item.description}</p>
                  <StatRow label="Resolution category" value={item.resolution_category} />
                  <StatRow label="Resolution summary" value={item.resolution_summary} />
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="panel full-width">
          <h3>Status Update</h3>
          <form onSubmit={submitStatus} className="form-grid" data-testid="ticket-status-form">
            <label>
              New status
              <select value={statusForm.status} onChange={(e) => onStatusChange('status', e.target.value)} disabled={saving}>
                <option value="open">open</option>
                <option value="in_progress">in_progress</option>
                <option value="resolved">resolved</option>
                <option value="closed">closed</option>
              </select>
            </label>
            <label>
              Assigned team
              <select
                value={statusForm.assigned_team_id}
                onChange={(e) => onStatusChange('assigned_team_id', e.target.value)}
                disabled={saving || teamsState.loading || !!teamsState.error}
              >
                <option value="">No team assignment</option>
                {teamsState.teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name} ({team.team_code})</option>
                ))}
              </select>
            </label>
            {teamsState.loading && <LoadingIndicator inline text="Loading support teams…" />}
            {teamsState.error && <FieldError>Support teams could not be loaded. Status updates can still be saved without a team.</FieldError>}
            {statusForm.status === 'resolved' && (
              <>
                <label>
                  Resolved at
                  <input
                    type="datetime-local"
                    value={statusForm.resolved_at}
                    onChange={(e) => onStatusChange('resolved_at', e.target.value)}
                    disabled={saving}
                  />
                </label>
                <label>
                  Resolution time (minutes)
                  <input
                    type="number"
                    min="0"
                    value={statusForm.resolution_time_minutes}
                    onChange={(e) => onStatusChange('resolution_time_minutes', e.target.value)}
                    disabled={saving}
                  />
                </label>
              </>
            )}
            <FieldError>{saveError}</FieldError>
            <div>
              <button type="submit" disabled={saving} data-testid="ticket-status-submit">
                {saving ? 'Saving…' : 'Save Status'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
