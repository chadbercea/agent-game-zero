# agent-game-zero
Code Name: Zero. A Three.js game about agents, made to teach humans how agents work.

**Live:** [sandbox](https://chadbercea.github.io/agent-game-zero/) · [Storybook](https://chadbercea.github.io/agent-game-zero/storybook/)

## The story

The sandbox plays one story in two acts on a single isometric grid. It follows one request, *DEMO-1 · Add dark mode*, through a system that's busy with hundreds of others. Small tickets trickle into every open system the whole time, each riding its gate line out to a node, and DEMO-1 is just one of them: it drops in front of D3V1N to start Act 1, and the same request lands in front of Rovo to start Act 2.

- **Act 1 — isolated work.** D3V1N, the parent agent, takes the request and checks access at a gate (yellow while checking, green on success, red on denial). Once it's in, D3V1N maps the system's tool nodes (Figma, GitHub, Notion) and spawns three sub-agents. Each one works its own job, cut off from the others.
- **Before Rovo arrives — denied.** DEMO-1 goes to review with only what Act 1's isolated agents could make: design, branch and PRD, with empty slots where the spec and the issue link should be. Review denies it for missing context, while Act 1's own single-system work keeps passing.
- **Act 2 — the Teamwork Graph.** Rovo picks up the same request to work on the Atlassian side, gets through its own gate, and spawns its own crew. A security bot then builds a secure gateway between the two systems. The Teamwork Graph draws in, linking every system on the grid. Every cross-system link goes through the gateway: agents ride their links through it and hover over the node they're visiting. Every request the agents finish passes a small review gate beside D3V1N's gate (yellow, then green; ordinary single-system work always passes). DEMO-1 comes back through it with every part filled in, is confirmed as one change among everything done on the grid that day, and everyone heads home carrying their work.

A caption at the bottom of the screen names each step as it plays.

A work ledger simulates today's volume across the grid: every node keeps busy with everyone else's work, and whoever is working in the scene finishes pieces at their own pace. Every request the ledger takes in at a node is a ticket you can see trickling in. **Hover anything** for its volume of work:
- a node, agent or sub-agent shows its own counts (done, in progress, queued), what's under way (DEMO-1 among the rest), its share of the whole, and who it works with
- a gate shows its whole system, node by node; the review gate shows what it reviewed today and its latest verdicts
- items carry their review verdict (Confirmed / Denied) wherever they're listed

The grand total sits in the top-left corner.

## Running

```sh
npm install
npm run dev         # Sandbox: the two-act story (http://localhost:5173)
npm run storybook   # Specimens: every primitive and story step in isolation (http://localhost:6006)
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + production build into dist/
```

### Sandbox controls

The panel in the top right:

| Control | What it does |
|---|---|
| Run story | Plays the story from the start |
| Retry access | After a denial, tries the same gate again; on green, the story carries on |
| Gate works | Turn it off to watch a gate deny access |
| Auto-run | Replays the story on a loop |
| Pause between runs | Seconds between auto-runs |
| Reset | Sends everyone home and clears the stage |

Hover over anything for its hover card. Hovering a gate or node also shows its system's lines, and clicking pins them. For debugging, `window.sandbox` exposes `stage`, `scene`, `story`, `run`, `retry`, `reset` and `settings`.

## Tests

```sh
npx playwright install --with-deps chromium   # one-time: browser for the Storybook smoke tests
npm test                                       # everything, headless
npm run test:unit                              # just the logic tests (Node, no browser)
```

`npm test` runs two Vitest projects:

- **unit:** `src/**/*.test.ts` in Node, through injected fakes, so no WebGL is needed. Covers the drone, arrival and signal-link animators; drone flight; grid scatter and shared runs; branches, conduits and graph edges; `Population` and signal attachment; and the story's access check, return home, sub-agent roles and system layout.
- **storybook:** every Storybook story renders in headless Chromium as a smoke test. It uses software WebGL (SwiftShader), so it works without a GPU. Story files run one at a time because software rendering is CPU-bound.

`--with-deps` installs Chromium's system libraries and needs sudo. Without it, the browser can fail to launch with a missing `.so` such as `libnspr4.so`.

## Structure

Layering: **Primitive → Animation → Stage → Story.**

| Path | Role |
|---|---|
| `src/core/` | Palette, grid, shared textures and mesh helpers, seeded scatter, and shared runs (lines that bus together) |
| `src/primitives/` | Geometry, materials and rig hooks only, with no motion. Drone, Pad, Gate, SystemNode (with tool emblems), Job, Packet, Branch (grid-routed access traces), Connection, SignalLink (the drone ↔ base conversation), GraphEdge, Conduit (glass tunnels with dash streams), Gateway (conduit + lock), Ticket (a request), Product (each system's work product, by shape) |
| `src/animation/` | Animators that drive primitive rigs from state: status motion, gate lights, drone flight and routes, arrivals, packet flight, signal links, connection reveal |
| `src/stage/` | The isometric `Stage` (camera, light, Runtime/Detail rendering) plus spawning agents and drones, sending packets, attaching signals, and `Population` lineage trees (used in specimens) |
| `src/story/` | The story as chained steps on the stage clock. Volume of work (`ledger`, `volume`, `trickle`, `review`, `hoverCards`), the request (`request`), Act 1 (`accessCheck`, `revealMap`, `fanOut`, `returnHome`, `runJob`), Act 2 (`act2`, `roles`, `TeamworkGraph`, `systemLayout`, `beam`), and the whole thing (`twoActs` builds the scene, `teamworkStory` plays it with captions) |
| `src/sandbox/` | Sandbox app: the stage, the caption, and the control panel |
| `*.stories.ts` | Storybook specimens, next to what they show |

## Deploys

Every push to `main` builds the sandbox and Storybook and publishes them to GitHub Pages (`.github/workflows/pages.yml`).

## Work tracking

Work is tracked in the Linear project [Agent Game Zero](https://linear.app/iliketobuild/project/agent-game-zero-463b920ee9fa) (team ILI). Each epic is a milestone in that project. Every change starts with an issue and gets its own branch named after the issue key. Commits carry the key (`ILI-123: …`), and each issue ends in a pull request.
