import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import {
  container,
  Module,
  injectable,
  type DependencyModule,
  type InjectionToken,
} from "../src/index.js";
import { DependencyContainerProvider, useDependencyContainer, useService } from "../src/react.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
});

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(() => root?.unmount());
  root = undefined;
  dom.window.document.body.replaceChildren();
});
after(() => dom.window.close());

function mountPoint() {
  const element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  return { element, root };
}

test("a missing provider has an actionable error", () => {
  function Probe() {
    useDependencyContainer();
    return null;
  }

  assert.throws(() => renderToString(<Probe />), /DependencyContainerProvider is missing/);
});

test("hooks use the nearest provider and react to a changed container or token", async () => {
  const firstToken = Symbol("first");
  const secondToken = Symbol("second");
  const parent = container.createChildContainer();
  const first = container.createChildContainer();
  const second = container.createChildContainer();
  parent.registerInstance(firstToken, "parent");
  first.registerInstance(firstToken, "first");
  second.registerInstance(firstToken, "second");
  second.registerInstance(secondToken, "other token");
  function Probe({ token }: { token: InjectionToken<string> }) {
    const activeContainer = useDependencyContainer();
    const value = useService(token);
    return <span data-parent={String(activeContainer === parent)}>{value}</span>;
  }
  const { element, root } = mountPoint();
  await act(() =>
    root.render(
      <DependencyContainerProvider value={parent}>
        <Probe token={firstToken} />
        <DependencyContainerProvider value={first}>
          <Probe token={firstToken} />
        </DependencyContainerProvider>
      </DependencyContainerProvider>,
    ),
  );
  assert.equal(element.textContent, "parentfirst");
  assert.equal(element.querySelector("span")?.dataset.parent, "true");
  assert.equal(element.querySelectorAll("span")[1]?.dataset.parent, "false");

  await act(() =>
    root.render(
      <DependencyContainerProvider value={parent}>
        <Probe token={firstToken} />
        <DependencyContainerProvider value={second}>
          <Probe token={firstToken} />
        </DependencyContainerProvider>
      </DependencyContainerProvider>,
    ),
  );
  assert.equal(element.textContent, "parentsecond");

  await act(() =>
    root.render(
      <DependencyContainerProvider value={parent}>
        <Probe token={firstToken} />
        <DependencyContainerProvider value={second}>
          <Probe token={secondToken} />
        </DependencyContainerProvider>
      </DependencyContainerProvider>,
    ),
  );
  assert.equal(element.textContent, "parentother token");
});

test("StrictMode and rerenders preserve singleton identity without disposing an external container", async () => {
  let constructed = 0;
  let disposed = 0;
  @injectable()
  class Service {
    constructor() {
      constructed++;
    }
    dispose() {
      disposed++;
    }
  }
  @Module({ providers: [Service] })
  class ServicesModule {
    declare static register: DependencyModule["register"];
  }
  const child = container.createChildContainer();
  ServicesModule.register(child);
  const instances: Service[] = [];
  function Probe({ count }: { count: number }) {
    instances.push(useService(Service));
    return <span>{count}</span>;
  }
  const { element, root } = mountPoint();
  await act(() =>
    root.render(
      <StrictMode>
        <DependencyContainerProvider value={child}>
          <Probe count={1} />
        </DependencyContainerProvider>
      </StrictMode>,
    ),
  );
  await act(() =>
    root.render(
      <StrictMode>
        <DependencyContainerProvider value={child}>
          <Probe count={2} />
        </DependencyContainerProvider>
      </StrictMode>,
    ),
  );

  assert.equal(element.textContent, "2");
  assert.ok(instances.length >= 2);
  assert.equal(new Set(instances).size, 1);
  assert.equal(constructed, 1);
  await act(() => root.unmount());
  assert.equal(disposed, 0);
  assert.equal(child.resolve(Service), instances[0]);
  await child.dispose();
  assert.equal(disposed, 1);
});
