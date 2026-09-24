const API_BASE = import.meta.env.VITE_API_BASE_URL;
const BASE_PATH = '/api/v1';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${BASE_PATH}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Request failed');
    error.status = response.status;
    error.code = data?.error?.code;
    error.details = data?.error?.details;
    throw error;
  }

  return data;
}

export const api = {
  getTicketDetail: (ticketNumber) => request(`/tickets/${encodeURIComponent(ticketNumber)}`),
  getTicketTriageSuggestion: (ticketNumber) => request(`/tickets/${encodeURIComponent(ticketNumber)}/triage-suggestion`),
  listSupportTeams: () => request('/support-teams?active=true'),
  updateTicketStatus: (ticketNumber, body) =>
    request(`/tickets/${encodeURIComponent(ticketNumber)}/status`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  getDashboardTicketVolume: ({ granularity, start_date, end_date }) =>
    request(
      `/dashboard/ticket-volume?granularity=${encodeURIComponent(granularity)}&start_date=${encodeURIComponent(
        start_date
      )}&end_date=${encodeURIComponent(end_date)}`
    ),
  getDashboardAverageResolutionTime: ({ granularity, start_date, end_date }) =>
    request(
      `/dashboard/avg-resolution-time?granularity=${encodeURIComponent(granularity)}&start_date=${encodeURIComponent(
        start_date
      )}&end_date=${encodeURIComponent(end_date)}`
    ),
  refreshDashboardTicketVolumeSnapshots: (body) =>
    request('/admin/dashboard-metrics/ticket-volume/refresh', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  refreshDashboardAverageResolutionTimeSnapshots: (body) =>
    request('/admin/dashboard-metrics/avg-resolution-time/refresh', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
