import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

export type InitOtelOptions = {
  service: string;
  release?: string;
  env?: string;
  /** OTLP HTTP exporter endpoint. Absent = no-op (no traces shipped). */
  exporterUrl?: string;
};

let sdk: NodeSDK | undefined;

/**
 * Initialize OpenTelemetry once per process. Subsequent calls are no-ops.
 *
 * Trace context propagates over HTTP via W3C `traceparent` and across pgmq
 * via the job-payload envelope (packages/jobs serializes/deserializes the
 * active context). Sentry consumes OTel spans, so we don't double-init.
 */
export function initOtel(options: InitOtelOptions): NodeSDK | undefined {
  if (sdk) return sdk;
  const exporterUrl =
    options.exporterUrl ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!exporterUrl) return undefined; // Absent = no-op per docs/architecture/06-observability.md.

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: options.service,
      [ATTR_SERVICE_VERSION]: options.release ?? process.env.RELEASE ?? 'dev',
      'deployment.environment': options.env ?? process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${exporterUrl}/v1/traces` }),
  });
  sdk.start();
  return sdk;
}

export async function shutdownOtel(): Promise<void> {
  if (!sdk) return;
  await sdk.shutdown();
  sdk = undefined;
}
