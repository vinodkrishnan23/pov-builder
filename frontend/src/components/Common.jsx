import React from 'react';

export function PageHeader({ title, actions, children }) {
  return (
    <div className="page-header">
      <div>
        <h1 data-testid="page-title">{title}</h1>
        {children ? <div className="page-subtitle">{children}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function LoadingIndicator({ text = 'Loading...' }) {
  return <div className="loading" data-testid="loading-indicator">{text}</div>;
}

export function ErrorMessage({ message, action }) {
  return (
    <div className="error-banner" data-testid="error-message">
      <span>{message}</span>
      {action}
    </div>
  );
}

export function EmptyState({ message }) {
  return <div className="empty-state" data-testid="empty-state">{message}</div>;
}

export function SectionCard({ title, children, extra }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}
