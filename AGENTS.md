# Agent guide: Agent Game Zero

A Three.js game about agents, made to teach people how agents work. The stories show **Rovo** (Atlassian's agent) working the **Atlassian grid**: Jira, the Teamwork Graph, copies of Rovo, code shipping to production. Chad (the owner) directs the work.

Read this whole file before changing anything. Then read:

1. [`docs/rovo-mental-model.md`](docs/rovo-mental-model.md): **the rules of the world.** Who does what, what each thing means, what may appear on screen.
2. [`docs/mapping-a-story.md`](docs/mapping-a-story.md): **how to map and build a story** from the existing parts (the Lego box), step by step.
3. [`README.md`](README.md): running, testing, structure, deploys.

## Hard rules

These are Chad's. Breaking one has cost us rework before.

1. **Don't invent visuals.** Every piece on screen must be in the mental model or approved by Chad. A story that needs a new piece proposes it first (marked as new) and waits for an OK.
2. **Build exactly what was described**, with real geometry and the scene's own lighting. No added colors or flourishes, and no rendering tricks that fake it.
3. **Only Rovo is a real agent.** Every other drone is a copy of Rovo, doing one Jira task.
4. **A line draws first, then the node at its end.** Going away, the node folds first, then the line draws back.
5. **Only draw and spawn the next thing needed, never the whole chain ahead of it** (ILI-1004).
6. **Every line runs on the grid** (never diagonal) between two real things. **Every working agent hovers over a real node.**
7. **The seed drives the whole map** (`src/story/storyMap.ts`). Same seed, same run; different seeds, clearly different maps.
8. **Color means status or lineage, nothing else.** Green is working, yellow is waiting, red is stopped; cyan is Rovo's lineage. Permanence and identity are shown by shape (taller body, emblem), never by color.

## How work gets done

- **Direction comes from Chad**, in the session or as a Linear issue (project *Agent Game Zero*, team ILI). If Chad names an issue, read it and its comments first. If a rule doesn't cover something, ask Chad rather than guessing.
- **One change, one branch, one PR.** Branch from up-to-date `main` (`chadbercea/ili-NNNN-short-name` when there's an issue). Put the issue key in commits. When typecheck, tests and build are clean and the PR is mergeable, merge it yourself (`gh pr merge --merge --delete-branch`) and move on.
- **Prove it before you merge:**
  - `npm run typecheck`, `npm test` and `npm run build` must be clean, with no warnings.
  - For anything visual, look at it: render the story or specimen headless and screenshot it (see *Checking visuals* in `docs/mapping-a-story.md`). Tests prove logic, not looks.
- **Deploys are automatic:** every push to `main` publishes the sandbox and Storybook to GitHub Pages and checks the live site (`scripts/verify-live.mjs`).
- **Report facts.** Cite code (`path:line`), tests and screenshots. Say what you didn't check.

## Working alongside other agents

Several agents may work on this repo at once. **Use your own git worktree** (`git worktree add ../agent-game-zero-<topic> -b <branch> origin/main`), not the shared checkout. Switching branches in a folder another agent is using can overwrite its uncommitted work. Before committing, check `git status` and `git log` for changes you didn't make.

## Map of the code

Layering: **Primitive → Animation → Stage → Story.**

- **`src/primitives/`:** geometry and materials only, no motion. Cloud, Drone, Pad, Gate, SystemNode and emblems, Gearworks (gear windows), Terminal, Ticket, Product, Job, Branch, GraphEdge, Gateway, Assembler, Conveyor, Portal, Flag, and more. Each has a `*.stories.ts` specimen.
- **`src/animation/`:** animators that move primitives (drone flight, gates, signals).
- **`src/stage/`:** the isometric `Stage`, which owns the camera (`frame`, `centerOn`), the clock (`onTick`, `onRendered`, `skip`) and Detail view. Also `spawnDrone`, `attachSignal` and the hover/click `Inspector`.
- **`src/story/`:** the Rovo stories and their parts. Start at `rovoAtlassian.ts` (the base scene), then `rovoFeature.ts` (a scripted story built on it), `rovoOnCall.ts` (a story whose plot is rolled from the seed, with production past the portal) and `rovoDev.ts` (a developer's day as jobs to be done, issues brought in by clouds).
- **`src/uiTests/`:** Storybook *UI Tests* section, for design explorations (e.g. permanent-system variants).
- **`docs/`:** the mental model and the mapping guide.
