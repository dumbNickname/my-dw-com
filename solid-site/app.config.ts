import { defineConfig } from "@solidjs/start/config";

const basePath = process.env.BASE_PATH || "";

export default defineConfig({
  ssr: false,
  vite: {
    build: { sourcemap: true },
  },
  server: {
    baseURL: basePath,
    preset: "static",
    prerender: {
      routes: ["/"],
    },
  },
});
