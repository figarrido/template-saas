'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

// Single shared Sonner setup. Apps render <Toaster /> once near the root
// and call `toast.success()` / `toast.error()` from Server Action results.
export function Toaster() {
  return <SonnerToaster position="top-right" richColors closeButton />;
}

export { toast };
