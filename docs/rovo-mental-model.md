# Rovo mental model

The rules of the Rovo world, for every story: **Rovo on the Atlassian Grid** (`src/story/rovoAtlassian.ts`, work flowing without end), **Rovo ships a feature** (`src/story/rovoFeature.ts`, one request followed from the ask to production) and **Rovo on Call** (`src/story/rovoOnCall.ts`, an incident from page to postmortem). Everything here comes from Chad (from 2026-10-09). **If a visual isn't covered here, ask Chad; don't invent one.** To build a story from these rules, see [`mapping-a-story.md`](mapping-a-story.md).

## Who

- **Rovo is the only real agent.** It authenticates at its gate (the gate locks behind it) and works from **Jira**, the quarterback and system of record.
- **Sub-agents are copies of Rovo,** each set up by a Jira task (skills, access, instructions). They emerge out of Rovo and **stay on**: Rovo hands a copy a ticket, it does the task, shoots the finished ticket back to **Rovo** (the parent, already talking two-way with Jira; never to Jira directly), and waits where it is, yellow, for its next ticket. They fly home into Rovo only when the work stops.

## Tasks

- **One copy, one task, one loop.** A copy runs its task's steps one at a time. Example (spec): read Confluence → read Figma (MCP) → update Confluence → update the terminal back to the user.
- **Types** (`src/story/rovoTasks.ts`): code, write a doc, read a doc, update Jira, send a Slack message, write a spec from Figma.
  - Confluence carries most docs and reads. Notion is rare.
  - Figma comes up often, and about half its reads go **through MCP**: the copy builds a terminal (the MCP client) beside Figma, the design rides back along its line, then the copy collapses it.
  - Seeded RNG, **biased toward less complex but varied**.
- **Parallel.** For example, copies working the mini systems (the systems round Jira a copy works through) while others code in separate worktrees, all from the same Jira.

## Systems

- **Teamwork Graph** is Atlassian's data layer of links between work, under Rovo. Its core, **Jira, Confluence and Bitbucket**, is permanent: it comes up as Rovo gets into Jira and stays.
  - Permanent systems **stand taller**: a soft, low-poly housing with windows on the camera-facing sides, where solid one-gray gears turn while the system works and run down when it stops. Permanence is shape, never color.
  - **Code search** hangs off Bitbucket (it indexes the repositories): it comes up beside Bitbucket, its line into Bitbucket, and stays once called.
- **Bitbucket is the repo:** all the code activity is around it.
- **Third-party tools** (GitHub, GitLab, Google Docs, Notion, Figma, ...) **spawn on call** through a connector and **despawn when their Jira issue is done**. Work written to a tool stays there (write-back).
- **Incident apps** (Rovo on Call): **Jira Service Management** (JSM, the service desk) and **Compass** (the service catalog, which shows the blast radius) are on the Teamwork Graph and stay once up. **Statuspage** comes up on call (Atlassian, so no connector) for SEV1–2 and folds when the incident is resolved.
- **Monitoring tools** (Datadog, Grafana) are third-party: one comes up beside JSM when it raises an alert, its line straight into JSM, and goes when the incident is resolved.
- **Slack** is a standalone, secure, always-busy comms hub behind the glass gateway. It catches comms and sends comms.
- **The user's terminal** is where copies report back to the human.

## Code

Linear, like real life: the Jira issue calls for code → a coding copy → generate code → check in → CI/CD runs and passes → squash-merge → deploy. Merging deletes the branch; the repo keeps the final state (`RepoTrunk`, one commit per merge). The copy shoots its ticket to Rovo and waits for its next one.

- **SCMs** (GitHub, Bitbucket, GitLab) share the branch emblem and job; the job ends in a squash merge.
- **Output:** each merge sends small, fast cubes down the output line into the assembler. Every 2 × 2 × 2 set fuses into a release, which rides a short, fast belt through the portal.
- **Terminal:** flat on the grid, lines plugging into its back. States: admin, live tail logs (pass turns it green), code gen (a diff view, also used for code review).
- **Production** is past the portal (Rovo on Call): a web front, the APIs behind it and the data behind those, each a node whose light is its health, joined by gray lines from caller to callee. A release that goes through the portal rides out along those lines to its service. Fixes happen at a service: replicas grow in beside it (line first), or its feature flag lowers.
- **Coding lanes** (worktree → terminal → repo) go to Bitbucket first and spawn out from there (ILI-1004). They fold back up when the work is done.

## Visual vocabulary

What things mean on screen. Use these; don't add meanings.

| Thing | Means |
|---|---|
| Green / yellow / red light | Working / waiting / stopped (status). Used on nodes, drones, terminals. |
| Cyan | Rovo's lineage (Rovo and its copies). |
| Blue dotted line (Graph line) | A link in the Teamwork Graph: Jira to a system, a system to the system it hangs off. |
| Gray line | Rovo's access line, a coding lane, the output line. |
| Packet riding a line | Status or a product going home to Jira (the tool's product shape when it carries one). |
| Ticket card | A Jira issue, carried by the copy working it; it glows green when shot back to Rovo. |
| Red card | An open incident (status: stopped). It turns white when it's resolved and goes to Done. |
| A service's light | Its health: green healthy, yellow degraded (it depends on something down), red down, off out of service. |
| Replica beside a service | More of that service: a failover standby, or extra capacity for a spike. |
| Flag on a service | A feature flag: raised is on, lowered is off. |
| Red flash on a terminal | CI failed; it's retried. |
| Tall housing with gear windows | A permanent (Teamwork Graph) system. Gears turn while it works. |
| Small plug on a node | A third-party connector into the Teamwork Graph. |
| Glass gateway with a lock | A secure crossing (Slack). |
| Cubes, assembler, belt, portal | Code merged, released and shipped to production. The release rides on past the portal to its service when production is on the map. |

## Rules on screen

1. An agent only works while hovering over a real node.
2. Every line connects two real things, runs on the grid (never diagonal), and draws in.
3. **The line draws first, then the node appears at its end.** Going away, the node folds first, then its line draws back.
4. **The system reacts to the agents:** things come up because a copy arrived or work reached them, progressively, as the story gets there.
5. **Only draw and spawn the next thing needed, never the whole chain** (ILI-1004). The output line comes with the first cubes, the assembler when cubes arrive, the belt and portal only when a release needs them.
6. **The seed drives the whole map** (`src/story/storyMap.ts`): the gate's corner off Jira, which side the code side grows out on, Slack's side, the user's terminal, the mini systems. Each story lays out only the systems it uses, and the camera frames the map it gets.
7. **No captions.** The scene explains itself. Hover highlights, click shows a details card, and clicking Rovo or a copy shows the drone family tree.

## Status

- ILI-1004 (rule 5, and lanes spawning out of Bitbucket) is agreed but **not built yet**: today the code side still builds its lanes from the copy's spot and the whole output chain on the first code task. Rovo on Call follows it where it can: the output line, assembler and belt only come up when a fix ships a release, into the portal production already opened.
- Rovo on Call's dice say 1–3 replicas for a spike; it grows as many as fit beside the service (two at most beside a middle API).
