import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn.js';

// Sizes map to the named DESIGN.md type scale (see packages/config tailwind
// preset). Each token carries its own size / line-height / letter-spacing.
const headingVariants = cva('font-semibold', {
  variants: {
    size: {
      h1: 'text-h1',
      h2: 'text-h2',
      h3: 'text-h3',
      h4: 'text-h4',
    },
  },
  defaultVariants: { size: 'h2' },
});

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4';

interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  as?: HeadingTag;
}

export function Heading({ as: Tag = 'h2', size, className, ...props }: HeadingProps) {
  return <Tag className={cn(headingVariants({ size }), className)} {...props} />;
}

const textVariants = cva('', {
  variants: {
    variant: {
      default: 'text-foreground',
      muted: 'text-muted-foreground',
      destructive: 'text-destructive',
    },
    size: {
      sm: 'text-sm',
      base: 'text-base',
      lg: 'text-lg',
    },
  },
  defaultVariants: { variant: 'default', size: 'base' },
});

interface TextProps
  extends React.HTMLAttributes<HTMLParagraphElement>,
    VariantProps<typeof textVariants> {}

export function Text({ variant, size, className, ...props }: TextProps) {
  return <p className={cn(textVariants({ variant, size }), className)} {...props} />;
}
