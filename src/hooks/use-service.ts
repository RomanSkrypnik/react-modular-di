"use client";

import { useMemo } from "react";
import { useDependencyContainer } from "../dependency-container-provider.js";
import { resolve } from "../resolve.js";
import type { InjectionToken } from "../tsyringe.js";

export function useService<T>(token: InjectionToken<T>): T {
  const container = useDependencyContainer();
  return useMemo(() => resolve(token, container), [container, token]);
}
