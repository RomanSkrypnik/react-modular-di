"use client";

import { useEffect, useRef, useState } from "react";
import { container } from "react-modular-di";
import { DependencyContainerProvider, useService } from "react-modular-di/react";
import { AppModule, GreetingService } from "./services";

function createDependencies() {
  const dependencies = container.createChildContainer();
  AppModule.register(dependencies);
  return dependencies;
}

export function DependencyProbe() {
  const [dependencies] = useState(createDependencies);
  return (
    <DependencyContainerProvider value={dependencies}>
      <Probe />
    </DependencyContainerProvider>
  );
}

function Probe() {
  const service = useService(GreetingService);
  const firstService = useRef(service);
  const [clicks, setClicks] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <main>
      <h1>Installed package production test</h1>
      <p data-testid="message">{service.getMessage()}</p>
      <p data-testid="identity">
        {service === firstService.current ? "same instance" : "different instance"}
      </p>
      <p>Clicks: {clicks}</p>
      <button disabled={!hydrated} onClick={() => setClicks((value) => value + 1)}>
        Resolve again
      </button>
    </main>
  );
}
