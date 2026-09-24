import { NavLink, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import TicketLookupPage from './pages/TicketLookupPage';
import TicketDetailPage from './pages/TicketDetailPage';
import DashboardPage from './pages/DashboardPage';
import DashboardRefreshAdminPage from './pages/DashboardRefreshAdminPage';
import { ToastProvider, useToast } from './components/ToastProvider';

function AppShell() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Internal-only POV</div>
          <h1 className="app-name">Northwind Support POV</h1>
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/tickets/lookup">Ticket Lookup</NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/admin/dashboard-refresh">Admin Refresh</NavLink>
        </nav>
      </header>
      <main className="page-container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tickets/lookup" element={<TicketLookupPage />} />
          <Route path="/tickets/:ticketNumber" element={<TicketDetailPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/admin/dashboard-refresh" element={<DashboardRefreshAdminPage />} />
        </Routes>
      </main>
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span>{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} aria-label="Dismiss notification">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
