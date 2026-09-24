import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { EmptyState, ErrorMessage, FieldError, LoadingIndicator, PageTitle } from '../components/Common';
import { fromDateInputToIso, getDefaultDateRange, groupBy, summarizeFilters } from '../utils';

function SimpleSeriesTable({ groups, labelKey, valueFormatter }) {
  return (
    <div className="series-table">
      {Object.entries(groups).map(([key, rows]) => (
        <div key={key} className="series-group">
          <h4>{key}</h4>
          <table>
            <thead>
              <tr>
                <th>Bucket</th>
                <th>{labelKey}</th>
                <th>Tickets</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${key}-${index}`}>
                  <td>{new Date(row.bucket_start).toLocaleString()}</td>
                  <td>{valueFormatter(row)}</td>
                  <td>{row.ticket_count ?? row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const defaults = getDefaultDateRange();
  const [filters, setFilters] = useState({ granularity: 'day', startDate: defaults.startDate, endDate: defaults.endDate });
  const [validationError, setValidationError] = useState('');
  const [volumeState, setVolumeState] = useState({ loading: true, error: null, data: null });
  const [resolutionState, setResolutionState] = useState({ loading: true, error: null, data: null });
  const [hasLoaded, setHasLoaded] = useState(false);

  const validate = () => {
    if (!['hour', 'day', 'week'].includes(filters.granularity)) {
      return 'Granularity must be hour, day, or week.';
    }
    if (!filters.startDate || !filters.endDate || filters.startDate > filters.endDate) {
      return 'Start date must be on or before end date.';
    }
    return '';
  };

  const load = async () => {
    const error = validate();
    setValidationError(error);
    if (error) return;
    const payload = {
      granularity: filters.granularity,
      start_date: fromDateInputToIso(filters.startDate),
      end_date: fromDateInputToIso(filters.endDate, true),
    };

    setVolumeState((current) => ({ ...current, loading: true, error: null }));
    setResolutionState((current) => ({ ...current, loading: true, error: null }));

    const volumePromise = api
      .getDashboardTicketVolume(payload)
      .then((data) => setVolumeState({ loading: false, error: null, data }))
      .catch((error) => setVolumeState((current) => ({ ...current, loading: false, error })));

    const resolutionPromise = api
      .getDashboardAverageResolutionTime(payload)
      .then((data) => setResolutionState({ loading: false, error: null, data }))
      .catch((error) => setResolutionState((current) => ({ ...current, loading: false, error })));

    await Promise.allSettled([volumePromise, resolutionPromise]);
    setHasLoaded(true);
  };

  useEffect(() => {
    load();
  }, []);

  const volumeGroups = useMemo(() => {
    const points = volumeState.data?.points || [];
    return groupBy(points, (point) => `${point.product_line || 'Unknown product'} • ${point.priority || 'No priority'}`);
  }, [volumeState.data]);

  const resolutionGroups = useMemo(() => {
    const points = resolutionState.data?.points || [];
    return groupBy(points, (point) => `${point.team?.name || 'Unknown team'} (${point.team?.team_code || 'n/a'})`);
  }, [resolutionState.data]);

  const initialLoading = !hasLoaded && (volumeState.loading || resolutionState.loading);

  return (
    <section>
      <PageTitle>Operations Dashboard</PageTitle>
      <div className="panel form-panel" data-testid="dashboard-filters-bar">
        <div className="form-grid dashboard-filters">
          <label>
            Granularity
            <select value={filters.granularity} onChange={(e) => setFilters((f) => ({ ...f, granularity: e.target.value }))}>
              <option value="hour">hour</option>
              <option value="day">day</option>
              <option value="week">week</option>
            </select>
          </label>
          <label>
            Start date
            <input type="date" value={filters.startDate} onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))} />
          </label>
          <label>
            End date
            <input type="date" value={filters.endDate} onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))} />
          </label>
          <div className="filter-actions">
            <button onClick={load} data-testid="dashboard-refresh-button">Refresh Dashboard</button>
            <Link to="/admin/dashboard-refresh" className="secondary-button">Open Admin Refresh</Link>
          </div>
        </div>
        <FieldError>{validationError}</FieldError>
      </div>

      {initialLoading && <LoadingIndicator text="Loading dashboard metrics…" />}

      <div className="card-grid dashboard-grid">
        <div className="panel" data-testid="ticket-volume-chart">
          <div className="panel-header">
            <h3>Ticket Volume</h3>
            {volumeState.loading && hasLoaded && <LoadingIndicator inline text="Refreshing chart…" />}
          </div>
          {volumeState.error ? (
            <ErrorMessage
              action={
                <button className="secondary-button" onClick={load}>
                  Retry
                </button>
              }
            >
              {volumeState.error.code === 'INVALID_GRANULARITY' || volumeState.error.code === 'INVALID_DATE_RANGE'
                ? volumeState.error.message
                : 'Failed to load ticket volume.'}
            </ErrorMessage>
          ) : (volumeState.data?.points || []).length === 0 ? (
            <EmptyState>No ticket volume data for {summarizeFilters(filters.startDate, filters.endDate, filters.granularity)}.</EmptyState>
          ) : (
            <SimpleSeriesTable
              groups={volumeGroups}
              labelKey="Value"
              valueFormatter={(row) => `${row.value} (${row.product_line || 'Unknown'} / ${row.priority || 'none'})`}
            />
          )}
        </div>

        <div className="panel" data-testid="avg-resolution-time-chart">
          <div className="panel-header">
            <h3>Average Resolution Time</h3>
            {resolutionState.loading && hasLoaded && <LoadingIndicator inline text="Refreshing chart…" />}
          </div>
          {resolutionState.error ? (
            <ErrorMessage
              action={
                <button className="secondary-button" onClick={load}>
                  Retry
                </button>
              }
            >
              {resolutionState.error.code === 'INVALID_GRANULARITY' || resolutionState.error.code === 'INVALID_DATE_RANGE'
                ? resolutionState.error.message
                : 'Failed to load average resolution time.'}
            </ErrorMessage>
          ) : (resolutionState.data?.points || []).length === 0 ? (
            <EmptyState>
              No average resolution time data for {summarizeFilters(filters.startDate, filters.endDate, filters.granularity)}.
            </EmptyState>
          ) : (
            <SimpleSeriesTable
              groups={resolutionGroups}
              labelKey="Avg minutes"
              valueFormatter={(row) => `${row.value} minutes`}
            />
          )}
        </div>
      </div>
    </section>
  );
}
