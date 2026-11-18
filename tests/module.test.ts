import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Module,
  container,
  inject,
  injectAll,
  injectable,
  resolve,
  type DependencyModule,
  type ModuleOptions,
} from "../src/index.js";

test("singleton factories cache null results", () => {
  const token = Symbol("nullable");
  let calls = 0;
  @Module({
    providers: [
      {
        token,
        useFactory: () => {
          calls++;
          return null;
        },
      },
    ],
  })
  class NullableModule {
    declare static register: DependencyModule["register"];
  }
  const child = container.createChildContainer();
  NullableModule.register(child);

  assert.equal(child.resolve(token), null);
  assert.equal(child.resolve(token), null);
  assert.equal(calls, 1);
});

test("singleton factories cache undefined results", () => {
  const token = Symbol("undefined");
  let calls = 0;
  @Module({
    providers: [
      {
        token,
        useFactory: () => {
          calls++;
          return undefined;
        },
      },
    ],
  })
  class UndefinedModule {
    declare static register: DependencyModule["register"];
  }
  const child = container.createChildContainer();
  UndefinedModule.register(child);

  assert.equal(child.resolve(token), undefined);
  assert.equal(child.resolve(token), undefined);
  assert.equal(calls, 1);
});

test("module cycles produce a diagnostic with the module path", () => {
  const imports: DependencyModule[] = [];
  @Module({ imports })
  class FirstModule {
    declare static register: DependencyModule["register"];
  }
  @Module({ imports: [FirstModule] })
  class SecondModule {
    declare static register: DependencyModule["register"];
  }
  imports.push(SecondModule);

  assert.throws(
    () => FirstModule.register(container.createChildContainer()),
    /Circular module import: FirstModule -> SecondModule -> FirstModule/,
  );
});

test("imports resolve real constructor dependencies and register once in a diamond", () => {
  @injectable()
  class Api {}
  @Module({ providers: [Api] })
  class ApiModule {
    declare static register: DependencyModule["register"];
  }
  @Module({ imports: [ApiModule] })
  class LeftModule {
    declare static register: DependencyModule["register"];
  }
  @Module({ imports: [ApiModule] })
  class RightModule {
    declare static register: DependencyModule["register"];
  }
  @injectable()
  class Service {
    constructor(readonly api: Api) {}
  }
  @Module({ imports: [LeftModule, RightModule], providers: [Service] })
  class AppModule {
    declare static register: DependencyModule["register"];
  }
  const child = container.createChildContainer();
  AppModule.register(child);
  const service = resolve(Service, child);
  AppModule.register(child);

  assert.equal(service.api, child.resolve(Api));
  assert.equal(child.resolveAll(Api).length, 1);
  assert.equal(child.resolve(Service), service);
});

test("supports value, class, alias, singleton factory, transient class and transient factory providers", () => {
  @injectable()
  class Service {}
  const valueToken = Symbol("value");
  const classToken = Symbol("class");
  const aliasToken = Symbol("alias");
  const factoryToken = Symbol("factory");
  const transientClassToken = Symbol("transient class");
  const transientFactoryToken = Symbol("transient factory");
  const value = { configured: true };
  const options = {
    providers: [
      Service,
      { token: valueToken, useValue: value },
      { token: classToken, useClass: Service },
      { token: aliasToken, useToken: Service },
      { token: factoryToken, useFactory: (target) => target.resolve(Service) },
      { token: transientClassToken, useClass: Service, singleton: false },
      { token: transientFactoryToken, useFactory: () => ({}), singleton: false },
    ],
  } satisfies ModuleOptions;
  @Module(options)
  class ProvidersModule {
    declare static register: DependencyModule["register"];
  }
  const child = container.createChildContainer();
  ProvidersModule.register(child);

  assert.equal(child.resolve(valueToken), value);
  assert.equal(child.resolve(classToken), child.resolve(classToken));
  assert.ok(child.resolve(classToken) instanceof Service);
  assert.equal(child.resolve(aliasToken), child.resolve(Service));
  assert.equal(child.resolve(factoryToken), child.resolve(Service));
  assert.notEqual(child.resolve(transientClassToken), child.resolve(transientClassToken));
  assert.notEqual(child.resolve(transientFactoryToken), child.resolve(transientFactoryToken));
});

