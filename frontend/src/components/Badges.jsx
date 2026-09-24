import React from 'react';
import { formatConfidence } from '../lib/format';

export function StatusBadge({ status }) {
  return <span className={`badge status ${status || 'unknown'}`}>{status || 'unknown'}</span>;
}

export function PriorityBadge({ priority }) {
  const value = priority || 'unassigned';
  return <span className={`badge priority ${String(value).toLowerCase()}`}>{value}</span>;
}

export function ConfidenceIndicator({ value }) {
  return <span className="confidence">Confidence: {formatConfidence(value)}</span>;
}
