# Changelog

## 0.1.0

Initial package extracted from the application's DI layer.

- Declarative `@Module({ imports, providers })` composition over tsyringe 4.10.0.
- Idempotent registration per container, imported modules, value/class/factory/alias
  providers, singleton defaults and opt-in transient lifetimes.
- Singleton factory caching for nullable results and retry after synchronous errors.
- Circular module import diagnostics with the registration path.
- Separate core and React client entrypoints, with public TypeScript declarations.
- React 18.3.1 and 19.2.0 installed-package verification.
- Next.js 16.4.6 / Turbopack production build, Client Component prerendering and
  Chromium hydration verification.

The initial contract uses new containers for full resets, external ownership for
disposal, legacy TypeScript decorators and ESM-only distribution.
