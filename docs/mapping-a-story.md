# Mapping a story

How to turn a real workflow (shipping a feature, an incident, an onboarding) into a Rovo story on the grid, using only the parts that already exist. The rules of the world are in [`rovo-mental-model.md`](rovo-mental-model.md); this guide is how to apply them. The worked examples are **Rovo ships a feature** (`src/story/rovoFeature.ts`, a fixed plot), **Rovo on Call** (`src/story/rovoOnCall.ts`, an incident rolled from the seed) and **Rovo Dev** (`src/story/rovoDev.ts`, a developer's day rolled from the seed by `rollDevDay`).

## 1. Write the beats

Start from the real workflow, not the parts. List its stages in order, as a person doing the work would name them. For example, an SRE incident: detect, declare, triage, mitigate, verify, resolve, learn, follow up.

For each beat, write down:

- **What happens**, in the workflow's own terms.
- **Where it happens on the grid**: which system, which copy, which line.
- **Which parts show it** (section 2).
- **What it leaves behind** for the next beat: a card on the board, a write-back, a release.

A story has a beginning and an end. Give it a final state worth looking at (e.g. the feature story ends with everyone home, Jira dark and two releases shipped).

## 2. Map each beat to parts

Every beat must be shown with these. If a beat needs something not on this list, it's a **new piece**: see step 3.

| Need | Part | Where |
|---|---|---|
| Rovo arrives and gets into Jira | `enter()`: gate, access check, lock, Jira, Confluence and Bitbucket come up | `RovoAtlassian` |
| Work arrives | `hub.addTask()`: a card slides into To do | `JiraHub` |
| A copy is created | `emerge()`: born inside Rovo, full size | `RovoAtlassian` |
| Rovo hands a copy its task, and it runs it | `handOver(copy, task, lane, { key, title })` | `RovoAtlassian` |
| A copy goes home | `home(copy, delay)` | `RovoAtlassian` |
| Rovo hands a copy a card (a custom task) | `hub.takeTask(copy, rovo, { key, title })` | `JiraHub` |
| An incident | `hub.addTask(true)`: a red card; `{ incident: true }` on its request | `JiraHub`, `Ticket` |
| A copy does a task | `runTask(sub, task, card, lane, from)`: runs every step, reports, shoots the card to Rovo | `RovoAtlassian` |
| Read / write / update a system | a `Step`: `{ system, action: 'read' \| 'write' \| 'update' }` | `rovoTasks.ts` |
| Read a design through MCP | a `Step` with `mcp: true` on `figma` | `mcpRead()` |
| Send a message | a `Step` `{ system: 'slack', action: 'send' }`; Slack comes up the first time | `SlackHub` |
| Write code and ship it | a code `Task` with a lane index 0–2: worktree, diff, check-in, CI, squash merge, deploy cubes | `code()`, `CodeLane`, `shipOutput` |
| Tell the user | `reportToUser: true` on a task | `userTerminal()` |
| A third-party tool | `systems.call(kind)` brings it up; `systems.release(kind)` lets it go | `SystemsOnGrid` |
| A system that hangs off another | `via` in the story options (Datadog into PagerDuty into JSM, like Code search off Bitbucket); add the pair to `TEAMWORK_LINKS` so the layout places them and routes their line | `SystemsOnGrid`, `systemLayout.ts` |
| Production | `production: true` in the story options lays it out (glass tunnel, production server, services); `Production`: `comeUp()`, `health()`, `deliver()`, `addReplica()`, `flagOff()`, `trace()`, `logsTerminal()` | `production.ts` |
| Releases straight from the assembler, no belt or portal | `buildOutput(stage, code, onShipped, handOff)` | `rovoCode.ts` |
| A release built only when needed | `buildOutputLine()` (a story can send it on, e.g. into production) | `RovoAtlassian` |
| CI fails once, then passes | `flakyCI = true` before a code task | `RovoAtlassian` |
| Issues arriving from the team | `cloudDrop(stage, cloud, ticket, target, { escorts })` with `Cloud` (five seeded shapes) and `groupOffsets`; then `hub.addTask()` | `cloudDrop.ts`, `Cloud` |
| Review a change before CI | override `reviewed(coder, lane)` (Rovo Dev reads the diff at `lane.terminal`) | `RovoAtlassian`, `rovoDev.ts` |
| Wait for something | `wait`, `tween`, `fly`, `until` on the stage clock | `timeline.ts` |
| Know a release shipped | `scene.shipped` | `RovoAtlassian` |

A task is plain data, so a scripted story writes its own:

```ts
const SPEC: Task = {
  type: 'spec',
  reportToUser: true,
  steps: [
    { system: 'confluence', action: 'read' },
    { system: 'figma', action: 'read', mcp: true },
    { system: 'confluence', action: 'update' },
  ],
};
```

Primitives with a Storybook specimen each (`src/primitives/`): Cloud, Drone, Gate and Padlock, SystemNode (emblems for every system, including JSM, Compass, Statuspage, Datadog, Grafana and the production services; `permanent` for the tall housing with Gearworks; `name` for one of several of a kind), Pad, Terminal (`pass()`, `fail()`), Ticket, Product, Job and RepoTrunk, Branch, GraphEdge, SignalLink, Connection, Conduit and Gateway, Packet, Assembler, Conveyor, Portal, Flag.

## 3. Check every part against the rules

Go through the mental model's **Rules on screen** for each beat:

- Does every working copy hover over a real node?
- Does every line run on the grid between two real things?
- Does the line draw before its node?
- Is only the next thing needed being built?
- Does color only mean status or lineage?

**New pieces need Chad's OK before you build them.** Write a proposal that marks each new piece clearly and says why the story needs it. The *Rovo on Call* proposal did this as a page with the beat map, the dice and an "existing vs new" list; Chad approved all five new pieces (production past the portal, service nodes, the JSM, Compass and Statuspage emblems, the red incident card, rollback motion). Build only after the answer.

## 4. Decide what the seed varies

A story must look different from seed to seed. Two kinds of variation:

- **The map**: comes free from `storyMap` (gate corner, code side direction, Slack's side, terminal, mini systems). Pass only the mini systems your story uses.
- **The plot**: your own dice, from the seed. Bias toward simple but varied. Write the outcomes and weights down, in the code's doc comment. A small plot can roll from the scene's `this.random`; a bigger one is best as a pure function of the seed that a unit test can check, like `rollIncident(seed)` in `incident.ts` (what broke, how bad, the crew, the fix, the detours).

Never use `Math.random` in a story; the same seed must give the same run.

## 5. Build it

Extend the base scene and write a new `start()`. The base keeps the map, Jira, systems, Slack, the code side and the copy machinery. A story only writes its script.

```ts
export class RovoIncident extends RovoAtlassian {
  constructor(stage: SceneHost, seed = 5) {
    super(stage, seed, { mini: ['confluence'] }); // only what this story uses
  }

  beat: 'arriving' | 'triage' | 'done' = 'arriving';
  finished = false;

  override async start(): Promise<void> {
    this.running = true;
    await this.enter();
    // ... beats, each setting this.beat ...
    this.finished = true;
  }
}
```

- Expose `beat` and `finished` so tests and the Storybook beat control can follow the story.
- Add a `*.stories.ts` under **Story Narrative**, with `seed` and `beat` controls. Frame the camera on the map with `stage.frame(scene.map.center, scene.map.viewSize)`. Wire the `Inspector` (`rovoInspectables`) and the `FamilyTree` like `RovoFeature.stories.ts`.
- Add the story to the doc comment at the top of `rovo-mental-model.md`.

## 6. Test it

A browser test runs the whole story on a fake stage, with no rendering, in well under a second. See `rovoFeature.browser.test.ts`, and `rovoOnCall.browser.test.ts` for running one seed per outcome of the dice:

- The beats happen in order and the story finishes.
- Each beat left what it should: tasks done, releases shipped, write-backs, messages, user reports.
- Third-party tools went when done, and copies went home.

For map logic, add pure tests next to `storyMap.test.ts`.

## 7. Look at it

Tests prove logic, not looks. Before merging, render it headless and read the screenshots. A throwaway browser test does it; delete it afterward:

```ts
// src/story/zzLook.browser.test.ts (delete after)
import { it } from 'vitest';
import { page } from 'vitest/browser';
import { Feature } from './RovoFeature.stories';

it('look', async () => {
  await page.viewport(1280, 720);
  const root = (Feature as { render: (a: object, c: object) => HTMLElement }).render({ seed: 8, beat: 'done' }, {});
  root.style.height = '720px';
  document.body.append(root);
  await new Promise((r) => setTimeout(r, 8000));
  await page.screenshot({ element: root, path: 'zzlook/done.png' }); // saved next to the test: src/story/zzlook/done.png
}, 120000);
```

Run it with `npx vitest run --project browser src/story/zzLook.browser.test.ts`, then read the PNGs. Look at several seeds and the key beats. Software rendering is slow, so keep the shot list short. Delete the test and its folder before committing.

## Pitfalls we've hit

- **`group.add(x)` returns the group, not `x`.** `group.add(mesh).position.y = 1` moves the group. Use `at(mesh, y)` from `src/core/mesh.ts`.
- **`RoundedBoxGeometry`'s radius must be under half the smallest side**, or the box breaks.
- **`ExtrudeGeometry`'s bevel grows the outline** by `bevelSize`. Pull it back with `bevelOffset: -bevelSize` when size matters (meshing gears).
- **Don't fake depth or "inside" with stencil or depth-test tricks.** Build the real geometry (the gear housing has real openings). Tricks force compromises like flat shapes and extra colors.
- **Story time is not real time.** Use the stage clock (`timeline.ts`) for story motion. UI feedback (hover easing) uses real time, so it doesn't speed up with the story.
- **Two agents in one checkout overwrite each other.** Use a git worktree (see `AGENTS.md`).
