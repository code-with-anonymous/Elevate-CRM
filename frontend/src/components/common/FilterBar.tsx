// ─────────────────────────────────────────────────────────────────────────────
// src/components/common/FilterBar.tsx
// One toolbar row: search · filter popovers · active chips · page actions.
//
// The public contract is unchanged — `FilterConfig` still carries a single
// string `value` and a `onChange(value)` callback, and the debounce behaviour
// around search is identical. Only the presentation moved: native <select>
// elements became popovers with checkbox affordances, and active filters now
// surface as removable chips instead of a bare "2 active" counter.
//
// `actions` is additive: it lets a page hang its primary CTA off the right of
// the same toolbar instead of duplicating a header row.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, ListFilter, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDebounce } from '@/hooks/useDebounce';
import { useClickOutside } from '@/hooks/useClickOutside';
import { popoverVariants } from '@/lib/motion';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

interface FilterBarProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters?: FilterConfig[];
  onClearAll?: () => void;
  /** Right-aligned slot — primary CTA, view toggles, export, etc. */
  actions?: ReactNode;
  className?: string;
}

// ── Filter popover ────────────────────────────────────────────────────────────

function FilterPopover({ filter }: { filter: FilterConfig }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);

  const selected = filter.options.find((o) => o.value === filter.value);
  const isActive = Boolean(filter.value);

  const select = (value: string) => {
    // Re-picking the current option clears it, so the popover doubles as its
    // own reset without adding a second control.
    filter.onChange(value === filter.value ? '' : value);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium',
          'transition-colors duration-150',
          isActive
            ? 'border-primary/30 bg-primary/10 text-primary'
            : 'border-border/60 bg-card text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground'
        )}
      >
        <ListFilter size={14} />
        <span>{selected ? selected.label : filter.label}</span>
        <ChevronDown
          size={13}
          className={cn('transition-transform duration-150', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            variants={popoverVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute left-0 top-full z-50 mt-1.5 w-52 origin-top-left rounded-xl border border-border/60 bg-popover p-1 shadow-pop"
          >
            <p className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {filter.label}
            </p>
            <div className="max-h-64 overflow-y-auto">
              {filter.options.map((opt) => {
                const active = filter.value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => select(opt.value)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-foreground transition-colors duration-150 hover:bg-muted"
                  >
                    <span
                      className={cn(
                        'flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border'
                      )}
                    >
                      {active && <Check size={11} className="stroke-[3]" />}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Active filter chip ────────────────────────────────────────────────────────

function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.15 }}
      className="inline-flex h-7 items-center gap-1 rounded-full border border-border/60 bg-muted/60 pl-2.5 pr-1 text-xs text-foreground"
    >
      <span className="text-muted-foreground">{label}:</span>
      <span className="max-w-[10rem] truncate font-medium">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
      >
        <X size={12} />
      </button>
    </motion.span>
  );
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

export default function FilterBar({
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  filters = [],
  onClearAll,
  actions,
  className = '',
}: FilterBarProps) {
  const [searchInput, setSearchInput] = useState(searchValue);
  const debouncedSearch = useDebounce(searchInput, 400);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal input when parent searchValue resets
  useEffect(() => {
    setSearchInput(searchValue);
  }, [searchValue]);

  // Trigger search callback on debounced change
  useEffect(() => {
    if (debouncedSearch !== searchValue) {
      onSearchChange(debouncedSearch);
    }
  }, [debouncedSearch]);

  // "/" jumps to search, the way every tool with a command surface behaves.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activeFilters = filters.filter((f) => Boolean(f.value));
  const activeFiltersCount = (searchValue ? 1 : 0) + activeFilters.length;

  const handleClear = () => {
    setSearchInput('');
    onSearchChange('');
    filters.forEach((f) => f.onChange(''));
    if (onClearAll) onClearAll();
  };

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Search — filled, borderless at rest; the border arrives on focus */}
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={inputRef}
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={searchPlaceholder}
            className={cn(
              'h-9 w-full rounded-lg border border-transparent bg-muted/60 pl-9 pr-16 text-sm',
              'text-foreground placeholder:text-muted-foreground',
              'outline-none transition-colors duration-150',
              'hover:bg-muted focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/15'
            )}
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                onSearchChange('');
              }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            >
              <X size={13} />
            </button>
          ) : (
            <kbd className="kbd pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
              /
            </kbd>
          )}
        </div>

        {filters.map((filter) => (
          <FilterPopover key={filter.key} filter={filter} />
        ))}

        {activeFiltersCount > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="h-9 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            Clear all
          </button>
        )}

        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>

      {/* Chips only materialise once something is filtering */}
      <AnimatePresence initial={false}>
        {activeFilters.length > 0 && (
          <motion.div
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-wrap items-center gap-1.5 overflow-hidden"
          >
            <AnimatePresence initial={false}>
              {activeFilters.map((f) => (
                <FilterChip
                  key={f.key}
                  label={f.label}
                  value={f.options.find((o) => o.value === f.value)?.label ?? f.value}
                  onRemove={() => f.onChange('')}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
