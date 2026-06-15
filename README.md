# my.dw.com (PoC)

A personalised, no-login, reels-style reader for Deutsche Welle
content. SolidStart SPA on GitHub Pages. No backend, no auth, profile
in `localStorage`.

**Live**: <https://dumbnickname.github.io/my-dw-com/>

## Quick start

```bash
pnpm install
cd solid-site
pnpm run register-hashes   # one-off: registers GraphQL persisted queries
pnpm dev                   # http://localhost:3000/
pnpm build                 # outputs .output/public/ (static, GH Pages)
```

## Where to look next

- **[`AGENTS.md`](./AGENTS.md)** — durable orientation for any human or
  AI agent picking up the codebase: architecture invariants, code map,
  what's shipped, what's pending, conventions, references.
- **[`handoff/architecture-risks.md`](./handoff/architecture-risks.md)** —
  the two outstanding risks (`_pc_c` cookie, `webapi.dw.com` CORS) and
  how the Cloudflare Worker addresses the second.
- **[`handoff/api-contract.md`](./handoff/api-contract.md)** — canonical
  endpoint reference for PEACH + GraphQL.
- **[`handoff/future-work.md`](./handoff/future-work.md)** — everything
  deliberately deferred or discovered post-MVP, including the
  multi-language fan-out and pool-refresh bugs.
- **[`cloudflare-worker/README.md`](./cloudflare-worker/README.md)** —
  the 70-line CORS shim Worker.
