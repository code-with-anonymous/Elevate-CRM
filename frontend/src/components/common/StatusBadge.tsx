
interface StatusBadgeProps {
  status: string;
  variantMap?: Record<string, { dotClass: string; badgeClass?: string }>;
  className?: string;
}

const DEFAULT_MAP: Record<string, { dotClass: string; badgeClass?: string }> = {
  New: { dotClass: 'bg-blue-500', badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  Contacted: { dotClass: 'bg-amber-500', badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  Qualified: { dotClass: 'bg-purple-500', badgeClass: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400' },
  Proposal: { dotClass: 'bg-indigo-500', badgeClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400' },
  'Proposal Sent': { dotClass: 'bg-indigo-500', badgeClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400' },
  Negotiation: { dotClass: 'bg-orange-500', badgeClass: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400' },
  Won: { dotClass: 'bg-green-500', badgeClass: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' },
  Lost: { dotClass: 'bg-red-500', badgeClass: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  Open: { dotClass: 'bg-blue-500', badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  'In Progress': { dotClass: 'bg-amber-500', badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  Done: { dotClass: 'bg-green-500', badgeClass: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' },
  High: { dotClass: 'bg-red-500', badgeClass: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  Medium: { dotClass: 'bg-amber-500', badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  Low: { dotClass: 'bg-green-500', badgeClass: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' },
};

export default function StatusBadge({ status, variantMap, className = '' }: StatusBadgeProps) {
  const map = { ...DEFAULT_MAP, ...variantMap };
  const config = map[status] || { dotClass: 'bg-gray-400', badgeClass: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.badgeClass} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`} />
      {status}
    </span>
  );
}
