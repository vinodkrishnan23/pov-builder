export function PageTitle({ children }) {
  return <h2 data-testid="page-title">{children}</h2>;
}

export function LoadingIndicator({ text = 'Loading…', inline = false }) {
  return (
    <div data-testid="loading-indicator" className={inline ? 'loading-inline' : 'loading-block'}>
      {text}
    </div>
  );
}

export function ErrorMessage({ children, action }) {
  return (
    <div data-testid="error-message" className="error-box">
      <div>{children}</div>
      {action}
    </div>
  );
}

export function EmptyState({ children }) {
  return (
    <div data-testid="empty-state" className="empty-box">
      {children}
    </div>
  );
}

export function FieldError({ children }) {
  if (!children) return null;
  return <div className="field-error">{children}</div>;
}

export function StatRow({ label, value }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value ?? '—'}</span>
    </div>
  );
}
