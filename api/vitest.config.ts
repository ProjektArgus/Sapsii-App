import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The suites build a real Fastify app through `inject`, so the first test in
    // each file also pays for transforming the API and its dependencies. That
    // cold cost routinely exceeds Vitest's five second default on a loaded
    // machine, which surfaced as spurious timeouts instead of test failures.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
