import { Package } from 'lucide-react';

import { cn } from '@/lib/utils';
import { imageUrl } from '@/lib/image';

interface ProductImageProps {
  src: string | null | undefined;
  alt: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const SIZE_CLASSES = {
  xs: 'size-8',
  sm: 'size-12',
  md: 'size-16',
};

/**
 * Product image thumbnail with fallback placeholder.
 * Uses lazy loading for performance.
 */
export function ProductImage({ src, alt, size = 'sm', className }: ProductImageProps) {
  const url = imageUrl(src);

  return (
    <div
      className={cn('shrink-0 overflow-hidden rounded-md bg-muted', SIZE_CLASSES[size], className)}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className="size-full object-cover"
          onError={(e) => {
            // If the image fails to load, hide the img and show the placeholder
            const target = e.currentTarget;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              parent.classList.add('flex', 'items-center', 'justify-center');
              const icon = document.createElement('span');
              icon.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><path d="M3.27 6.96 12 12.01l8.73-5.05"></path><path d="M12 22.08V12"></path></svg>';
              parent.appendChild(icon);
            }
          }}
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Package className="size-4 text-muted-foreground/40" />
        </div>
      )}
    </div>
  );
}
