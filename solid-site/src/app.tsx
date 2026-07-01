import { MetaProvider } from "@solidjs/meta";
import { Router, useLocation } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Show, Suspense, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";

import { LibrarySheet } from "./components/LibrarySheet";
import { LibraryContext } from "./lib/libraryContext";
import {
  libraryCount,
  load,
  save,
  toggleLike,
  toggleSave,
  type Profile,
} from "./lib/profile";
import { isSlowConnection, onConnectionChange } from "./lib/network";

import styles from "./app.module.css";
import "./styles/global.css";

const BASE_PATH = (import.meta.env.BASE_PATH || "").replace(/\/$/, "");

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("mydw_theme", next); } catch {}
}

function toggleLayout() {
  const current = document.documentElement.getAttribute("data-layout") || "vintage";
  const next = current === "vintage" ? "classic" : "vintage";
  document.documentElement.setAttribute("data-layout", next);
  try { localStorage.setItem("mydw_layout", next); } catch {}
}

/**
 * Inner shell — receives the active location so we can drop the top
 * chrome on screens where the reels card needs all the vertical space
 * (currently /feed). Brand wordmark stays on onboarding.
 *
 * Also owns the LibrarySheet: any consumer (the feed card's action bar,
 * the app footer below) opens it via the LibraryContext. Profile state
 * shown in the footer (count badge) is kept in sync via the
 * `mydw:profile-change` window event that `lib/profile.save` dispatches.
 */
function Shell(props: { children: JSX.Element }) {
  const location = useLocation();
  const isFeed = () => location.pathname.replace(/\/$/, "").endsWith("/feed");

  const [bump, setBump] = createSignal(0);
  const profile = createMemo<Profile>(() => {
    bump(); // tracked
    return load();
  });
  const count = createMemo(() => libraryCount(profile()));

  onMount(() => {
    const onChange = () => setBump((b) => b + 1);
    window.addEventListener("mydw:profile-change", onChange);
    onCleanup(() => window.removeEventListener("mydw:profile-change", onChange));
  });

  const [slowConn, setSlowConn] = createSignal(false);
  onMount(() => {
    setSlowConn(isSlowConnection());
    const off = onConnectionChange(() => setSlowConn(isSlowConnection()));
    onCleanup(off);
  });

  const [sheetOpen, setSheetOpen] = createSignal(false);

  const removeSaved = (id: string) => {
    save(
      toggleSave(profile(), id, {
        id, lang: "ENGLISH", title: "", kicker: null, image: null, namedUrl: null,
      }),
    );
  };
  const removeLiked = (id: string) => {
    save(
      toggleLike(profile(), id, {
        id, lang: "ENGLISH", title: "", kicker: null, image: null, namedUrl: null,
      }),
    );
  };

  return (
    <LibraryContext.Provider value={{ open: () => setSheetOpen(true) }}>
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
        <footer class={styles["app-footer"]} aria-label="App actions">
          <Show when={slowConn()}>
            <span
              class={styles["app-footer-saver"]}
              title="Slow connection detected — images and video are served at reduced quality to save data."
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
                <path d="M12 2 4 6v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              Data saver
            </span>
          </Show>
          <a href={BASE_PATH + "/privacy"} class={styles["app-footer-link"]}>Privacy</a>
          <button
            type="button"
            class={styles["app-footer-btn"]}
            onClick={toggleTheme}
            aria-label="Toggle light/dark theme"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
              <path d="M12 3a9 9 0 1 0 0 18 5 5 0 0 1 0-10 3 3 0 0 0 0-6V3z" />
            </svg>
            <span>Theme</span>
          </button>
          <button
            type="button"
            class={`${styles["app-footer-btn"]} ${styles["app-footer-btn-desktop"]}`}
            onClick={toggleLayout}
            aria-label="Toggle vintage/classic layout"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
              <rect x="2" y="4" width="20" height="13" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            <span>Vintage</span>
          </button>
          <button
            type="button"
            class={styles["app-footer-btn"]}
            data-has-items={count() > 0}
            onClick={() => setSheetOpen(true)}
            aria-label={`Open library (${count()} items)`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
              <path d="M4 5a2 2 0 0 1 2-2h10v18H6a2 2 0 0 1-2-2zM16 3h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2" />
            </svg>
            <span>Library</span>
            <Show when={count() > 0}>
              <span class={styles["app-footer-badge"]}>{count()}</span>
            </Show>
          </button>
        </footer>
      </div>

      <LibrarySheet
        open={sheetOpen()}
        saved={profile().saved}
        liked={profile().liked}
        onClose={() => setSheetOpen(false)}
        onRemoveSaved={removeSaved}
        onRemoveLiked={removeLiked}
      />
    </LibraryContext.Provider>
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
