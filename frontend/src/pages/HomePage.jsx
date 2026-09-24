import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { InlineWarning, LoadingIndicator } from '../components/StatusBlocks';
import { api } from '../lib/api';

export default function HomePage() {
  const navigate = useNavigate();
  const [ticketId, setTicketId] = useState('');
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [teamsError, setTeamsError] = useState('');

  useEffect(() => {
    let active = true;
    api.listTeams()
      .then((data) => {
        if (!active) return;
        setTeams(data.teams || []);
      })
      .catch(() => {
        if (!active) return;
        setTeamsError('Support team reference is unavailable right now. Core actions are still available.');
      })
      .finally(() => {
        if (active) setLoadingTeams(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleOpenTicket = (e) => {
    e.preventDefault();
    if (!ticketId.trim()) return;
    navigate(`/tickets/${encodeURIComponent(ticketId.trim())}`);
  };

  return (
    <div>
      <PageHeader title="POV Home" subtitle="Start a simulated support workflow, jump directly to a known ticket, or open live operations metrics." />
      <div className="grid two-up">
        <section className="card">
          <h2>Quick actions</h2>
          <div className="stack gap-md">
            <button className="button" data-testid="home-create-ticket" onClick={() => navigate('/tickets/new')}>Create simulated ticket</button>
            <form onSubmit={handleOpenTicket} className="stack gap-sm">
              <label>
                Existing ticket ID
                <input data-testid="open-ticket-input" value={ticketId} onChange={(e) => setTicketId(e.target.value)} placeholder="Enter ticket_id" />
              </label>
              <button className="button secondary" data-testid="open-ticket-submit" type="submit">Open review</button>
            </form>
            <button className="button secondary" data-testid="home-dashboard-link" onClick={() => navigate('/dashboard')}>Open dashboard</button>
          </div>
        </section>
        <section className="card">
          <h2>Active support teams</h2>
          {loadingTeams ? <LoadingIndicator text="Loading team reference..." /> : null}
          {!loadingTeams && teamsError ? <InlineWarning text={teamsError} /> : null}
          {!loadingTeams && !teamsError && (
            <ul className="list">
              {teams.map((team) => (
                <li key={team.id || team.team_id}>
                  <strong>{team.name}</strong>
                  <div className="muted">{team.description || 'No description provided'}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
