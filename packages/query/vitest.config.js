import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        environment: "node",
        include: ["src/tests/**/*.test.ts"],
        exclude: ["dist/**", "node_modules/**"],
    },
});
//# sourceMappingURL=vitest.config.js.map