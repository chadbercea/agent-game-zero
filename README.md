# agent-game-zero
Code Name: Zero. Game about agents to teach agents to humans.

## Running

```sh
npm install
npm run dev         # Sandbox — the live isometric world (http://localhost:5173)
npm run storybook   # Specimens — every primitive in isolation (http://localhost:6006)
```

## Tests

```sh
npx playwright install --with-deps chromium   # one-time: browser for the Storybook smoke tests
npm test                                       # everything, headless
npm run test:unit                              # just the logic tests (Node, no browser)
```

`npm test` runs two Vitest projects:

- **unit:** `src/**/*.test.ts` in Node. Covers `Population` (lineage trees, color assignment, packet routing, despawn, Detail membership) through injected fakes, so no WebGL is needed.
- **storybook:** every Storybook story renders in headless Chromium as a smoke test. It uses software WebGL (SwiftShader), so it works without a GPU. Story files run one at a time because software rendering is CPU-bound.

`--with-deps` installs Chromium's system libraries and needs sudo. Without it, the browser can fail to launch with a missing `.so` such as `libnspr4.so`.

## Structure

MVP Alpha layering: **Primitive → State → Animation → Scene composition.**

| Path | Role |
|---|---|
| `src/core/` | Palette (status + lineage colors), shared textures and mesh helpers |
| `src/primitives/` | Drone, Task, Packet, Connection — geometry, materials and rig hooks only; no motion |
| `src/animation/` | Animators that drive primitive rigs from state (status motion, packet flight, connection reveal) |
| `src/stage/` | The isometric `Stage` (camera, light, Runtime/Detail rendering) and compositions: agent units, packets, `Population` lineage trees |
| `src/sandbox/` | Sandbox app |
| `*.stories.ts` | Storybook specimens, next to what they show |
