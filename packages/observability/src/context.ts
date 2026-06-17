import { AsyncLocalStorage } from 'node:async_hooks';
import type { LogContext } from './fields.js';

// Per-request/per-job context that the logger and Sentry breadcrumb hooks read
// from. Run a unit of work inside `withContext({...}, fn)` and every log line
// emitted during that work automatically carries `request_id`, `org_id`,
// `user_id`, `trace_id`, etc. No threading through every function.

const storage = new AsyncLocalStorage<LogContext>();

export function getContext(): LogContext {
  return storage.getStore() ?? {};
}

export function withContext<T>(ctx: LogContext, fn: () => T): T {
  const merged = { ...getContext(), ...ctx };
  return storage.run(merged, fn);
}

export function bindContext(ctx: LogContext): void {
  // For long-lived contexts (workers) where you've already entered the store
  // and want to stack additional fields without an extra callback.
  const store = storage.getStore();
  if (!store) {
    throw new Error('bindContext called outside of a withContext scope');
  }
  Object.assign(store, ctx);
}
