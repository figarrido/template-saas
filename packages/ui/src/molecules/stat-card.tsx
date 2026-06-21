import * as React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../utils/cn.js';
import { Card, CardContent } from '../components/card.js';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: string | number;
  description?: string;
  trend?: { value: number; label?: string };
  icon?: React.ReactNode;
}

export function StatCard({ title, value, description, trend, icon, className, ...props }: StatCardProps) {
  const dir = trend
    ? trend.value > 0
      ? 'up'
      : trend.value < 0
        ? 'down'
        : 'flat'
    : null;

  return (
    <Card className={cn('', className)} {...props}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          {icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {icon}
            </div>
          )}
        </div>

        {(trend ?? description) && (
          <div className="mt-3 flex flex-wrap items-center gap-1 text-sm">
            {trend && (
              <>
                {dir === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
                {dir === 'down' && <TrendingDown className="h-4 w-4 text-destructive" />}
                {dir === 'flat' && <Minus className="h-4 w-4 text-muted-foreground" />}
                <span
                  className={cn(
                    'font-medium',
                    dir === 'up' && 'text-green-500',
                    dir === 'down' && 'text-destructive',
                    dir === 'flat' && 'text-muted-foreground',
                  )}
                >
                  {trend.value > 0 ? '+' : ''}
                  {trend.value}%
                </span>
                {trend.label && (
                  <span className="text-muted-foreground">{trend.label}</span>
                )}
              </>
            )}
            {description && !trend && (
              <span className="text-muted-foreground">{description}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
