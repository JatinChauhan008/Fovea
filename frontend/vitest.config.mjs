import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Strip "use client" / "use server" directives that Next.js understands but
// Vitest/Vite does not — they are valid JS string expressions so they cause no
// runtime harm, but Vite may warn or reject them in strict mode.
const stripNextDirectives = {
  name: "strip-next-directives",
  transform(code, id) {
    if (/\.(ts|tsx|js|jsx)$/.test(id)) {
      return code.replace(/^["']use (client|server)["'];\s*/m, "");
    }
  },
};

export default defineConfig({
  plugins: [stripNextDirectives, react()],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // vmForks runs each file in a fresh VM context inside the same process,
    // avoiding the Windows subprocess-spawn timeout seen with the default pool.
    pool: "vmForks",
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
