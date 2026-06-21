'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn.js';

const avatarVariants = cva(
  'relative inline-flex items-center justify-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground select-none shrink-0',
  {
    variants: {
      size: {
        sm: 'h-8 w-8 text-xs',
        md: 'h-10 w-10 text-sm',
        lg: 'h-12 w-12 text-base',
        xl: 'h-16 w-16 text-lg',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface AvatarProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof avatarVariants> {
  src?: string;
  alt?: string;
  initials?: string;
}

export function Avatar({ src, alt, initials, size, className, ...props }: AvatarProps) {
  const [imgError, setImgError] = React.useState(false);

  return (
    <span className={cn(avatarVariants({ size }), className)} {...props}>
      {src && !imgError ? (
        <img
          src={src}
          alt={alt ?? ''}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span aria-label={alt}>{initials ?? '?'}</span>
      )}
    </span>
  );
}
