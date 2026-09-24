import { Link } from 'react-router-dom';
import { EmptyState, PageTitle } from '../components/Common';

export default function HomePage() {
  return (
    <section>
      <PageTitle>Home / Entry</PageTitle>
      <p className="lede">
        Internal entry point for historical-ticket-based support workflows. Use direct lookup for agent work,
        dashboard views for operational trends, and admin refresh when snapshot recomputation is needed.
      </p>
      <div className="card-grid home-grid">
        <Link to="/tickets/lookup" className="action-card" data-testid="home-ticket-lookup-link">
          <h3>Ticket Lookup</h3>
          <p>Open a known ticket number and review stored triage guidance and similar historical resolutions.</p>
        </Link>
        <Link to="/dashboard" className="action-card" data-testid="home-dashboard-link">
          <h3>Operations Dashboard</h3>
          <p>Review ticket volume and average resolution time trends across imported historical snapshots.</p>
        </Link>
        <Link to="/admin/dashboard-refresh" className="action-card" data-testid="home-admin-refresh-link">
          <h3>Dashboard Refresh Admin</h3>
          <p>Request snapshot recomputation for ticket volume or average resolution time metrics.</p>
        </Link>
      </div>
      <EmptyState>There is no API-backed queue or ticket list in this POV, so start from a known ticket number.</EmptyState>
    </section>
  );
}
