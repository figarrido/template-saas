/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    '@opentelemetry/sdk-node',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/exporter-logs-otlp-grpc',
    '@opentelemetry/auto-instrumentations-node',
    '@sentry/node',
    'pino',
    'pino-pretty',
    'postgres',
    'drizzle-orm',
  ],
  transpilePackages: [
    '@template/auth',
    '@template/billing',
    '@template/db',
    '@template/env',
    '@template/flags',
    '@template/observability',
    '@template/ui',
  ],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    // See apps/web/next.config.js for context — Sentry's instrumentation
    // pipeline uses dynamic require() that webpack flags but is harmless.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /@opentelemetry\/instrumentation/ },
      { module: /require-in-the-middle/ },
      { module: /@prisma\/instrumentation/ },
    ];
    return config;
  },
  // Stricter than apps/web: no analytics origins allowed in default CSP,
  // frame-ancestors 'none' enforced statically as well as via per-request
  // CSP header in middleware. docs/architecture/01-stack.md § Admin vs.
  // client app.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