test("explicit tokens and multi-injection resolve through imported modules", () => {
  const valueToken = Symbol("configuration");
  const listenersToken = Symbol("listeners");
  @injectable()
  class Service {
    constructor(
      @inject(valueToken) readonly value: string,
      @injectAll(listenersToken) readonly listeners: string[],
    ) {}
  }
  @Module({
    providers: [
      { token: valueToken, useValue: "configured" },
      { token: listenersToken, useValue: "first" },
      { token: listenersToken, useValue: "second" },
      Service,
    ],
  })
  class ServicesModule {
    declare static register: DependencyModule["register"];
  }
  const child = container.createChildContainer();
  ServicesModule.register(child);

  assert.equal(child.resolve(Service).value, "configured");
  assert.deepEqual(child.resolve(Service).listeners, ["first", "second"]);
});

test("separate registrations isolate singleton classes and factory caches", () => {
  @injectable()
  class Service {}
  const token = Symbol("factory");
  @Module({ providers: [Service, { token, useFactory: () => ({}) }] })
  class ServicesModule {
    declare static register: DependencyModule["register"];
  }
  const first = container.createChildContainer();
  const second = container.createChildContainer();
  ServicesModule.register(first);
  ServicesModule.register(second);

  assert.equal(first.resolve(Service), first.resolve(Service));
  assert.notEqual(first.resolve(Service), second.resolve(Service));
  assert.equal(first.resolve(token), first.resolve(token));
  assert.notEqual(first.resolve(token), second.resolve(token));
});

test("children inherit singleton registrations from their parent", () => {
  @injectable()
  class Service {}
  const factoryToken = Symbol("factory");
  @Module({ providers: [Service, { token: factoryToken, useFactory: () => ({}) }] })
  class ServicesModule {
    declare static register: DependencyModule["register"];
  }
  const parent = container.createChildContainer();
  ServicesModule.register(parent);
  const first = parent.createChildContainer();
  const second = parent.createChildContainer();

  assert.equal(first.resolve(Service), second.resolve(Service));
  assert.equal(first.resolve(factoryToken), second.resolve(factoryToken));
});

test("a failed factory can be retried and caches its first successful result", () => {
  const token = Symbol("factory");
  const failure = new Error("Temporary failure");
  let calls = 0;
  @Module({
    providers: [
      {
        token,
        useFactory: () => {
          calls++;
          if (calls === 1) throw failure;
          return false;
        },
      },
    ],
  })
  class FactoryModule {
    declare static register: DependencyModule["register"];
  }
  const child = container.createChildContainer();
  FactoryModule.register(child);

  assert.throws(
    () => resolve(token, child),
    (error) => error === failure,
  );
  assert.equal(resolve(token, child), false);
  assert.equal(resolve(token, child), false);
  assert.equal(calls, 2);
});

test("registration failures do not leave a module marked as registering", () => {
  const failure = new Error("Import not ready");
  let ready = false;
  const dependency: DependencyModule = {
    register() {
      if (!ready) throw failure;
    },
  };
  const token = Symbol("configured");
  @Module({ imports: [dependency], providers: [{ token, useValue: 42 }] })
  class AppModule {
    declare static register: DependencyModule["register"];
  }
  const child = container.createChildContainer();
  assert.throws(
    () => AppModule.register(child),
    (error) => error === failure,
  );
  ready = true;
  AppModule.register(child);

  assert.equal(child.resolve(token), 42);
});

test("registering modules performs no service construction", () => {
  let constructed = 0;
  @injectable()
  class Service {
    constructor() {
      constructed++;
    }
  }
  @Module({ providers: [Service] })
  class ServicesModule {
    declare static register: DependencyModule["register"];
  }
  const child = container.createChildContainer();
  ServicesModule.register(child);
  assert.equal(constructed, 0);

  child.resolve(Service);
  child.resolve(Service);
  assert.equal(constructed, 1);
});

test("class services are disposed when the caller disposes the container", async () => {
  let disposed = false;
  @injectable()
  class Service {
    dispose() {
      disposed = true;
    }
  }
  @Module({ providers: [Service] })
  class ServicesModule {
    declare static register: DependencyModule["register"];
  }
  const child = container.createChildContainer();
  ServicesModule.register(child);
  child.resolve(Service);
  await child.dispose();

  assert.equal(disposed, true);
  assert.throws(() => child.resolve(Service), /disposed/);
});
