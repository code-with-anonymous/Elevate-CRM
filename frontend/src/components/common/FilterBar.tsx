import { useState, useEffect } from 'react';
import { Search, X, Filter } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

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
  className?: string;
}

export default function FilterBar({
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  filters = [],
  onClearAll,
  className = '',
}: FilterBarProps) {
  const [searchInput, setSearchInput] = useState(searchValue);
  const debouncedSearch = useDebounce(searchInput, 400);

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

  // Count active filters
  const activeFiltersCount =
    (searchValue ? 1 : 0) + filters.filter((f) => Boolean(f.value)).length;

  const handleClear = () => {
    setSearchInput('');
    onSearchChange('');
    filters.forEach((f) => f.onChange(''));
    if (onClearAll) onClearAll();
  };

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
        />
        {searchInput && (
          <button
            onClick={() => {
              setSearchInput('');
              onSearchChange('');
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter Selects */}
      {filters.map((filter) => (
        <div key={filter.key} className="relative">
          <select
            value={filter.value}
            onChange={(e) => filter.onChange(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
          >
            <option value="">All {filter.label}s</option>
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {/* Active Count & Clear Button */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
            <Filter size={12} />
            {activeFiltersCount} active
          </span>
          <button
            onClick={handleClear}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
