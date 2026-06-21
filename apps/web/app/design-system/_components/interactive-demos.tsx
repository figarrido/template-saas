'use client';

import * as React from 'react';
import { SearchInput } from '@template/ui';

export function SearchDemo() {
  const [query, setQuery] = React.useState('');
  return (
    <SearchInput
      placeholder="Search anything…"
      value={query}
      onValueChange={setQuery}
      onClear={() => setQuery('')}
      className="max-w-sm"
    />
  );
}
