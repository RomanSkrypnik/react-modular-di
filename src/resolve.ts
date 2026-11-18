import { container, type DependencyContainer, type InjectionToken } from "./tsyringe.js";

export function resolve<T>(
  token: InjectionToken<T>,
  targetContainer: DependencyContainer = container,
): T {
  return targetContainer.resolve(token);
}
