import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { formatDate, formatHours, toDateTimeRange } from '../lib/format';
import { EmptyState, ErrorMessage, LoadingIndicator, PageHeader, SectionCard } from '../components/Common';

function getDefaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function groupSeries(results, key) {
  const grouped = {};
  for (const row of results || []) {
    const groupKey = row[key] ?? 'Unspecified';
    grouped[groupKey] = grouped[groupKey] || [];
    grouped[groupKey].push(row);
  }
  return grouped;
}

export default function DashboardPage() {
  const defaults = useMemo(() => getDefaultRange(), []);
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [dateError, setDateError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [productData, setProductData] = useState([]);
  const [priorityData, setPriorityData] = useState([]);
  const [resolutionData, setResolutionData] = useState([]);
  const [productLoading, setProductLoading] = useState(false);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [resolutionLoading, setResolutionLoading] = useState(false);
  const [productError, setProductError] = useState('');
  const [priorityError, setPriorityError] = useState('');
  const [resolutionError, setResolutionError] = useState('');

  const loadDashboard = async () => {
    if (!startDate || !endDate || new Date(startDate) > new Date(endDate)) {
      setDateError('Start date must be earlier than or equal to end date.');
      return;
    }
    setDateError('');
    const start = toDateTimeRange(startDate, false);
    const end = toDateTimeRange(endDate, true);
    setProductLoading(true);
    setPriorityLoading(true);
    setResolutionLoading(true);
    setProductError('');
    setPriorityError('');
    setResolutionError('');

    const tasks = [
      api.getTicketVolumeByProductLine(start, end)
        .then((data) => setProductData(data.results || []))
        .catch((err) => {
          if (err.status === 400 && err.code === 'INVALID_DATE_RANGE') setDateError('The selected date range is invalid.');
          else setProductError('Unable to load product-line ticket volume.');
        })
        .finally(() => setProductLoading(false)),
      api.getTicketVolumeByPriority(start, end)
        .then((data) => setPriorityData(data.results || []))
        .catch((err) => {
          if (err.status === 400 && err.code === 'INVALID_DATE_RANGE') setDateError('The selected date range is invalid.');
          else setPriorityError('Unable to load priority ticket volume.');
        })
        .finally(() => setPriorityLoading(false)),
      api.getAverageResolutionTimeByTeam(start, end)
        .then((data) => setResolutionData(data.results || []))
        .catch((err) => {
          if (err.status === 400 && err.code === 'INVALID_DATE_RANGE') setDateError('The selected date range is invalid.');
          else setResolutionError('Unable to load average resolution time by team.');
        })
        .finally(() => setResolutionLoading(false))
    ];

    await Promise.all(tasks);
    setInitialLoading(false);
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const allFailed = !initialLoading && productError && priorityError && resolutionError;
  const groupedProduct = groupSeries(productData, 'product_line');
  const groupedPriority = groupSeries(priorityData, 'priority');

  return (
    <div className="stack-lg">
      <PageHeader
        title="Support Operations Dashboard"
        actions={
          <div className="action-row">
            <button data-testid="dashboard-refresh" className="button" onClick={loadDashboard} disabled={productLoading || priorityLoading || resolutionLoading}>
              Refresh Dashboard
            </button>
          </div>
        }
      >
        Live operational metrics across product line, priority, and team resolution performance.
      </PageHeader>

      <SectionCard title="Date Range">
        <div className="filter-row" data-testid="dashboard-date-range-form">
          <label>
            <span>Start Date</span>
            <input data-testid="dashboard-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            <span>End Date</span>
            <input data-testid="dashboard-end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <button data-testid="dashboard-apply-range" className="button" onClick={loadDashboard}>Apply Range</button>
        </div>
        {dateError ? <ErrorMessage message={dateError} /> : null}
      </SectionCard>

      {initialLoading ? <LoadingIndicator text="Loading dashboard…" /> : null}
      {allFailed ? <ErrorMessage message="Unable to load dashboard widgets." action={<button className="button" onClick={loadDashboard}>Retry</button>} /> : null}

      <div className="dashboard-grid">
        <SectionCard title="Ticket Volume by Product Line" extra={productLoading ? <LoadingIndicator text="Updating…" /> : null}>
          {productError ? (
            <ErrorMessage message={productError} action={<button className="button" onClick={loadDashboard}>Retry</button>} />
          ) : productData.length === 0 ? (
            <EmptyState message="No product-line ticket volume data is available for the selected range." />
          ) : (
            <div data-testid="product-line-chart" className="series-list">
              {Object.entries(groupedProduct).map(([label, rows]) => (
                <div className="series-card" key={label}>
                  <h3>{label}</h3>
                  <ul>
                    {rows.map((row, index) => (
                      <li key={`${label}-${index}`}>
                        <span>{formatDate(row.date)}</span>
                        <strong>{row.ticket_count} tickets</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Ticket Volume by Priority" extra={priorityLoading ? <LoadingIndicator text="Updating…" /> : null}>
          {priorityError ? (
            <ErrorMessage message={priorityError} action={<button className="button" onClick={loadDashboard}>Retry</button>} />
          ) : priorityData.length === 0 ? (
            <EmptyState message="No priority ticket volume data is available for the selected range." />
          ) : (
            <div data-testid="priority-chart" className="series-list">
              {Object.entries(groupedPriority).map(([label, rows]) => (
                <div className="series-card" key={label}>
                  <h3>{label}</h3>
                  <ul>
                    {rows.map((row, index) => (
                      <li key={`${label}-${index}`}>
                        <span>{formatDate(row.date)}</span>
                        <strong>{row.ticket_count} tickets</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Average Resolution Time by Team" extra={resolutionLoading ? <LoadingIndicator text="Updating…" /> : null}>
          {resolutionError ? (
            <ErrorMessage message={resolutionError} action={<button className="button" onClick={loadDashboard}>Retry</button>} />
          ) : resolutionData.length === 0 ? (
            <EmptyState message="No team resolution metrics are available for the selected range." />
          ) : (
            <div className="table-wrap" data-testid="resolution-time-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Team Code</th>
                    <th>Average Resolution Time</th>
                    <th>Resolved Tickets</th>
                  </tr>
                </thead>
                <tbody>
                  {resolutionData.map((row) => (
                    <tr key={row.team_id}>
                      <td>{row.team?.name || '—'}</td>
                      <td>{row.team?.team_code || '—'}</td>
                      <td>{formatHours(row.avg_resolution_time_hours)}</td>
                      <td>{row.resolved_ticket_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
