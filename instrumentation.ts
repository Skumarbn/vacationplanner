import { validateProductionEnv } from "./lib/env.ts";

export async function register() {
  validateProductionEnv();
}
