import { JobRegistry } from '../src/registry.js';

// Resolve a JobRegistry for codegen. The script defers to a worker
// supplying its own registry via the JOBS_REGISTRY_MODULE env var; this
// keeps packages/jobs independent of where the registry actually lives.
//
// When no module is supplied (the template default before
// services/worker-node lands its own registry in Phase 11), return an
// empty registry — codegen still produces the package skeleton.
export async function loadRegistry(): Promise<JobRegistry> {
  const mod = process.env.JOBS_REGISTRY_MODULE;
  if (!mod) return new JobRegistry();
  const m = (await import(mod)) as { default?: JobRegistry; registry?: JobRegistry };
  const r = m.default ?? m.registry;
  if (!(r instanceof JobRegistry)) {
    throw new Error(`${mod} must export a JobRegistry as default or named 'registry'`);
  }
  return r;
}
