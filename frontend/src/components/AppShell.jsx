import React from 'react';
import { NavLink } from 'react-router-dom';

export default function AppShell({ children }) {
  return (
    <div className="app-shell">
      <header className="top-nav">
        <div>
          <div className="brand">Northwind Support Ticket Triage POV</div>
          <div className="subbrand">Internal Support Operations Workspace</div>
        </div>
        <nav className="nav-links">
          <NavLink to="/tickets" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Ticket Queue
          </NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Dashboard
          </NavLink>
        </nav>
      </header>
      <main className="page-container">{children}</main>
    </div>
  );
}
