import * as React from 'react';
import { cn } from '../utils/cn.js';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions, className, ...props }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
      {...props}
    >
      <div className="space-y-1 min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl truncate">{title}</h1>
        {description && <p className="text-muted-foreground text-sm sm:text-base">{description}</p>}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
