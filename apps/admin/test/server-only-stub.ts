// No-op stub for the `server-only` package in the vitest (Node) environment.
//
// `server-only`'s default export throws when imported outside a React Server
// Component, and its no-op `empty.js` is only selected under the `react-server`
// export condition — which Next.js applies at build time but vitest does not.
// The admin data-access modules under lib/ start with `import 'server-only'`;
// aliasing it here lets the integration suite import them without pulling in
// (or installing) the real package, mirroring Next's build-time handling.
export {};
