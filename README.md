# Square — web app

Square is a community platform where you meet people by **talking**, not swiping: anyone opens a gist room on a topic and people walk in, a post is the doorway into one, and a wink is how you tell somebody you found them interesting. This repository is the whole front end — feed, gist rooms, live streams, chat, profiles, the ARK Store and the KASH money surfaces.

| | |
| --- | --- |
| **Production** | <https://square.tsionark.com> |
| **Also served at** | <https://www.tsionark.com/square> — the same code, built a second time as a Next.js zone inside Ark |
| **Branches** | `main` is production, `staging` is the preview. CI runs on `main`, `staging` and `v2`. |

> [!NOTE]
> **Actively developed, and several finished capabilities are deliberately switched off.** Replays, VIP tiers, live gifts and store promotion are all built and dark behind a flag — [Capability flags](#capability-flags) says what each one is waiting on. Treat nothing in the interface as proof a capability is live, and nothing missing as proof it is unbuilt.

> [!IMPORTANT]
> **Hosting is configured outside this repo.** There is no `vercel.json` and no deploy workflow — `.github/workflows/ci.yml` is the only workflow, and it only runs the gates. Which branch deploys where is a dashboard setting, so verify a deploy by what is **served**, never by what is in the tree.

---

## How work gets done here

Non-trivial changes run as a loop of five roles, each doing its own pass rather than one person doing all five at once. It exists because the failures this app actually ships are not the ones a typechecker catches — they are an env var nobody wrote down, a capability switched on at one of three layers, a field zod silently stripped, a rule written in a comment and broken by the code beside it.

| Role | Owns |
| --- | --- |
| **Builder** | Implements the change |
| **Adversarial auditor** | Attacks the result — hunts the exploit, the false claim, the gap between what a doc promises and what the code does |
| **Fixer** | Fixes every finding, each with a regression test |
| **Design researcher** | Goes external, studies the best real interfaces, and raises this one to that standard |
| **Judge** | Grades the current state and says exactly what loses points |

This file went through that loop. The auditor's pass found sixteen false or misleading statements in the Builder's draft, and the ones that survived into print are marked where they cannot be enforced.

**[`CLAUDE.md`](CLAUDE.md) is the long-form version of everything the auditor has already found once.** It is not a summary of this file and it is not optional reading — it records *why* each rule exists, which is almost always because the opposite shipped.

---

## Quickstart

**No backend, no database, no Docker.** Leave `WSAPI_BASE_URL` unset and the BFF answers from an in-memory fixture backend, so a fresh clone runs on its own.

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Versions point at files rather than at numbers in this paragraph: Node from [`.nvmrc`](.nvmrc) (`nvm use`), pnpm from [`package.json`](package.json)'s `packageManager` field.

**Node's native TypeScript type stripping is load-bearing** — `pnpm test` runs `node --test` directly on `.ts` files with no build step and no test framework. It has been on by default since Node 22.18, so 22.18+ and 23.x will run the suite; `.nvmrc` and CI both pin **24**, which is the only version the gates are proven on.

### Who you are in fixture mode

With auth also unconfigured you are signed in as **`@demo`** (`u_me`) with no login step, so gated flows — composing, tickets, studio, settings — are reachable immediately.

### What fixture mode covers, exactly

This is the part of the setup most likely to waste your afternoon, so it is spelled out. `lib/fixtures/handler.ts` dispatches on the **first path segment**, and answers these faithfully, mutations included:

`activities` · `admin` · `analytics` · `categories` · `conversations` · `feed` · `me` · `mentions` · `operations` · `posts` · `profiles` · `reports` · `search` · `spotlight` · `store` · `stories` · `streams` · `topics` · `verification`

Posting, liking, following, buying a ticket, placing an order and going live all mutate that memory, so the demo stays coherent for the life of the dev server.

**Four newer surfaces are not covered, and only one of them fails in the way you would expect.** Each is wrong in its own way, which is exactly why the list is here:

| Surface | What actually happens locally |
| --- | --- |
| **Profile views** | A clean `404 NOT_FOUND — No fixture for GET /me/profile-views`. The client reads `NOT_FOUND` as "not deployed" and goes quiet. This is the only one that behaves as documented. |
| **Gist rooms** | **200 with the wrong data.** The street asks `GET /streams?status=live&kind=room`, and the fixture handler reads only `status` and `category` — **`kind` is ignored** (`lib/fixtures/handler.ts:1741`). So the gist-rooms street is served every live *video broadcast* in the seed, dressed as audio rooms. Do not trust that page locally. |
| **Houses directory** | `404 NOT_FOUND — "Conversation not found"`. It reads `GET /conversations/discover`, which falls into the `conversations/:id` branch and fails as a missing conversation. The section then renders **nothing at all** — deliberately, not an empty state (`features/messages/lib/discover-houses.ts:26`). |
| **Pals** | **200 with a populated clone of Home.** `pals` is a *lane of `/feed`*, not a resource, and `feedEntries` has no `case "pals"` — so it hits `default:` and returns the full for-you feed. Not a 404, not empty. |

**The seed carries no media, but an upload does.** Every seeded `mediaUrl` is `null` on purpose — fixtures answer routes, they do not invent content to flatter a screenshot (`CLAUDE.md`, *Conventions*). But posting a photo locally returns a generated SVG placeholder, and posting a video returns a public sample clip, so the grid and the immersive player do populate once you post. Live playback uses a public HLS test stream, and a fixture stream carries a non-null `replayUrl` — locally the replays **flag** is the only thing hiding replay surfaces, not an absent recording.

---

## When it breaks locally

Literal error text, so this section is findable with Cmd-F.

| What you see | Why | Fix |
| --- | --- | --- |
| `ChunkLoadError: Loading chunk … failed` / every stylesheet 404s | You ran `pnpm build` while `pnpm dev` or `pnpm start` was live. The build replaces `.next` under the running server. | Stop the server, `rm -rf .next`, rebuild, **then** start — in one step. Verify by fetching the served stylesheet, not just the page: the page returns 200 either way. |
| `TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"` | The Node running the tests has no type stripping — below 22.18, or it is switched off. | `nvm use` (reads `.nvmrc`). |
| A `NEXT_PUBLIC_*` change does nothing | Every `NEXT_PUBLIC_*` value is **inlined into the bundle at build time**. `next start` against an existing build serves the old value however often you restart it. | Change it, then **rebuild**. A restart is not enough. |
| A flag you set to `1`, `yes` or `TRUE` stays off | Each flag compares against one exact string. The `NEXT_PUBLIC_MS_*` booleans want `"true"`; `MIGRATION_SERVICE_ENABLED` wants `"1"`. (`NEXT_PUBLIC_MS_WS_GATEWAY_URL` is not a boolean — see below.) | Use the exact value. |
| `Error: NEXT_PUBLIC_SQUARE_BASE_PATH must be unset or "/square", got "…"` | There are exactly two valid builds, and `parseBase` refuses anything else at build time. | Unset it for standalone, or `/square` for the Ark zone. |
| Analytics events silently dropped, `[mx] NEXT_PUBLIC_MIXPANEL_TOKEN is not set in this runtime` | Despite the prefix, the token is read **on the server too**, by the `/api/mx` ingest route. | Set it in the server runtime as well as at build time. |
| A surface is empty and the network tab shows `404 NOT_FOUND` | Either fixture mode has no handler (see the table above), or the route is genuinely not deployed on the gateway you point at. | Both are handled on purpose — the client treats `NOT_FOUND` as "not deployed" and goes quiet rather than erroring. |
| `pnpm check:public-routes` fails or hangs | It fetches a live backend's `openapi.json`. | Give it one: `MS_API_BASE=https://… pnpm check:public-routes`. It is deliberately not part of `pnpm test`. |

---

## Repo map

| Path | What lives there |
| --- | --- |
| `app/` | Routes and the BFF route handlers. Owns no business logic **with one documented exception**: the mention search in `app/api/market-square/[...path]/route.ts` is answered by the BFF itself, because it rewrites `GET /mentions/search` onto `/search?type=people` and reshapes the result. `CLAUDE.md` tracks it as `BFF_HANDLED`. |
| `app/api/market-square/[...path]/` | The one proxy every Square request goes through — and the fixture backend's entry point. |
| `features/` | Sixteen vertical slices: `admin` `discovery` `feed` `gifts` `houses` `kash` `messages` `migrate` `notifications` `operations` `profile` `settings` `store` `streams` `tips` `trade`. |
| `components/layout/` | The shell, and where slices are composed through route slots. |
| `components/ui/`, `hooks/` | Shared presentation and behaviour. |
| `lib/` | Pure cross-cutting: api client, envelope, money arithmetic, deep links, formatters, fixtures — plus all 221 test files. **`lib/server/` is the exception and is not pure**: every file there carries `import "server-only"` and does network I/O, so importing one from a client component is a build error. |
| `docs/` | Governance, the PDR, the KASH payment rules, the specs. |

## Request path

```
component → hook (TanStack Query) → feature api client
          → /api/market-square/*  (BFF: verifies the session, forwards Authorization)
          → ${WSAPI_BASE_URL}/v1/market-square/*
```

**Seven more upstreams sit beside it**, each behind its own proxy under `app/api/` and its own client, none through `msApi`:

| Proxy | Upstream | Holds a secret |
| --- | --- | --- |
| `/api/kash/*` | The KASH engine | No — but it is the **only** thing enforcing wallet ownership; the engine has no auth of its own |
| `/api/dextopus/*` | The token routing provider, for `$TICKER` buys | Yes |
| `/api/alchemy-bundler/*` · `/api/evm-rpc/*` | Gas sponsorship (userOperations) and plain EVM reads — **split on purpose** | Yes |
| `/api/symbols` | The Ark app, for the tradeable `$TICKER` catalogue | No |
| `/api/avatar/*` | ArkPlay, for avatar characters | Yes, server-side only |
| `/api/mx` | Mixpanel ingest | The project token |
| `/api/migration/*` | The user-management service, for the account link window | No |

### The conventions, and whether anything enforces them

Stated honestly, because a rule with no mechanism is a wish — and a reader who believes one is enforced will waste a day working around something the codebase already does freely.

| Convention | Enforced by |
| --- | --- |
| Every upstream payload is validated with zod at the feature api boundary | Nothing automatic. **And `.strip()` is silent**: a field the schema does not declare is dropped with no warning, no test failure and no type error, which reads downstream as "the backend doesn't have it". Check the schema before concluding a field is missing. |
| Money is decimal strings or `bigint` base units, end to end — never `parseFloat` for arithmetic | Tests on `lib/erc20.ts` and `lib/kash-amount.ts`, pinned against known vectors |
| Every hand-written address goes through `lib/square-path.ts` (`sq()`, `asset()`, `api()`) | Partly: `lib/shell-invariants.test.ts` pins the wiring. A raw string still works in the standalone build and 404s in the Ark zone build. |
| Never prefix an upstream path — `msApi.get("/me")` is the service's path, not ours | `pnpm check:public-routes`, which also catches phantom routes the client calls that the spec does not document |
| Nothing calls the gateway directly | The BFF itself: it drops any header not on its allowlist and 401s every POST not in `lib/api/public-routes.ts`, so an optional-auth route stays unreachable anonymously until it is listed |
| A component never calls `fetch` or holds a base URL | **Nothing.** Three live same-origin violations exist (`components/ui/share-sheet.tsx`, `components/layout/friends-popup.tsx`, `features/profile/components/avatar-studio-screen.tsx`). |
| Slices never import each other; a surface needing two is composed in `components/layout/*-screen.tsx` | **Nothing — no ESLint boundary rule exists, and there are 55 cross-slice imports, 42 of them past the `index.ts` barrel.** 37 are `houses → streams`, which is structural rather than sloppy: a gist room *is* a stream. Treat the rule as the direction to move in, not as a description of the tree, and do not invent a route-slot composition for something twelve files already import directly. |
| Do not import from `wsws-frontend` (the sibling repo) | **Nothing.** This is the least inferable rule here, because the ported files are already in the tree: `lib/trade/sponsor.ts`, `lib/trade/sponsored-evm.ts`, `lib/trade/receipt.ts`, `lib/server/alchemy-bundler.ts` and `config/alchemy-bso-evm-networks.json` came from wsws **unchanged**. Copy forward deliberately; never add an import. |

---

## Configuration

Copy `.env.example` to `.env.local`. **`.env.example` is the complete list** — every variable the code reads, with the reasoning, and [`lib/env-example.test.ts`](lib/env-example.test.ts) fails the build if a new one is added without documenting it. The table below is only the handful that change what the app *is*.

| Variable | Read by | Evaluated | Unset means |
| --- | --- | --- | --- |
| `WSAPI_BASE_URL` | server | runtime | **Fixture mode.** The one variable that decides whether the app talks to a real gateway. |
| `NEXT_PUBLIC_SQUARE_BASE_PATH` | client | **build** | Standalone Square. `/square` produces the build Ark mounts; any other value fails the build. |
| `NEXT_PUBLIC_DECANE_APP_ID` | client | **build** | Demo auth — a signed-in demo session is assumed. Set it for real sign-in. |
| `DECANE_API_KEY` | server | runtime | No sign-in. **Server-only**; the browser fetches it from `/api/decane/key` at runtime. Never create a `NEXT_PUBLIC_` copy. |
| `KASH_API_URL` | server | runtime | Derived as `${WSAPI_BASE_URL}/v1/kash`. With neither set, KASH surfaces go quiet rather than erroring. |
| `ALCHEMY_API_KEY` | server | runtime | **No payment can be sent.** A comma-separated list walked in order; an embedded wallet holding only USDC has no ETH for gas. |
| `ALCHEMY_GAS_POLICY_ID` | server | runtime | Reads work, nothing is sponsored. **Index-aligned** with the key list — a mismatched pair is answered "Policy not found". |
| `NEXT_PUBLIC_MIXPANEL_TOKEN` | **client *and* server** | build **and** runtime | Analytics is a no-op, correct for a local checkout. The `/api/mx` ingest route reads the same value at runtime, so setting it at build time alone still drops every event. |
| `NEXT_PUBLIC_MIXPANEL_PROXY` | client | **build** | The browser calls `api.mixpanel.com` directly and most ad-blockers stop it — an uneven undercount, since people who block are not a random sample. |
| `MIGRATION_SERVICE_ENABLED` | server | runtime | `/api/migration/link` is off. Compares against `"1"` exactly, and the service is mounted at `/v1/user-management`. |

Two rules that cover every row:

1. **`NEXT_PUBLIC_*` is client-visible and inlined at build time.** Changing one needs a rebuild and a redeploy, not a restart. The prefix says *where it can be read*, not *where it is only read* — `NEXT_PUBLIC_MIXPANEL_TOKEN` above is read on both sides.
2. **A secret never gets a `NEXT_PUBLIC_` copy.** `DECANE_API_KEY`, `ALCHEMY_API_KEY`, `DEXTOPUS_TRADE_API_KEY`, `ZERODEV_PROJECT_ID`, `PRIVY_APP_SECRET` and ArkPlay's `apk_` key are server-only by design; `/api/decane/key` exists precisely so the browser can have a value the build never embeds. `lib/env-example.test.ts` asserts no `NEXT_PUBLIC_` copy of the first five.

## Capability flags

`lib/market-config.ts` holds one switch per capability, each defaulting **off**. They come in two kinds, and conflating them is how a reader "fixes" something that is already correct:

- **A capability flag leaves the surface visible and inert** — a real `disabled` control, announced and untabbable, never a dimmed thing that still fires. Deleting it loses the roadmap ("Replays — soon" tells a reader something true); leaving it live tells them a lie.
- **A promotion flag removes a navigation entry outright.** `visibleNav` in `components/layout/app-shell.tsx` *filters* flagged rows out of the sidebar and the dock. That is deliberate: the route behind it keeps working, so nothing is greyed out because nothing is disabled.

**The third state is the one this product keeps hitting: built on both sides, off, and blocked on something a different person owns.**

| Flag | Kind | Surface | Off because | What turns it on |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_MS_REPLAYS_ENABLED` | capability | Replays tab, replay player, ended-stream badges, ticket copy | Recording is fully implemented on the service and `replayUrl` is null in production | **Three switches, three owners:** LiveKit egress actually running (infrastructure — and it is Ark Stream's deployment, not ours), `LIVEKIT_S3_*` set on the service (backend), then this flag. Turn on one and both halves look correct while nothing appears. Confirm a real ended stream returns a non-null `replayUrl` first. |
| `NEXT_PUBLIC_MS_LIVE_GIFTS_ENABLED` | capability | Gift tray, KASH totals, all coin chrome | [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md) requires an approved utility definition **plus** a ledger transaction, receipt, reconciliation and support path — a multi-owner list, not one sign-off. Profiles must also carry a wallet, or every gift fails *after* the burst has played. | All of the above. Off shows the free tray: the on-stream moment with no money leg. |
| `NEXT_PUBLIC_MS_VIP_ACCESS_ENABLED` | capability | VIP ticket tiers | Entitlement timing, refund and replay rules unapproved | Written approval per `docs/GOVERNANCE.md`. It takes money, so the copy cannot promise it sooner. |
| `NEXT_PUBLIC_MS_STORE_NAV_ENABLED` | **promotion** | Sidebar entry, mobile dock, Explore tile | A promotion decision, not a capability | Just the flag. `/store` keeps working and Explore still lists items either way. |
| `NEXT_PUBLIC_MS_HOUSES_ENABLED` | **promotion** | **The nav entry only.** | Soft launch | Just the flag. **It does not gate creation**: Home's hallway and the live CTA both open a gist room with no flag check, and `/gist-rooms/[id]` always resolves — a link somebody was sent has to work. Do not assume rooms are dark because the flag is off. |
| `NEXT_PUBLIC_MS_SIDEBAR_ENABLED` | layout | Desktop sidebar instead of the bottom dock | Not a capability at all — the dock is the shipped design on every size | The flag, then a **rebuild**. Nothing is greyed out either way. |
| `NEXT_PUBLIC_MS_WS_GATEWAY_URL` | address | Realtime "lane head changed" signal | Absent means no socket is ever constructed; the 30s head check runs alone as the floor either way | The gateway origin — **the address is the switch**, so this one is not a `"true"` boolean despite the `NEXT_PUBLIC_MS_` prefix. |

**Three more capabilities in that file are hard-coded `false` with no env var**: `moneyLinkedGames`, `predictions` and `staking`. `docs/GOVERNANCE.md` lists all three as real governance gates, so turning one on is a source edit and a pull request, not a dashboard change. Setting `NEXT_PUBLIC_MS_PREDICTIONS_ENABLED` does nothing.

Which capabilities need whose approval is [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md), not this table. **A flag is a presentation control: the gateway must independently enforce every entitlement and economic rule.**

---

## Money

> [!CAUTION]
> Several surfaces move real value: buying KASH, buying a `$TICKER`, tips, gifts, tickets, store orders and verification. Before changing any of them, read **[`docs/PAYING_WITH_KASH.md`](docs/PAYING_WITH_KASH.md)** and the *Money that MOVES* section of `CLAUDE.md`.
>
> - **Who receives the money decides the mechanism.** Paying the *platform* goes through the KASH rail; paying a *person* is a transfer the user signs themselves — the backend cannot move one user's tokens to another.
> - **A rail debit burns the KASH.** In-app purchases are a supply sink, not revenue.
> - **A send is never retried by the transport.** Three default retries on a 429 charged one tap three times.
> - **A hash is not a payment.** A reverted transaction has a receipt and moves nothing; an unrecognised status is pending, never success.
> - **The buy button is never optimistic**, and it carries the reason it is disabled.
> - **The KASH engine has no auth of its own.** `/api/kash/*` is the entire ownership check: it proves the named wallet is the session's own embedded wallet, server-side. A wallet the browser named would make the gate decorative.
> - **Local and dev do not reproduce production.** `/tips/capability` differs by environment — production is client-signed and verified-authors-only — so never report tip behaviour from the dev stack.

---

## Tests and gates

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

**All four must be green before merging** — that is what [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs, on `main`, `staging`, `v2` and every pull request, cheapest first. The build there runs on placeholder env values: anything that genuinely needs a live service belongs behind a runtime read, never a build-time one.

| Command | What it does | When you need it |
| --- | --- | --- |
| `pnpm dev` | Dev server on :3000 | Always |
| `pnpm lint` | ESLint — Next's core-web-vitals and TS configs, no custom rules | Gate 1 |
| `pnpm typecheck` | `tsc --noEmit` | Gate 2 |
| `pnpm test` | `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test 'lib/**/*.test.ts'` — 221 files, 2,776 cases, no framework and no dependencies. Omit the flag when running it by hand and you get a warning, not a failure. | Gate 3 |
| `pnpm build` | Production build | Gate 4 |
| `pnpm start` | Serve the production build | Verifying a build |
| `pnpm check:public-routes` | Diffs `isPublicGet` against a live backend's `openapi.json` in **both** directions, and catches phantom routes | Whenever routes change. Needs a live backend, so it is not a gate |

Tests live beside the logic in `lib/`, and the pattern is deliberate: **the pure half of a behaviour is extracted so it can be tested without a browser**, and rules with no pure half are pinned by asserting against source text (`lib/shell-invariants.test.ts`). Two habits matter more than coverage — **test the invariant, not a sample**, because a product change can turn a correct assertion into a pinned lie; and **mutation-test every new guard**, because a guard that passes its own removal is insurance, not a mechanism.

## Deploying

Pull requests target `staging` first and reach `main` only after review.

To prove a deploy landed, check for a **string unique to that build in the served response** — not the build tag, not the commit, and never the local tree. A `NEXT_PUBLIC_*` change is baked into the bundle, so "the variable is set in the dashboard" says nothing until a build has run since.

## Where to go next

| Document | For |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | The working rules, surface by surface, with the incident behind each one. Read before writing code. |
| [`docs/PDR.md`](docs/PDR.md) | Product design reference. |
| [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md) | Which capabilities need whose approval. |
| [`docs/PAYING_WITH_KASH.md`](docs/PAYING_WITH_KASH.md) | Required reading before any feature that costs money. |
| [`docs/LIVE_STAGE_SPEC.md`](docs/LIVE_STAGE_SPEC.md) · [`docs/STUDIO_SPEC.md`](docs/STUDIO_SPEC.md) | The live room and the creator cockpit. |
| [`docs/DESIGN_DIRECTION.md`](docs/DESIGN_DIRECTION.md) | The visual language. |
| [`docs/PRD_IMPLEMENTATION_MATRIX.md`](docs/PRD_IMPLEMENTATION_MATRIX.md) | What the PRD asked for, against what exists. |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | Known and not yet done. |

This is a private repository. Report anything security-relevant to the maintainers directly rather than opening an issue.
