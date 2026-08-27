import { Star } from 'lucide-react';

import { cn } from '@/lib/utils';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readOnly?: boolean;
  label?: string;
}

const SIZE_CLASSES = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-8',
};

export function StarRating({
  value,
  onChange,
  size = 'md',
  readOnly = false,
  label,
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState(0);

  // Track hover internally so the parent doesn't need to manage it
  const displayValue = hoverValue || value;

  function handleClick(star: number) {
    if (!readOnly && onChange) {
      onChange(star);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-sm font-medium">{label}</span>}
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
            disabled={readOnly}
            onMouseEnter={() => !readOnly && setHoverValue(star)}
            onMouseLeave={() => !readOnly && setHoverValue(0)}
            onClick={() => handleClick(star)}
            className={cn(
              'transition-colors',
              !readOnly && 'cursor-pointer hover:scale-110',
              readOnly && 'cursor-default',
            )}
          >
            <Star
              className={cn(
                SIZE_CLASSES[size],
                star <= displayValue
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-none text-muted-foreground',
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// Need to import useState
import { useState } from 'react';
