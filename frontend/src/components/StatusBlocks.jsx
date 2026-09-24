import React from 'react';

export function LoadingIndicator({ text = 'Loading...' }) {
  return <div className="loading" data-testid="loading-indicator">{text}</div>;
}

export function ErrorMessage({ text }) {
  return <div className="error-banner" data-testid="error-message">{text}</div>;
}

export function EmptyState({ text, children }) {
  return (
    <div className="empty-state" data-testid="empty-state">
      <p>{text}</p>
      {children}
    </div>
  );
}

export function InlineWarning({ text }) {
  return <div className="warning-banner">{text}</div>;
}
