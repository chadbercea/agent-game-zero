# agent-game-zero
Code Name: Zero. A Three.js game about agents, made to teach humans how agents work.

**Live:** [sandbox](https://chadbercea.github.io/agent-game-zero/) · [Storybook](https://chadbercea.github.io/agent-game-zero/storybook/)

## The story

The sandbox plays the reworked story on one isometric grid with two systems: D3V1N's gate and its own third-party tools (Figma, GitHub, Notion), and the Atlassian gate with Rovo's Teamwork Graph (Jira, Confluence, Bitbucket, Code search). Each system is laid out by the grid building guide, but nothing is on the grid until an agent calls it: a gate pops up when its agent calls it, and each tool comes up on its own (its trace draws out over the faint grid, it rises, the line fades) when someone heads there, so the grid grows as the work reaches it. It reads without captions.

1. **Opening:** a low-poly cloud drifts over and drops a Jira ticket, *DEMO-1 · Add dark mode*, in front of D3V1N's home. D3V1N floats in from off the grid.
2. **Own system:** D3V1N takes the ticket, calls its gate, and checks access (yellow while checking, then green; red if the gate is off). It calls GitHub, which comes up alone, and one sub-agent rides the trace there and starts a branch.
3. **The bridge:** Rovo arrives on its own, calls its gate, gets access, and calls Jira. A Rovo sub-agent builds the secure bridge between the two systems, a glass tunnel with a lock, and dissolves back into Rovo. The graph's lines draw in among the tools on the grid, through the tunnel's ends, and data streams through it: the super tunnel. From then on, every tool called up gets its graph lines too. Power comes through to D3V1N and it charges up.
4. **Juiced crew:** D3V1N's first sub-agent keeps building at GitHub at twice the pace. D3V1N calls Bitbucket up, and two more ride the graph through the tunnel to it, and the gateway flashes green as each one passes. Their commits keep landing in GitHub.
5. **Output:** an output line draws from GitHub to an assembler behind D3V1N's system. Every commit sends a little block down it, and eight fuse into a bigger block, which rides a conveyor belt through a portal.
6. **Full system:** D3V1N's crew spreads across both systems, calling up Notion, Figma, Code search and Confluence one at a time (its own tools along its traces, Rovo's through the tunnel), Rovo's helpers come and go on its tools, and the camera pulls back. Crew size, placement and timing come from a seeded generator.

Every drone comes and goes through one roster (`src/story/roster.ts`), so they spawn and despawn in one defined sequence: the same order at the same story times every loop, for a given seed (`new StoryV2(stage, seed)`). D3V1N's crew goes out one after another, and Rovo's helpers start once the crew is out. Drones fade out rather than pop. On reset, everyone still out leaves newest first, and D3V1N leaves last. `story.roster.log` holds the run's sequence.

From beat 2 on, the human in the loop: clouds drift by at seeded random times, each dropping an issue into Jira, Confluence or Notion, whichever are online.

A work ledger simulates today's volume across the grid: every tool keeps busy with everyone else's work, and whoever is working in the scene finishes pieces at their own pace. **Hover anything** for its volume of work:
- a tool, agent or sub-agent shows its own counts (done, in progress, queued), what's under way (DEMO-1 among the rest), its share of the whole, and who it works with
- a gate shows its whole system, tool by tool

The grand total sits in the top-left corner.

The earlier two-act story (Act 1 isolated, denied at review, Act 2 connected) still lives in Storybook under **Teamwork Story**.

## Running

```sh
npm install
npm run dev         # Sandbox: the story (http://localhost:5173)
npm run storybook   # Specimens: every primitive and story step in isolation (http://localhost:6006)
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + production build into dist/
```

### Sandbox controls

The panel in the top right:

| Control | What it does |
|---|---|
| Run story | Plays the story from the start |
| Gate works | Turn it off to watch a gate deny access (the story stops there) |
| Auto-run | Replays the story on a loop |
| Full system runs for | Seconds the full system keeps running before an auto-run clears it |
| Pause between runs | Seconds between auto-runs |
| Reset | Sends everyone home and clears the stage |

Hover over anything for its hover card. Hovering a gate or node also shows its system's lines, and clicking pins them. For debugging, `window.sandbox` exposes `stage`, `scene`, `story`, `run`, `reset` and `settings`.

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
| `src/primitives/` | Geometry, materials and rig hooks only, with no motion. Drone, Pad, Gate, SystemNode (with tool emblems), Job, Packet, Branch (grid-routed access traces), Connection, SignalLink (the drone ↔ base conversation), GraphEdge, Conduit (glass tunnels with dash streams), Gateway (conduit + lock), Ticket (a request), Product (each system's work product, by shape), Cloud (where requests come from), PhoneCall, Charge (an agent powered up), Assembler, Conveyor, Portal (the output line) |
| `src/animation/` | Animators that drive primitive rigs from state: status motion, gate lights, drone flight and routes, arrivals, packet flight, signal links, connection reveal |
| `src/stage/` | The isometric `Stage` (camera, light, Runtime/Detail rendering) plus spawning agents and drones, sending packets, attaching signals, and `Population` lineage trees (used in specimens) |
| `src/story/` | The story as chained steps on the stage clock. Volume of work (`ledger`, `volume`, `trickle`, `review`, `trail`, `hoverCards`), the request (`request`), Act 1 (`accessCheck`, `revealMap`, `fanOut`, `returnHome`, `runJob`), Act 2 (`act2`, `roles`, `TeamworkGraph`, `systemLayout`, `beam`), the reworked beats (`cloudDrop`, `opening`, `humanLoop`, `crew`, `shipOutput`, `fullSystem`), and the whole thing (`twoActs` builds the scene, `storyV2` plays it; `teamworkStory` is the earlier two-act version) |
| `src/sandbox/` | Sandbox app: the stage, the totals, and the control panel |
| `*.stories.ts` | Storybook specimens, next to what they show |

## Deploys

Every push to `main` builds the sandbox and Storybook and publishes them to GitHub Pages (`.github/workflows/pages.yml`).

## Work tracking

Work is tracked in the Linear project [Agent Game Zero](https://linear.app/iliketobuild/project/agent-game-zero-463b920ee9fa) (team ILI). Each epic is a milestone in that project. Every change starts with an issue and gets its own branch named after the issue key. Commits carry the key (`ILI-123: …`), and each issue ends in a pull request.
