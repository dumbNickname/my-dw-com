// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";

const basePath = process.env.BASE_PATH || "";

const themeInitScript = `(function () {
  try {
    var stored = localStorage.getItem("mydw_theme");
    var pref = stored || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", pref);
  } catch (e) {}
})();`;

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en" data-theme="light">
        <head>
          <meta charset="utf-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, viewport-fit=cover"
          />
          <meta name="theme-color" content="#002186" />
          <base href={basePath ? basePath + "/" : "/"} />
          <title>my.dw.com</title>
          <meta
            name="description"
            content="A personalised, no-login reader for Deutsche Welle. Tap through stories that match your interests."
          />
          <link rel="icon" href={`${basePath}/favicon.svg`} type="image/svg+xml" />
          <link rel="manifest" href={`${basePath}/manifest.json`} />
          <link rel="apple-touch-icon" href={`${basePath}/icon-192.svg`} />
          {/* eslint-disable-next-line solid/no-innerhtml */}
          <script innerHTML={themeInitScript} />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
