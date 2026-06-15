import { MetaProvider } from "@solidjs/meta";
import { Router, useLocation } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Show, Suspense, type JSX } from "solid-js";

import styles from "./app.module.css";
import "./styles/global.css";

const BASE_PATH = (import.meta.env.BASE_PATH || "").replace(/\/$/, "");

/**
 * Inner shell — receives the active location so we can drop the top
 * chrome on screens where the reels card needs all the vertical space
 * (currently /feed). Brand wordmark stays on onboarding.
 */
function Shell(props: { children: JSX.Element }) {
  const location = useLocation();
  const isFeed = () => location.pathname.replace(/\/$/, "").endsWith("/feed");

  return (
    <div class={styles["app-shell"]} data-route={isFeed() ? "feed" : "default"}>
      <Show when={!isFeed()}>
        <header class={styles["app-header"]}>
          <a href={BASE_PATH + "/"} class={styles.brand} aria-label="my.dw.com home">
            my<span class={styles["brand-dot"]}>.</span>dw<span class={styles["brand-dot"]}>.</span>com
          </a>
        </header>
      </Show>
      <main class={styles["app-main"]}>
        <Suspense>{props.children}</Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Router
      base={BASE_PATH}
      root={(props) => (
        <MetaProvider>
          <Shell>{props.children}</Shell>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
