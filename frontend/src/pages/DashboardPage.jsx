import React, { useCallback, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import { ErrorMessage } from '../components/StatusBlocks';
import { api } from '../lib/api';
import { formatDateTime, toDateTimeLocalInput } from '../lib/utils';

function defaultRange() {
  const end = new Date();
  const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return {
    startDate: toDateTimeLocalInput(start.toISOString()),
    endDate: toDateTimeLocalInput(end.toISOString()),
    granularity: 'day',
    source: 'raw',
  };
}

function buildParams(filters, forAvgResolution = false) {
  const params = {
    startDate: new Date(filters.startDate).toISOString(),
    endDate: new Date(filters.endDate).toISOString(),
    source: filters.source,
  };
  if (!forAvgResolution || filters.source === 'snapshot') {
    params.granularity = filters.granularity;
  }
  if (!forAvgResolution && filters.granularity) {
    params.granularity = filters.granularity;
  }
  return params;
}

export default function DashboardPage() {
  const [filters, setFilters] = useState(defaultRange());
  const [filterError, setFilterError] = useState('');
  const [productState, setProductState] = useState({ loading: false, error: '', data: null });
  const [priorityState, setPriorityState] = useState({ loading: false, error: '', data: null });
  const [avgState, setAvgState] = useState({ loading: false, error: '', data: null });

  const validateFilters = useCallback(() => {
    if (!filters.startDate || !filters.endDate) return 'Start and end dates are required.';
    if (new Date(filters.startDate) >= new Date(filters.endDate)) return 'Start date must be before end date.';
    if (filters.source === 'snapshot' && !filters.granularity) return 'Granularity is required when source is snapshot.';
    return '';
  }, [filters]);

  const loadProduct = useCallback(async () => {
    setProductState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await api.getDashboardProductLine(buildParams(filters));
      setProductState({ loading: false, error: '', data });
    } catch (error) {
      setProductState((prev) => ({ ...prev, loading: false, error: error.code || error.message }));
    }
  }, [filters]);

  const loadPriority = useCallback(async () => {
    setPriorityState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await api.getDashboardPriority(buildParams(filters));
      setPriorityState({ loading: false, error: '', data });
    } catch (error) {
      setPriorityState((prev) => ({ ...prev, loading: false, error: error.code || error.message }));
    }
  }, [filters]);

  const loadAvg = useCallback(async () => {
    setAvgState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await api.getDashboardAvgResolution(buildParams(filters, true));
      setAvgState({ loading: false, error: '', data });
    } catch (error) {
      setAvgState((prev) => ({ ...prev, loading: false, error: error.code || error.message }));
    }
  }, [filters]);

  const refreshAll = useCallback(async () => {
    const validationError = validateFilters();
    setFilterError(validationError);
    if (validationError) return;
    await Promise.all([loadProduct(), loadPriority(), loadAvg()]);
  }, [loadAvg, loadPriority, loadProduct, validateFilters]);

  React.useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const lastComputed = useMemo(() => {
    const points = [
      ...(productState.data?.points || []),
      ...(priorityState.data?.points || []),
      ...(avgState.data?.points || []),
    ];
    const latest = points.map((p) => p.last_computed_at).filter(Boolean).sort().slice(-1)[0];
    return latest ? formatDateTime(latest) : '—';
  }, [productState.data, priorityState.data, avgState.data]);

  const renderSeriesTable = (points, keyName, valueName) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time bucket</th>
            <th>{keyName}</th>
            <th>{valueName}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={`${point.time_bucket}-${index}`}>
              <td>{formatDateTime(point.time_bucket)}</td>
              <td>{point.product_line || point.priority || '—'}</td>
              <td>{point.ticket_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <PageHeader title="Operations Dashboard" subtitle="Live operational visibility using authoritative dashboard APIs only." actions={<button className="button" data-testid="dashboard-refresh-button" onClick={refreshAll}>Refresh dashboard</button>} />
      {filterError ? <ErrorMessage text={filterError} /> : null}
      <section className="card stack gap-md">
        <div className="grid four-up">
          <label>
            Start date
            <input data-testid="dashboard-start-date" type="datetime-local" value={filters.startDate} onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))} />
          </label>
          <label>
            End date
            <input data-testid="dashboard-end-date" type="datetime-local" value={filters.endDate} onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))} />
          </label>
          <label>
            Granularity
            <select data-testid="dashboard-granularity" value={filters.granularity} onChange={(e) => setFilters((prev) => ({ ...prev, granularity: e.target.value }))}>
              <option value="hour">hour</option>
              <option value="day">day</option>
              <option value="week">week</option>
            </select>
          </label>
          <label>
            Source
            <select data-testid="dashboard-source" value={filters.source} onChange={(e) => setFilters((prev) => ({ ...prev, source: e.target.value }))}>
              <option value="raw">raw</option>
              <option value="snapshot">snapshot</option>
            </select>
          </label>
        </div>
        <div className="inline-meta">Last computed at: {lastComputed}</div>
      </section>

      <div className="grid dashboard-grid">
        <MetricCard
          title="Ticket volume by product line"
          loading={productState.loading}
          error={productState.error}
          empty={!productState.loading && !productState.error && (!productState.data?.points || productState.data.points.length === 0)}
          onRetry={loadProduct}
          footer={productState.data?.source ? `Source: ${productState.data.source} · Granularity: ${productState.data.granularity}` : ''}
        >
          {renderSeriesTable(productState.data?.points || [], 'Product line', 'Ticket count')}
        </MetricCard>

        <MetricCard
          title="Ticket volume by priority"
          loading={priorityState.loading}
          error={priorityState.error}
          empty={!priorityState.loading && !priorityState.error && (!priorityState.data?.points || priorityState.data.points.length === 0)}
          onRetry={loadPriority}
          footer={priorityState.data?.source ? `Source: ${priorityState.data.source} · Granularity: ${priorityState.data.granularity}` : ''}
        >
          {renderSeriesTable(priorityState.data?.points || [], 'Priority', 'Ticket count')}
        </MetricCard>

        <MetricCard
          title="Average resolution time by team"
          loading={avgState.loading}
          error={avgState.error}
          empty={!avgState.loading && !avgState.error && (!avgState.data?.points || avgState.data.points.length === 0)}
          onRetry={loadAvg}
          footer={avgState.data?.source ? `Source: ${avgState.data.source}${avgState.data.granularity ? ` · Granularity: ${avgState.data.granularity}` : ''}` : ''}
        >
          <div className="table-wrap">
            <table data-testid="avg-resolution-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Avg resolution hours</th>
                  <th>Resolved tickets</th>
                  <th>Time bucket</th>
                </tr>
              </thead>
              <tbody>
                {(avgState.data?.points || []).map((point, index) => (
                  <tr key={`${point.team_id}-${point.time_bucket || 'range'}-${index}`}>
                    <td>{point.team_name}</td>
                    <td>{point.avg_resolution_hours ?? '—'}</td>
                    <td>{point.resolved_ticket_count ?? '—'}</td>
                    <td>{formatDateTime(point.time_bucket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MetricCard>
      </div>
    </div>
  );
}
