import { MetaProvider } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";

import "./styles/global.css";

const BASE_PATH = (import.meta.env.BASE_PATH || "").replace(/\/$/, "");

export default function App() {
  return (
    <Router
      base={BASE_PATH}
      root={(props) => (
        <MetaProvider>
          <div class="app-shell">
            <header class="app-header">
              <a href={BASE_PATH + "/"} class="brand" aria-label="my.dw.com home">
                my<span class="brand-dot">.</span>dw<span class="brand-dot">.</span>com
              </a>
            </header>
            <main class="app-main">
              <Suspense>{props.children}</Suspense>
            </main>
          </div>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
