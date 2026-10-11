# agent-game-zero
Code Name: Zero. A Three.js game about agents, made to teach humans how agents work.

**Live:** [sandbox](https://chadbercea.github.io/agent-game-zero/) · [Storybook](https://chadbercea.github.io/agent-game-zero/storybook/)

## The story

Pre-alpha: one approved demo, **Rovo on the Atlassian Grid** (`src/story/rovoAtlassian.ts`). The sandbox and Storybook's **Story Narrative** play the same scene. The reference is [`docs/rovo-mental-model.md`](docs/rovo-mental-model.md).

Rovo authenticates at its gate and works from Jira. The Teamwork Graph core (Jira, Confluence, Bitbucket) comes up around it. Seeded Jira tasks (code, docs, reads, Jira updates, Slack, specs from Figma) keep landing on Jira's board, and Rovo hands each one to a copy of itself. A copy runs its task's steps one node at a time and reports to Jira. Third-party tools come up through connectors when called and go when the issue is done. Slack sits behind the glass gateway, always busy. Code runs its own lane: worktree, terminal, check in, CI, squash merge into Bitbucket, then cubes, assembler, belt and portal. No captions. Hover anything to highlight it; click it for its details; click Rovo or a copy for the drone family tree.

## Running

```sh
npm install
npm run dev         # Sandbox: Rovo on the Atlassian Grid (http://localhost:5173)
npm run storybook   # Specimens: every primitive and story step in isolation (http://localhost:6006)
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + production build into dist/
```

### Sandbox controls

The panel in the top right has one control, **Seed**, which reloads the run with that seed (also `?seed=` in the URL). For debugging, `window.sandbox` exposes `stage`, `scene`, `inspector` and `family`.

## Tests

```sh
npx playwright install --with-deps chromium   # one-time: browser for the Storybook smoke tests
npm test                                       # everything, headless
npm run test:unit                              # just the logic tests (Node, no browser)
```

`npm test` runs two Vitest projects:

- **unit:** `src/**/*.test.ts` in Node, through injected fakes, so no WebGL is needed: animators, drone flight, scatter and shared runs, signal attachment, the access check and the Rovo task model. **browser:** `src/**/*.browser.test.ts` in headless Chromium (DOM, no rendering): the Rovo scene and its inspector.
- **storybook:** every Storybook story renders in headless Chromium as a smoke test. It uses software WebGL (SwiftShader), so it works without a GPU. Story files run one at a time because software rendering is CPU-bound.

`--with-deps` installs Chromium's system libraries and needs sudo. Without it, the browser can fail to launch with a missing `.so` such as `libnspr4.so`.

## Structure

Layering: **Primitive → Animation → Stage → Story.**

| Path | Role |
|---|---|
| `src/core/` | Palette, grid, shared textures and mesh helpers, seeded scatter, and shared runs (lines that bus together) |
| `src/primitives/` | Geometry, materials and rig hooks only, with no motion: Drone, Pad, Gate, SystemNode (with tool emblems), Job, Packet, Branch, Connection, SignalLink, GraphEdge, Conduit, Gateway (conduit + lock), Ticket, Product, Terminal, Assembler, Conveyor, Portal |
| `src/animation/` | Animators that drive primitive rigs from state: status motion, gate lights, drone flight and routes, packet flight, signal links, connection reveal |
| `src/stage/` | The isometric `Stage` (camera, light, Runtime/Detail rendering), spawning drones, attaching signals, and the hover/click `Inspector` |
| `src/story/` | The Rovo scene (`rovoAtlassian`) and its parts: systems (`rovoSystems`, `systemLayout`), Jira (`jiraHub`, `jiraBoard`), tasks (`rovoTasks`), code lane (`rovoCode`, `shipOutput`), Slack (`rovoSlack`), inspection (`rovoInspect`, `familyTree`), and shared steps (`accessCheck`, `beam`, `timeline`) |
| `src/sandbox/` | Sandbox app: the Rovo scene, inspector, family tree and seed control |
| `*.stories.ts` | Storybook specimens, next to what they show |

## Deploys

Every push to `main` builds the sandbox and Storybook and publishes them to GitHub Pages (`.github/workflows/pages.yml`). A last job then checks the live site (`scripts/verify-live.mjs`): the published `version.json` names the pushed commit, and the sandbox and both Story Narrative stories load and run with no console errors. Run it by hand with `node scripts/verify-live.mjs [site url] [sha]`.

## Work tracking

Work is tracked in the Linear project [Agent Game Zero](https://linear.app/iliketobuild/project/agent-game-zero-463b920ee9fa) (team ILI). Each epic is a milestone in that project. Changes land as one pull request each, merged when clean; commits carry the issue key when there is one.
