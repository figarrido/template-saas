import type { ZodTypeAny } from 'zod';
import type { JobDefinition } from './defineJob.js';

// JobDefinition is generic in its payload schema. The registry stores them
// type-erased — producers (with full type info) and the worker loop (which
// re-validates via payload.parse) cover the actual type safety.
type AnyJobDefinition = JobDefinition<ZodTypeAny>;

/**
 * Registry of every job the worker exposes. The same registry powers Python
 * schema generation (jobs:codegen) and the consumer loop in runWorker.
 */
export class JobRegistry {
  private readonly byName = new Map<string, AnyJobDefinition>();
  private readonly byQueue = new Map<string, AnyJobDefinition[]>();

  register<TSchema extends ZodTypeAny>(def: JobDefinition<TSchema>): void {
    if (this.byName.has(def.name)) {
      throw new Error(`Job ${def.name} already registered`);
    }
    const erased = def as unknown as AnyJobDefinition;
    this.byName.set(def.name, erased);
    const list = this.byQueue.get(def.queue) ?? [];
    list.push(erased);
    this.byQueue.set(def.queue, list);
  }

  list(): AnyJobDefinition[] {
    return Array.from(this.byName.values());
  }

  forQueue(queue: string): AnyJobDefinition[] {
    return this.byQueue.get(queue) ?? [];
  }

  get(name: string): AnyJobDefinition | undefined {
    return this.byName.get(name);
  }
}
