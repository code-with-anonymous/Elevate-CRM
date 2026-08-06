// ─────────────────────────────────────────────────────────────────────────────
// components/common/CommandPalette.tsx
// ⌘K overlay: search across Leads, Contacts and Tasks, plus quick navigation.
//
// Replaces the TopNavbar's inline search field, which expanded on ⌘K and then
// did nothing with what you typed — a convincing-looking dead control.
//
// Keyboard is the point of a palette, so it's fully driven:
//   ⌘K / Ctrl-K  toggle · ↑ ↓  move · ⏎  open · Esc  close
// The active row is tracked as a flat index across all groups, because that's
// what arrow keys traverse — grouping is presentation only.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Calendar,
  CheckSquare,
  CornerDownLeft,
  GitBranch,
  LayoutDashboard,
  Loader2,
  Search,
  Settings,
  UserCircle,
  Users,
} from 'lucide-react';
import StatusBadge from '@/components/common/StatusBadge';
import { useGlobalSearch } from '@/hooks/useSearch';
import { MIN_SEARCH_LENGTH, type SearchHit } from '@/services/api/searchService';
import { DURATION, EASE_OUT, overlayVariants } from '@/lib/motion';
import { cn } from '@/lib/cn';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

// ── Static navigation targets ─────────────────────────────────────────────────
// A palette that only searches records is half a palette — "take me to Reports"
// is the other half, and it's the part that works with an empty query.
const NAV_ITEMS: (SearchHit & { icon: typeof Users })[] = [
  { id: 'nav-dashboard', type: 'lead', title: 'Dashboard', subtitle: null, badge: null, href: '/dashboard', icon: LayoutDashboard },
  { id: 'nav-leads', type: 'lead', title: 'Leads', subtitle: null, badge: null, href: '/leads', icon: Users },
  { id: 'nav-contacts', type: 'contact', title: 'Contacts', subtitle: null, badge: null, href: '/contacts', icon: UserCircle },
  { id: 'nav-pipeline', type: 'lead', title: 'Pipeline', subtitle: null, badge: null, href: '/pipeline', icon: GitBranch },
  { id: 'nav-tasks', type: 'task', title: 'Tasks', subtitle: null, badge: null, href: '/tasks', icon: CheckSquare },
  { id: 'nav-calendar', type: 'task', title: 'Calendar', subtitle: null, badge: null, href: '/calendar', icon: Calendar },
  { id: 'nav-activity', type: 'lead', title: 'Activity log', subtitle: null, badge: null, href: '/activity', icon: BarChart3 },
  { id: 'nav-reports', type: 'lead', title: 'Reports', subtitle: null, badge: null, href: '/reports', icon: BarChart3 },
  { id: 'nav-settings', type: 'lead', title: 'Settings', subtitle: null, badge: null, href: '/settings/profile', icon: Settings },
];

const TYPE_ICON: Record<string, typeof Users> = {
  lead: Users,
  contact: UserCircle,
  task: CheckSquare,
};

interface Group {
  label: string;
  hits: (SearchHit & { icon?: typeof Users })[];
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const { data, isFetching, isTyping } = useGlobalSearch(query, open);

  // Below MIN_SEARCH_LENGTH we show navigation; above it, matched records. The
  // nav list is filtered locally — it's nine static strings, not worth a query.
  const groups: Group[] = useMemo(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_SEARCH_LENGTH) {
      return [{ label: 'Go to', hits: NAV_ITEMS }];
    }

    const navMatches = NAV_ITEMS.filter((n) =>
      n.title.toLowerCase().includes(trimmed.toLowerCase())
    );

