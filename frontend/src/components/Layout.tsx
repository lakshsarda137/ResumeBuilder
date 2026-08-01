import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  FileText,
  Layers,
  BookOpen,
  Archive,
  GraduationCap,
  History,
  Settings,
  Shield,
} from 'lucide-react';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';
import './Layout.css';

const NAV = [
  { to: '/resume',     label: 'Resume Builder', icon: FileText },
  { to: '/bulk',       label: 'Bulk ResumeBuilder', icon: Layers },
  { to: '/repository', label: 'Repository',     icon: Archive },
  { to: '/education',   label: 'Education Info', icon: GraduationCap },
  { to: '/history',    label: 'History',         icon: History },
  { to: '/knowledge',  label: 'Knowledge',       icon: BookOpen },
  { to: '/settings',   label: 'Settings',        icon: Settings },
  { to: '/privacy',    label: 'Privacy',         icon: Shield },
];

export function Layout() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <FileText size={20} className="sidebar-logo-icon" />
          <span>Resume OS</span>
        </div>
        <ul className="sidebar-nav">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
                }
              >
                <Icon size={16} />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-kbd-hint"
            onClick={() => setPaletteOpen(true)}
            title="Search pages and features"
          >
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
      </nav>
      <main className="layout-main">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
