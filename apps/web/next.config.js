/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Heavy native-ish deps Next must not bundle into instrumentation. The
  // OTel SDK and Sentry SDK pull in Node built-ins (fs, net, tls) that
  // webpack can't resolve when bundled.
  serverExternalPackages: [
    '@opentelemetry/sdk-node',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/exporter-logs-otlp-grpc',
    '@opentelemetry/auto-instrumentations-node',
    '@sentry/node',
    'pino',
    'pino-pretty',
  ],
  transpilePackages: [
    '@template/auth',
    '@template/billing',
    '@template/db',
    '@template/email',
    '@template/env',
    '@template/flags',
    '@template/observability',
    '@template/ui',
  ],
  // Resolve `.js` imports inside TS-source workspace packages — required
  // for ESM moduleResolution: "Bundler" specifiers (`./foo.js`) to find
  // their .ts originals through webpack.
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    // Suppress benign critical-dep warnings from @sentry/nextjs →
    // @sentry/node → @opentelemetry/instrumentation + require-in-the-middle.
    // Both use dynamic require() for runtime patching, which webpack can't
    // statically analyze. Documented as expected by Sentry's Next.js SDK.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /@opentelemetry\/instrumentation/ },
      { module: /require-in-the-middle/ },
      { module: /@prisma\/instrumentation/ },
    ];
    return config;
  },
  // Static security headers — CSP nonce is injected per-request in middleware.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
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
