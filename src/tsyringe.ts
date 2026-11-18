import "reflect-metadata";

export {
  container,
  inject,
  injectable,
  injectAll,
  instanceCachingFactory,
  Lifecycle,
  registry,
  scoped,
  singleton,
} from "tsyringe";

export type { DependencyContainer, Disposable, InjectionToken } from "tsyringe";
