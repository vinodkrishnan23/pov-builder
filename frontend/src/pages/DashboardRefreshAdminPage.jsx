import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ErrorMessage, FieldError, LoadingIndicator, PageTitle } from '../components/Common';
import { fromDateInputToIso, getDefaultDateRange } from '../utils';
import { useToast } from '../components/ToastProvider';

export default function DashboardRefreshAdminPage() {
  const defaults = getDefaultDateRange();
  const { addToast } = useToast();
  const [form, setForm] = useState({ metricType: 'ticket_volume', granularity: 'day', startDate: defaults.startDate, endDate: defaults.endDate });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const validate = () => {
    if (!['hour', 'day', 'week'].includes(form.granularity)) return 'Granularity must be hour, day, or week.';
    if (!form.startDate || !form.endDate || form.startDate > form.endDate) return 'Start date must be on or before end date.';
    return '';
  };

  const submit = async (e) => {
    e.preventDefault();
    const validation = validate();
    setError(validation);
    setInfo('');
    if (validation) return;

    setSubmitting(true);
    try {
      const payload = {
        granularity: form.granularity,
        start_date: fromDateInputToIso(form.startDate),
        end_date: fromDateInputToIso(form.endDate, true),
      };
      const response =
        form.metricType === 'ticket_volume'
          ? await api.refreshDashboardTicketVolumeSnapshots(payload)
          : await api.refreshDashboardAverageResolutionTimeSnapshots(payload);
      const message = `Refresh accepted for ${response.metric_type} (${response.granularity}). Completion cannot be tracked from this UI.`;
      setInfo(message);
      addToast('Dashboard refresh request accepted.', 'success');
    } catch (requestError) {
      setError(requestError.message || 'Failed to submit refresh request.');
      addToast('Dashboard refresh request failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <PageTitle>Dashboard Refresh Admin</PageTitle>
      <p className="lede">Request recomputation of dashboard metric snapshots for a selected date range and granularity.</p>
      <form className="panel form-panel" onSubmit={submit} data-testid="admin-refresh-form">
        <div className="form-grid">
          <label>
            Metric type
            <select value={form.metricType} onChange={(e) => setForm((f) => ({ ...f, metricType: e.target.value }))}>
              <option value="ticket_volume">ticket volume</option>
              <option value="avg_resolution_time">average resolution time</option>
            </select>
          </label>
          <label>
            Granularity
            <select value={form.granularity} onChange={(e) => setForm((f) => ({ ...f, granularity: e.target.value }))}>
              <option value="hour">hour</option>
              <option value="day">day</option>
              <option value="week">week</option>
            </select>
          </label>
          <label>
            Start date
            <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          </label>
          <label>
            End date
            <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          </label>
        </div>
        <FieldError>{error}</FieldError>
        {submitting && <LoadingIndicator text="Submitting refresh request…" />}
        {info && <div className="info-box">{info}</div>}
        <div className="button-row">
          <button type="submit" disabled={submitting} data-testid="admin-refresh-submit">
            {submitting ? 'Submitting…' : 'Submit Refresh Request'}
          </button>
          <Link to="/dashboard" className="secondary-button">Return to Dashboard</Link>
        </div>
      </form>
    </section>
  );
}
