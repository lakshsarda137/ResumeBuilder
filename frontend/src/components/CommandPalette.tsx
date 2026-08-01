import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Archive, GraduationCap, History,
  BookOpen, Settings, Shield, Layers, Eye, SidebarOpen,
  GitCompare, Search,
} from 'lucide-react';
import './CommandPalette.css';

interface PaletteItem {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  action: () => void;
  tag?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const go = useCallback((path: string) => {
    navigate(path);
    onClose();
  }, [navigate, onClose]);

  const items: PaletteItem[] = [
    {
      id: 'resume',
      label: 'Resume Builder',
      description: 'Build or optimize your resume with AI',
      icon: FileText,
      action: () => go('/resume'),
      tag: 'page',
    },
    {
      id: 'bulk',
      label: 'Bulk ResumeBuilder',
      description: 'Generate a resume for many job descriptions at once',
      icon: Layers,
      action: () => go('/bulk'),
      tag: 'page',
    },
    {
      id: 'repository',
      label: 'Repository',
      description: 'Experience & project warehouse for AI to draw from',
      icon: Archive,
      action: () => go('/repository'),
      tag: 'page',
    },
    {
      id: 'education',
      label: 'Education Info',
      description: 'Degrees, GPA, skills and certifications',
      icon: GraduationCap,
      action: () => go('/education'),
      tag: 'page',
    },
    {
      id: 'history',
      label: 'History',
      description: 'Saved editor sessions — open any past build',
      icon: History,
      action: () => go('/history'),
      tag: 'page',
    },
    {
      id: 'knowledge',
      label: 'Knowledge',
      description: 'Notes and reference material',
      icon: BookOpen,
      action: () => go('/knowledge'),
      tag: 'page',
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Default fonts, spacing, templates and style controls',
      icon: Settings,
      action: () => go('/settings'),
      tag: 'page',
    },
    {
      id: 'privacy',
      label: 'Privacy',
      description: 'All data is stored locally — no cloud',
      icon: Shield,
      action: () => go('/privacy'),
      tag: 'page',
    },
    {
      id: 'council',
      label: 'LLM Council',
      description: 'Run 2–3 AI candidates in parallel, then a judge picks the best draft',
      icon: Layers,
      action: () => go('/resume'),
      tag: 'feature',
    },
    {
      id: 'preview-prompt',
      label: 'Preview prompt before generating',
      description: 'Inspect the exact prompt that will be sent to the AI — in the wizard generate step',
      icon: Eye,
      action: () => go('/resume'),
      tag: 'feature',
    },
    {
      id: 'jd-notes',
      label: 'JD match notes sidebar',
      description: 'After generation, hover notes to highlight anchors on the resume',
      icon: SidebarOpen,
      action: () => go('/resume'),
      tag: 'feature',
    },
    {
      id: 'diff',
      label: 'AI diff viewer',
      description: 'See exactly what the AI added, changed, or removed — shown after each generation',
      icon: GitCompare,
      action: () => go('/resume'),
      tag: 'feature',
    },
  ];

  const filtered = query.trim()
    ? items.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.description.toLowerCase().includes(query.toLowerCase()) ||
          (item.tag ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : items;

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[activeIdx]?.action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="cp-scrim" onClick={onClose}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKey}>
        <div className="cp-search">
          <Search size={15} className="cp-search-icon" />
          <input
            ref={inputRef}
            className="cp-input"
            placeholder="Search pages and features…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="cp-esc-hint">esc</kbd>
        </div>

        {filtered.length > 0 ? (
          <ul className="cp-list" ref={listRef}>
            {filtered.map((item, idx) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.id}
                  className={`cp-item${idx === activeIdx ? ' cp-item--active' : ''}`}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={item.action}
                >
                  <span className="cp-item-icon">
                    <Icon size={15} />
                  </span>
                  <span className="cp-item-text">
                    <span className="cp-item-label">{item.label}</span>
                    <span className="cp-item-desc">{item.description}</span>
                  </span>
                  {item.tag && (
                    <span className={`cp-tag cp-tag--${item.tag}`}>{item.tag}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="cp-empty">No results for "{query}"</p>
        )}
      </div>
    </div>
  );
}
