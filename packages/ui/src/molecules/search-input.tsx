'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../utils/cn.js';
import { Input } from '../components/input.js';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onValueChange?: (value: string) => void;
  onClear?: () => void;
}

export function SearchInput({
  className,
  value,
  onValueChange,
  onClear,
  disabled,
  ...props
}: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        className="pl-9 pr-8"
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        disabled={disabled}
        {...props}
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
