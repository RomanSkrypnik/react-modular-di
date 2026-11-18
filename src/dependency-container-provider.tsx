"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DependencyContainer } from "./tsyringe.js";

const DependencyContainerContext = createContext<DependencyContainer | null>(null);

export type DependencyContainerProviderProps = {
  value: DependencyContainer;
  children: ReactNode;
};

export function DependencyContainerProvider({ value, children }: DependencyContainerProviderProps) {
  return (
    <DependencyContainerContext.Provider value={value}>
      {children}
    </DependencyContainerContext.Provider>
  );
}

export function useDependencyContainer(): DependencyContainer {
  const dependencyContainer = useContext(DependencyContainerContext);
  if (!dependencyContainer) throw new Error("DependencyContainerProvider is missing");
  return dependencyContainer;
}
