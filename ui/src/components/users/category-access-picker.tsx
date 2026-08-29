import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

interface CategoryAccessPickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

/**
 * Fixed 4-option category access picker.
 *
 * The user's category access is now scoped to one of 4 fixed sections
 * (not the dynamically-created categories from imports):
 *   - all       → super admin / unrestricted access
 *   - grocery   → grocery products only
 *   - medicine  → medicine products only
 *   - services  → services category (a new section added for non-product
 *                 offerings like delivery fees, service charges, etc.)
 *
 * This keeps the picker simple + stable — operators don't see a growing
 * list of categories as products are imported with new categories.
 *
 * Multiple selections are allowed (except "all" which is exclusive).
 * Toggling "all" clears the others; toggling any other clears "all".
 */

const FIXED_OPTIONS = [
  { slug: 'all', label: 'All', description: 'Full access' },
  { slug: 'grocery', label: 'Grocery', description: 'Grocery products' },
  { slug: 'medicine', label: 'Medicine', description: 'Medicine products' },
  { slug: 'services', label: 'Services', description: 'Services category' },
] as const;

const OPTION_COLORS: Record<string, string> = {
  all: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  grocery: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  medicine: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  services: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

export function CategoryAccessPicker({
  value,
  onChange,
  disabled,
}: CategoryAccessPickerProps) {
  const hasAll = value.includes('all');

  function toggle(slug: string) {
    if (slug === 'all') {
      // "all" is exclusive — selecting it clears everything else,
      // deselecting it leaves an empty array (which fails validation
      // — the operator must pick at least one).
      onChange(hasAll ? [] : ['all']);
      return;
    }

    // Selecting any non-"all" option clears "all" (can't combine)
    let next = hasAll ? [] : [...value];

    if (next.includes(slug)) {
      // Deselect
      next = next.filter((s) => s !== slug);
    } else {
      // Select
      next = [...next, slug];
    }
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {FIXED_OPTIONS.map((opt) => {
          const isSelected = value.includes(opt.slug);
          return (
            <button
              key={opt.slug}
              type="button"
              disabled={disabled}
              onClick={() => toggle(opt.slug)}
              title={opt.description}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors',
                isSelected
                  ? (OPTION_COLORS[opt.slug] ?? 'bg-primary text-primary-foreground')
                  : 'border-border text-muted-foreground hover:bg-accent',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              {isSelected && <Check className="size-3" />}
              {opt.label}
            </button>
          );
        })}
      </div>
      {value.length === 0 && (
        <p className="text-xs text-destructive">At least one category is required.</p>
      )}
    </div>
  );
}
