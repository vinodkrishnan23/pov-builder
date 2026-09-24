import React from 'react';
import { ErrorMessage, LoadingIndicator, EmptyState } from './StatusBlocks';

export default function MetricCard({ title, loading, error, empty, onRetry, children, footer }) {
  return (
    <section className="card metric-card">
      <div className="card-header-row">
        <h3>{title}</h3>
        {onRetry ? <button className="button secondary" onClick={onRetry}>Retry</button> : null}
      </div>
      {loading ? <LoadingIndicator text="Loading metric..." /> : null}
      {!loading && error ? <ErrorMessage text={error} /> : null}
      {!loading && !error && empty ? <EmptyState text="No data returned for this range." /> : null}
      {!loading && !error && !empty ? children : null}
      {footer ? <div className="metric-footer">{footer}</div> : null}
    </section>
  );
}
