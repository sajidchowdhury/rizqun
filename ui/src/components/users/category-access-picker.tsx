import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Category } from '@/types/category';

interface CategoryAccessPickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  categories: Category[] | undefined;
  disabled?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  grocery: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  medicine: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  other: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  all: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
};

export function CategoryAccessPicker({
  value,
  onChange,
  categories,
  disabled,
}: CategoryAccessPickerProps) {
  const hasAll = value.includes('all');

  function toggle(slug: string) {
    if (slug === 'all') {
      onChange(hasAll ? [] : ['all']);
      return;
    }

    if (hasAll) {
      onChange([slug]);
      return;
    }

    if (value.includes(slug)) {
      onChange(value.filter((s) => s !== slug));
    } else {
      onChange([...value, slug]);
    }
  }

  const availableSlugs = categories?.map((c) => c.slug) ?? [];
  const allOptions = ['all', ...availableSlugs];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {allOptions.map((slug) => {
          const isSelected = value.includes(slug);
          const label =
            slug === 'all' ? 'All' : (categories?.find((c) => c.slug === slug)?.name ?? slug);
          return (
            <button
              key={slug}
              type="button"
              disabled={disabled}
              onClick={() => toggle(slug)}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors',
                isSelected
                  ? (CATEGORY_COLORS[slug] ?? 'bg-primary text-primary-foreground')
                  : 'border-border text-muted-foreground hover:bg-accent',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              {isSelected && <Check className="size-3" />}
              {label}
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
