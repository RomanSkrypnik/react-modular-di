# react-modular-di

Declarative modules on top of [tsyringe](https://github.com/microsoft/tsyringe), with React bindings.

- `@Module({ imports, providers })` composes a dependency graph.
- Classes and factories are singletons by default, with explicit transient providers.
- Module registration is idempotent for each container.
- `DependencyContainerProvider` and `useService` resolve from the nearest React provider.
- Core and React have separate entrypoints; the React entrypoint preserves `"use client"`.

## Status and compatibility

This is the initial `0.1.0` source project, extracted from an existing application.
It has not been published to npm yet.

- **ES modules only**, with precompiled JavaScript and TypeScript declarations.
- Node.js **22+** for development and the package verification scripts.
- Peer dependencies: **tsyringe 4.10.0**, **React 18.3.1 or React 19**.
- The installed tarball is tested against React **18.3.1** and **19.2.0**.
- Legacy TypeScript decorators and constructor metadata are required for implicit constructor injection.
- Next.js and Vite application builds have not yet been verified for the extracted package.
- Server Components and request-scoped server DI are not part of the initial supported contract.

## Local installation

Build a tarball in this project:

```sh
npm ci
npm run check
npm pack
```

Install it in a consuming project, together with the matching peer dependencies:

```sh
npm install /absolute/path/react-modular-di-0.1.0.tgz tsyringe@4.10.0
```

React must already be installed in the consuming application. The library loads
`reflect-metadata` before re-exporting the tsyringe decorators. Import decorators
from `react-modular-di` to preserve this initialization order.

## Compiler setup

For projects that compile with TypeScript:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "jsx": "react-jsx"
  }
}
```

The **consumer's** compiler must emit constructor metadata. Publishing this library
as JavaScript does not generate metadata for classes in your application.
These settings apply to legacy decorators, not the newer standard decorators.

TypeScript options alone do not configure every Babel, SWC, Oxc or esbuild pipeline.
For Babel, tsyringe documents `babel-plugin-transform-typescript-metadata` alongside
legacy decorator support. Vite's support depends on the transformer and version.
Verify a real constructor dependency in your production build before using a new
toolchain. A missing transform typically produces `TypeInfo not known` during resolution.

## Quick start

### Declare services and modules

```ts
import { Module, injectable, type DependencyModule } from "react-modular-di";

@injectable()
export class ApiClient {
  getGreeting() {
    return "Hello from DI";
  }
}

@Module({ providers: [ApiClient] })
class HttpModule {
  declare static register: DependencyModule["register"];
}

@injectable()
export class GreetingService {
  constructor(private readonly api: ApiClient) {}

  getGreeting() {
    return this.api.getGreeting();
  }
}

@Module({ imports: [HttpModule], providers: [GreetingService] })
export class AppModule {
  declare static register: DependencyModule["register"];
}
```

TypeScript decorators cannot add static members to the class's compile-time type.
The `declare static register` line describes the member installed by `@Module`.
The existing `static register: DependencyModule["register"]` style also works
with legacy decorators.

### Provide a container to React

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { container } from "react-modular-di";
import { DependencyContainerProvider, useService } from "react-modular-di/react";
import { AppModule, GreetingService } from "./services";

function createAppContainer() {
  const child = container.createChildContainer();
  AppModule.register(child);
  return child;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [dependencies] = useState(createAppContainer);

  return <DependencyContainerProvider value={dependencies}>{children}</DependencyContainerProvider>;
}

export function Greeting() {
  const greeting = useService(GreetingService);
  return <h1>{greeting.getGreeting()}</h1>;
}
```

Keep container identity stable across renders. The example uses a lazy state
initializer; applications with Fast Refresh token changes may need to recreate
their composition root when service classes are replaced.

## Provider forms

```ts
@Module({
  imports: [HttpModule],
  providers: [
    GreetingService,
    { token: API_URL, useValue: "/api" },
    { token: API_CLIENT, useClass: ApiClient },
    { token: CLIENT_ALIAS, useToken: API_CLIENT },
    { token: SETTINGS, useFactory: (target) => target.resolve(SettingsService) },
    { token: DraftStore, useClass: DraftStore, singleton: false },
    { token: REQUEST_ID, useFactory: () => crypto.randomUUID(), singleton: false },
  ],
})
class FeatureModule {
  declare static register: DependencyModule["register"];
}
```

