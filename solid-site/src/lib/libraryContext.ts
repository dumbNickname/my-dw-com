/**
 * Library context — a tiny shared service that lets any component (the
 * feed action bar, the app footer, future routes) open the LibrarySheet
 * without prop-drilling through the router.
 *
 * The provider lives in `Shell` (app.tsx) which owns the sheet's open
 * state and renders the sheet itself. Consumers call `openLibrary()`.
 */
import { createContext, useContext } from "solid-js";

type LibraryContextValue = {
  open: () => void;
};

export const LibraryContext = createContext<LibraryContextValue>();

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    // Safe no-op fallback so non-Shell-wrapped tests / stories don't blow up.
    return { open: () => {} };
  }
  return ctx;
}
