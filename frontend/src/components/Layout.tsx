import { NavLink, Outlet } from 'react-router-dom';
import {
  FileText,
  BookOpen,
  Archive,
  GraduationCap,
  Clock,
  History,
  Shield,
} from 'lucide-react';
import './Layout.css';

const NAV = [
  { to: '/resume',     label: 'Resume Builder', icon: FileText },
  { to: '/repository', label: 'Repository',     icon: Archive },
  { to: '/education',   label: 'Education Info', icon: GraduationCap },
  { to: '/ongoing',    label: 'Ongoing',         icon: Clock },
  { to: '/history',    label: 'History',         icon: History },
  { to: '/knowledge',  label: 'Knowledge',       icon: BookOpen },
  { to: '/privacy',    label: 'Privacy',         icon: Shield },
];

export function Layout() {
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
      </nav>
      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  );
}
