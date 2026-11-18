import "./tsyringe.js";
import type { DependencyContainer, InjectionToken } from "./tsyringe.js";

export type Constructor<T = object> = Extract<InjectionToken<T>, new (...args: never[]) => T>;

export type ModuleProvider =
  | Constructor
  | { token: InjectionToken<unknown>; useValue: unknown }
  | { token: InjectionToken<unknown>; useClass: Constructor; singleton?: boolean }
  | { token: InjectionToken<unknown>; useToken: InjectionToken<unknown> }
  | {
      token: InjectionToken<unknown>;
      useFactory: (container: DependencyContainer) => unknown;
      singleton?: boolean;
    };

export type DependencyModule = {
  register(container: DependencyContainer): void;
};

export type ModuleOptions = {
  imports?: readonly DependencyModule[];
  providers?: readonly ModuleProvider[];
};

const registrationPaths = new WeakMap<DependencyContainer, { readonly name: string }[]>();

function cacheFactory(factory: (container: DependencyContainer) => unknown) {
  let initialized = false;
  let value: unknown;

  return (container: DependencyContainer) => {
    if (!initialized) {
      value = factory(container);
      initialized = true;
    }

    return value;
  };
}

export function Module({ imports = [], providers = [] }: ModuleOptions): ClassDecorator {
  return (target) => {
    const dependencyModule = target as unknown as DependencyModule;
    const registeredContainers = new WeakSet<DependencyContainer>();

    dependencyModule.register = (targetContainer) => {
      if (registeredContainers.has(targetContainer)) return;

      const path = registrationPaths.get(targetContainer) ?? [];
      if (path.includes(target)) {
        const names = [...path, target].map((module) => module.name || "<anonymous>");
        throw new Error(`Circular module import: ${names.join(" -> ")}`);
      }

      path.push(target);
      registrationPaths.set(targetContainer, path);

      try {
        for (const dependency of imports) dependency.register(targetContainer);

        for (const provider of providers) {
          if (typeof provider === "function") {
            targetContainer.registerSingleton(provider, provider);
          } else if ("useValue" in provider) {
            targetContainer.registerInstance(provider.token, provider.useValue);
          } else if ("useClass" in provider) {
            if (provider.singleton === false) {
              targetContainer.register(provider.token, { useClass: provider.useClass });
            } else {
              targetContainer.registerSingleton(provider.token, provider.useClass);
            }
          } else if ("useToken" in provider) {
            targetContainer.register(provider.token, { useToken: provider.useToken });
          } else {
            targetContainer.register(provider.token, {
              useFactory:
                provider.singleton === false
                  ? provider.useFactory
                  : cacheFactory(provider.useFactory),
            });
          }
        }

        registeredContainers.add(targetContainer);
      } finally {
        path.pop();
        if (path.length === 0) registrationPaths.delete(targetContainer);
      }
    };
  };
}
