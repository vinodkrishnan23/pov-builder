import React from 'react';
import { NavLink } from 'react-router-dom';

export default function AppShell({ children }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Northwind Support POV</div>
        <nav className="nav">
          <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Home</NavLink>
          <NavLink to="/tickets/new" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Create Ticket</NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Dashboard</NavLink>
        </nav>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
