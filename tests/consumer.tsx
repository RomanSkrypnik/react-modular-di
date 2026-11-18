import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import {
  Module,
  container,
  injectable,
  type DependencyModule,
  type ModuleOptions,
  type ModuleProvider,
} from "react-modular-di";
import {
  DependencyContainerProvider,
  useService,
  type DependencyContainerProviderProps,
} from "react-modular-di/react";

@injectable()
class Api {
  message = "dependency resolved";
}

@injectable()
class Service {
  constructor(readonly api: Api) {}
}

const providers: readonly ModuleProvider[] = [Api, Service];
const options: ModuleOptions = { providers };

@Module(options)
class AppModule {
  declare static register: DependencyModule["register"];
}

const child = container.createChildContainer();
AppModule.register(child);

function Probe() {
  const service = useService(Service);
  assert.equal(service.api, child.resolve(Api));
  return <span>{service.api.message}</span>;
}

const props: DependencyContainerProviderProps = {
  value: child,
  children: <Probe />,
};
assert.equal(
  renderToString(<DependencyContainerProvider {...props} />),
  "<span>dependency resolved</span>",
);
console.log("Installed package exports, declarations and constructor metadata: OK");
