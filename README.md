# agent-game-zero
Code Name: Zero. Game about agents to teach agents to humans.

## Running

```sh
npm install
npm run dev         # Sandbox — the live isometric world (http://localhost:5173)
npm run storybook   # Specimens — every primitive in isolation (http://localhost:6006)
```

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
