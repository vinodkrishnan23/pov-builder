import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FieldError, PageTitle } from '../components/Common';

export default function TicketLookupPage() {
  const [ticketNumber, setTicketNumber] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const normalized = ticketNumber.trim();
  const isValid = /^[A-Za-z0-9\-_]+$/.test(normalized);

  const submit = (e) => {
    e.preventDefault();
    if (!normalized) {
      setError('Ticket number is required.');
      return;
    }
    if (!isValid) {
      setError('Ticket number can only include letters, numbers, dashes, and underscores.');
      return;
    }
    setError('');
    navigate(`/tickets/${encodeURIComponent(normalized)}`);
  };

  return (
    <section>
      <PageTitle>Ticket Lookup</PageTitle>
      <p className="lede">Enter a known ticket number to open the support workflow.</p>
      <form onSubmit={submit} className="panel form-panel">
        <label>
          Ticket number
          <input
            data-testid="ticket-lookup-input"
            value={ticketNumber}
            onChange={(e) => {
              setTicketNumber(e.target.value);
              if (error) setError('');
            }}
            placeholder="e.g. NW-10482"
          />
        </label>
        <FieldError>{error}</FieldError>
        <div className="button-row">
          <button type="submit" data-testid="ticket-lookup-submit" disabled={!normalized || !isValid}>
            Open Ticket
          </button>
          <Link to="/dashboard" className="secondary-button" data-testid="ticket-lookup-dashboard-link">
            Open Dashboard
          </Link>
        </div>
      </form>
    </section>
  );
}