    const out: Group[] = [];
    if (data?.groups.leads.length) out.push({ label: 'Leads', hits: data.groups.leads });
    if (data?.groups.contacts.length) out.push({ label: 'Contacts', hits: data.groups.contacts });
    if (data?.groups.tasks.length) out.push({ label: 'Tasks', hits: data.groups.tasks });
    if (navMatches.length) out.push({ label: 'Go to', hits: navMatches });
    return out;
  }, [query, data]);

  // Flat list mirrors what the arrow keys walk. Groups are only headings.
  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);

  // Reset the cursor whenever the result set changes, or ↓↓↓ then a new query
  // leaves the highlight pointing at nothing.
  useEffect(() => setActiveIndex(0), [query, data]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // rAF, not a bare focus() — the input isn't in the DOM until
      // AnimatePresence has mounted this frame.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const select = useCallback(
    (hit: SearchHit) => {
      navigate(hit.href);
      onClose();
    },
    [navigate, onClose]
  );

  // Key handling lives on the container, not window: with the input focused the
  // event reaches here first, and Escape/arrows shouldn't leak to the page.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const hit = flat[activeIndex];
      if (hit) select(hit);
    }
  };

  // Keep the highlighted row inside the scroll viewport when arrowing past it.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const showEmpty =
    query.trim().length >= MIN_SEARCH_LENGTH && !isFetching && !isTyping && flat.length === 0;

  let cursor = -1;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-overlay/50 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: DURATION.fast, ease: EASE_OUT }}
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            onKeyDown={onKeyDown}
            // Sits high rather than centred: the list grows downward, and a
            // vertically-centred palette jumps as results arrive.
            className="fixed left-1/2 top-[12vh] z-[61] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-pop"
          >
            {/* Input */}
            <div className="flex items-center gap-2.5 border-b border-border/60 px-4">
              <Search size={16} className="shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded
                aria-controls="command-results"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search leads, contacts, tasks — or jump to a page…"
                className="h-12 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
              />
              {(isFetching || isTyping) && (
                <Loader2 size={14} className="shrink-0 animate-spin text-muted-foreground" />
              )}
              <kbd className="hidden shrink-0 rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
                Esc
              </kbd>
            </div>

            {/* Results */}
            <div
              ref={listRef}
              id="command-results"
              role="listbox"
              className="max-h-[52vh] overflow-y-auto py-2"
            >
              {showEmpty ? (
                <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                  Nothing matches “{query.trim()}”.
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.label} className="mb-1 last:mb-0">
                    <p className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </p>
                    {group.hits.map((hit) => {
                      cursor += 1;
                      const index = cursor;
                      const isActive = index === activeIndex;
                      const Icon = hit.icon ?? TYPE_ICON[hit.type] ?? Users;

                      return (
                        <button
                          key={hit.id}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          data-active={isActive}
                          // Mouse move, not mouse enter: moving the pointer over
                          // the list should take the highlight from the keyboard,
                          // but an unmoved cursor sitting over a row shouldn't
                          // fight the arrow keys.
                          onMouseMove={() => setActiveIndex(index)}
                          onClick={() => select(hit)}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-100',
                            isActive ? 'bg-primary/[0.08]' : 'hover:bg-muted/50'
                          )}
                        >
                          <Icon
                            size={15}
                            className={cn(
                              'shrink-0',
                              isActive ? 'text-primary' : 'text-muted-foreground'
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-foreground">
                              {hit.title}
                            </span>
                            {hit.subtitle && (
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {hit.subtitle}
                              </span>
                            )}
                          </span>
                          {hit.badge && <StatusBadge status={hit.badge} size="sm" />}
                          {isActive && (
                            <CornerDownLeft size={13} className="shrink-0 text-muted-foreground" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer legend */}
            <div className="flex items-center gap-4 border-t border-border/60 bg-muted/25 px-4 py-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border/60 bg-card px-1">↑</kbd>
                <kbd className="rounded border border-border/60 bg-card px-1">↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border/60 bg-card px-1">⏎</kbd>
                open
              </span>
              {query.trim().length > 0 && query.trim().length < MIN_SEARCH_LENGTH && (
                <span className="ml-auto">Type {MIN_SEARCH_LENGTH}+ characters to search records</span>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
