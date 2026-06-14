/**
 * Catch-all route — GitHub Pages serves 404.html for unknown paths and we
 * copy it to the static root so direct hits to deep links still mount the
 * SPA. The catch-all here renders a redirecting state and pushes the user
 * to /.
 *
 * In M2+ when we have deep links like /article/:id, this should attempt
 * to resolve the original path before falling back to /.
 */
import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";

export default function NotFound() {
  const navigate = useNavigate();
  onMount(() => {
    navigate("/", { replace: true });
  });
  return (
    <div class="shell">
      <Title>my.dw.com — redirecting</Title>
      <div class="notice">Redirecting…</div>
    </div>
  );
}
