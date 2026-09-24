import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import TicketQueuePage from './pages/TicketQueuePage';
import TicketDetailPage from './pages/TicketDetailPage';
import DashboardPage from './pages/DashboardPage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/tickets" replace />} />
        <Route path="/tickets" element={<TicketQueuePage />} />
        <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>
    </AppShell>
  );
}
