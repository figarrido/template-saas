import pino from 'pino';
import type { Logger, LoggerOptions } from 'pino';
import { trace } from '@opentelemetry/api';
import { getContext } from './context.js';

export type CreateLoggerOptions = {
  service: string;
  env?: string;
  release?: string;
  level?: pino.LevelWithSilent;
  /** Disable JSON output (defaults to false in dev for pretty stdout). */
  pretty?: boolean;
};

const REDACT_PATHS = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  '*.password',
  '*.token',
  '*.secret',
  '*.authorization',
  '*.cookie',
  'headers.authorization',
  'headers.cookie',
];

export function createLogger({
  service,
  env = process.env.NODE_ENV ?? 'development',
  release = process.env.RELEASE,
  level = (process.env.LOG_LEVEL as pino.LevelWithSilent | undefined) ?? 'info',
  pretty = env !== 'production',
}: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    level,
    base: {
      service,
      env,
      ...(release ? { release } : {}),
    },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    // Standard field merge: pull AsyncLocalStorage context + active OTel
    // span attributes onto every log line. Means callers don't have to
    // remember to attach request_id / trace_id manually.
    mixin: () => {
      const ctx = getContext();
      const span = trace.getActiveSpan();
      const spanCtx = span?.spanContext();
      return {
        ...ctx,
        ...(spanCtx ? { trace_id: spanCtx.traceId, span_id: spanCtx.spanId } : {}),
      };
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
  };

  // Pretty transport only in dev — never in prod containers.
  if (pretty) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      },
    });
  }

  return pino(options);
}

export type { Logger };