All tokens and classes in this provider reference must be defined by your application.

| Provider                | Lifetime                                                 |
| ----------------------- | -------------------------------------------------------- |
| `SomeClass`             | Singleton registration                                   |
| `{ token, useClass }`   | Singleton unless `singleton: false`                      |
| `{ token, useFactory }` | Cached per module registration unless `singleton: false` |
| `{ token, useValue }`   | The exact supplied value; objects are not cloned         |
| `{ token, useToken }`   | Alias preserving the target registration's lifetime      |

Singleton factories cache **all** successful results, including `null`, `undefined`,
`false` and `0`. A thrown error is not cached; the next resolution retries the factory.
Asynchronous factories return their Promise unchanged, including a cached rejected
Promise for a singleton factory. There is no asynchronous resolution or Suspense API.

Multiple registrations under one token are preserved for tsyringe's `injectAll`
and `resolveAll`. For ordinary resolution the last registration wins, as in tsyringe.

## Container and lifecycle contract

### Isolation and inheritance

Register a module separately in each application container to isolate its class
singletons and factory caches. Providers registered **only in a parent** are
inherited by its children, including their cached singleton instances.

Value objects are shared by reference even across separate module registrations.
For a fresh object per application container, use a factory instead of `useValue`.

Module imports are registration dependencies, not visibility boundaries:
all providers are registered in the supplied container. There is no private/exported
provider mechanism. Circular imports throw an error showing the module path.

### Full reset

Create a **new container** and register your modules again for a full reset.
Calling tsyringe's `reset()` or `clearInstances()` on a module-managed container
and then calling `Module.register()` again is **not supported**. Registration
deduplication and factory caches intentionally live for that container's lifetime.

Registration failures are not transactional: earlier imported modules or providers
may already be registered. Fix the configuration and create a new container after
a failed registration.

### Disposal

The caller owns the container. React providers do **not** dispose externally supplied
containers when they unmount. Call `await dependencies.dispose()` at the owning
lifecycle boundary, after consumers have finished using it.

tsyringe tracks disposable class instances that it constructs. It does not
automatically track objects supplied by `useValue` or returned directly from
`useFactory`; the caller must manage those resources explicitly.

### React render semantics

`useService` resolves during render and memoizes by container and token.
Constructors and factories must not start network requests, subscriptions or timers.
React may retry renders or discard memoized values. Singleton identity is guaranteed
by the container; transient providers do not promise component-lifetime identity.
Changing a registration inside the same container does not notify React or invalidate
the hook cache. Replace the provider's container when changing the dependency graph.

## Public API

`react-modular-di`:

- `Module`, `resolve(token, targetContainer?)` — defaults to tsyringe's root container
  when the container is omitted; prefer an explicit container for application isolation.
- Types: `Constructor`, `DependencyModule`, `ModuleOptions`, `ModuleProvider`,
  `DependencyContainer`, `InjectionToken`, `Disposable`.
- tsyringe exports: `container`, `inject`, `injectable`, `injectAll`,
  `instanceCachingFactory`, `Lifecycle`, `registry`, `scoped`, `singleton`.
  The re-exported `instanceCachingFactory` retains tsyringe's original behavior;
  `@Module` uses its own cache to support nullable results.

`react-modular-di/react`:

- `DependencyContainerProvider`, `useDependencyContainer`, `useService`.
- Type: `DependencyContainerProviderProps`.

Resolution errors propagate unchanged; the library does not log them automatically.

## Development and verification

```sh
npm ci
npm run check
npm run test:package
```

`check` type-checks production and test sources, runs Node's test runner, emits JS
and declarations, and checks formatting. TypeScript emits metadata for the test
classes, so constructor injection is tested without a special test transformer.

`test:package` creates an npm tarball, installs it in isolated local fixture projects
with React 18 and 19, checks public declarations against matching React types,
and reruns all runtime tests through the installed public exports. Artifacts are
kept in the gitignored `.package-test/` directory for inspection.

Before a public release, verify actual Next.js/Vite production builds for the
toolchains you intend to support, choose a repository URL, and review package metadata.
