import { Title } from "@solidjs/meta";
import styles from "./privacy.module.css";

export default function Privacy() {
  return (
    <div class="shell">
      <Title>Privacy — my.dw.com</Title>
      <div class={`section-block ${styles.privacy}`}>
        <h1 class="section-title">Privacy</h1>
        <p>
          <strong>my.dw.com</strong> is a personal news reader for Deutsche Welle
          content. It runs entirely in your browser.
        </p>

        <h2>What we store</h2>
        <p>
          All your preferences, liked articles, saved bookmarks, and reading
          history are stored exclusively in your browser's <code>localStorage</code>.
          Nothing is sent to any server we operate. There are no user accounts,
          no cookies, and no analytics.
        </p>

        <h2>Network requests</h2>
        <p>
          The app fetches article data from Deutsche Welle's public GraphQL API
          (via a lightweight CORS proxy) and recommendation data from the PEACH
          API. Embedded data visualizations (e.g. Datawrapper charts) load
          directly from their respective CDNs. These third-party services may
          log standard HTTP request metadata (IP address, user agent) according
          to their own privacy policies.
        </p>

        <h2>Clearing your data</h2>
        <p>
          Open your browser's developer tools, go to Application &rarr; Local
          Storage, and delete the <code>mydw_profile_v1</code> key. Or simply
          clear all site data for this origin.
        </p>

        <h2>Contact</h2>
        <p>
          This is an open-source project.{" "}
          <a
            class="canon-link"
            href="https://github.com/dumbnickname/my-dw-com"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
