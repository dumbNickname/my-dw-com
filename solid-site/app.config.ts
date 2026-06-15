import { defineConfig } from "@solidjs/start/config";

const basePath = process.env.BASE_PATH || "";

export default defineConfig({
  ssr: false,
  vite: {
    build: { sourcemap: true },
    define: {
      "import.meta.env.BASE_PATH": JSON.stringify(basePath),
    },
  },
  server: {
    baseURL: basePath,
    preset: "static",
    prerender: {
      routes: ["/"],
    },
  },
});
