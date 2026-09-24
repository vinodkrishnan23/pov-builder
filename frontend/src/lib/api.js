const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(data?.message || 'Request failed');
    error.status = response.status;
    error.code = data?.code;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  listTickets: () => request('/api/tickets?status=new&status=open&limit=100&sort=-created_at'),
  getTicketDetails: (ticketId) => request(`/api/tickets/${encodeURIComponent(ticketId)}`),
  getSimilarResolvedTickets: (ticketId) => request(`/api/tickets/${encodeURIComponent(ticketId)}/similar-resolved`),
  resolveTicket: (ticketId, payload) =>
    request(`/api/tickets/${encodeURIComponent(ticketId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getTicketVolumeByProductLine: (startDate, endDate) =>
    request(`/api/dashboard/ticket-volume-by-product-line?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`),
  getTicketVolumeByPriority: (startDate, endDate) =>
    request(`/api/dashboard/ticket-volume-by-priority?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`),
  getAverageResolutionTimeByTeam: (startDate, endDate) =>
    request(`/api/dashboard/average-resolution-time-by-team?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`)
};
