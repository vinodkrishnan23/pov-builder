import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { ConfidenceIndicator, PriorityBadge, StatusBadge } from '../components/Badges';
import { EmptyState, ErrorMessage, LoadingIndicator, PageHeader, SectionCard } from '../components/Common';

export default function TicketQueuePage() {
  const [tickets, setTickets] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const loadTickets = async (isRefresh = false) => {
    setError(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await api.listTickets();
      setTickets(data.tickets || []);
      setCount(data.count || 0);
    } catch (err) {
      if (err.status === 400 && err.code === 'INVALID_QUERY_PARAMETER') {
        setError('Queue query was rejected. Default queue filters have been restored.');
      } else {
        setError('Unable to load ticket queue right now.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const refreshButton = (
    <button data-testid="ticket-queue-refresh" onClick={() => loadTickets(true)} disabled={refreshing} className="button">
      {refreshing ? 'Refreshing…' : 'Refresh Queue'}
    </button>
  );

  if (loading && !tickets.length) {
    return (
      <div>
        <PageHeader title="Ticket Queue" actions={refreshButton}>Browse incoming and open tickets with AI triage suggestions.</PageHeader>
        <LoadingIndicator text="Loading ticket queue…" />
      </div>
    );
  }

  if (error && !tickets.length) {
    return (
      <div>
        <PageHeader title="Ticket Queue" actions={refreshButton}>Browse incoming and open tickets with AI triage suggestions.</PageHeader>
        <ErrorMessage message={error} action={<button className="button" onClick={() => loadTickets()}>Retry</button>} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Ticket Queue" actions={refreshButton}>Showing up to 100 newest new/open tickets. Total loaded: {count}.</PageHeader>
      {error ? <ErrorMessage message={error} action={<button className="button secondary" onClick={() => loadTickets(true)}>Retry</button>} /> : null}
      <SectionCard title="Incoming & Open Tickets" extra={refreshing ? <LoadingIndicator text="Refreshing queue…" /> : null}>
        {tickets.length === 0 ? (
          <EmptyState message="No new or open tickets are currently available." />
        ) : (
          <div className="table-wrap" data-testid="ticket-queue-list">
            <table className="table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Subject</th>
                  <th>Channel</th>
                  <th>Tier</th>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actual Priority</th>
                  <th>Suggested Priority</th>
                  <th>Suggested Routing</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id || ticket.ticket_id}>
                    <td>{ticket.ticket_id}</td>
                    <td>{ticket.subject}</td>
                    <td>{ticket.channel}</td>
                    <td>{ticket.customer_account_tier}</td>
                    <td>{ticket.product_line}</td>
                    <td><StatusBadge status={ticket.status} /></td>
                    <td>{formatDateTime(ticket.created_at)}</td>
                    <td><PriorityBadge priority={ticket.priority} /></td>
                    <td>
                      <div className="stack-sm">
                        <PriorityBadge priority={ticket.priority_suggestion?.value} />
                        <ConfidenceIndicator value={ticket.priority_suggestion?.confidence} />
                      </div>
                    </td>
                    <td>
                      <div className="stack-sm">
                        <span>{ticket.routing_suggestion?.team_id || 'Suggested team unavailable in list view'}</span>
                        <ConfidenceIndicator value={ticket.routing_suggestion?.confidence} />
                      </div>
                    </td>
                    <td>
                      <button
                        data-testid={`open-ticket-${ticket.ticket_id}`}
                        className="button"
                        onClick={() => navigate(`/tickets/${ticket.ticket_id}`)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
