const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(data?.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.code = data?.code;
    error.payload = data;
    throw error;
  }

  return data;
}

export const api = {
  listTeams: () => request('/api/teams?active=true'),
  createTicket: (body) => request('/api/tickets', { method: 'POST', body: JSON.stringify(body) }),
  getTicket: (ticketId) => request(`/api/tickets/${encodeURIComponent(ticketId)}`),
  getTriageSuggestion: (ticketId) => request(`/api/tickets/${encodeURIComponent(ticketId)}/triage-suggestion`),
  getSimilarResolved: (ticketId, limit = 4) => request(`/api/tickets/${encodeURIComponent(ticketId)}/similar-resolved?limit=${limit}`),
  getDashboardProductLine: (params) => request(`/api/dashboard/ticket-volume-by-product-line?${new URLSearchParams(params).toString()}`),
  getDashboardPriority: (params) => request(`/api/dashboard/ticket-volume-by-priority?${new URLSearchParams(params).toString()}`),
  getDashboardAvgResolution: (params) => request(`/api/dashboard/avg-resolution-time-by-team?${new URLSearchParams(params).toString()}`),
};
