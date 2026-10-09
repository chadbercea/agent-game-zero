# Rovo mental model

The reference for the **Rovo on the Atlassian Grid** story (`src/story/rovoAtlassian.ts`). Everything here comes from Chad (2026-10-09). If a visual isn't covered here, ask; don't invent one.

## Who

- **Rovo is the only real agent.** It authenticates at its gate (the gate locks behind it) and works from **Jira**, the quarterback and system of record.
- **Sub-agents are copies of Rovo,** each set up by a Jira task (skills, access, instructions). They spawn out of Rovo once and **stay on**: Rovo hands a copy a ticket, it does the task, shoots the finished ticket back to Rovo (the parent, already talking two-way with Jira; never to the base), and waits where it is for its next ticket. They go home into Rovo only when the work stops.

## Tasks

- **One copy, one task, one loop.** A copy runs its task's steps one at a time. Example (spec): read Confluence → read Figma (MCP) → update Confluence → update the terminal back to the user.
- **Types:** code, write a doc, read a doc, update Jira, send a Slack message, write a spec from Figma. Seeded RNG, **biased toward less complex but varied** (`src/story/rovoTasks.ts`).
- **Parallel.** For example, 3 copies in mini systems (the 3–4-node areas a copy works through) plus 3 copies coding in separate worktrees, all from the same Jira.

## Systems

- **Teamwork Graph** is Atlassian's data layer of links between work, under Rovo. Its core, **Jira, Confluence and Bitbucket**, is prominent and persistent: it comes up as Rovo gets into Jira, each on a plate, a size up. Other TWG apps (Code search) are **permanent** once called.
- **Bitbucket is the repo** in this story: all the code activity is around it.
- **Third-party tools** (GitHub, GitLab, Google Docs, Notion, Figma, ...) **spawn on call** through connectors and **despawn when the Jira issue is done**.
- **Slack** is a standalone, secure, always-busy comms hub behind the glass gateway.

## Code

Linear, like real life: the Jira issue calls for code → Rovo spawns a code copy → generate code → check in → CI/CD runs and passes → auto-merge (squash) → auto-deploy. Merging the PR deletes the branch, and the SCM keeps the final state (`RepoTrunk`). The copy marks its task done in Jira and despawns.

- **SCMs** (GitHub, Bitbucket, GitLab) share the branch emblem and job; the job ends in a squash merge.
- **Output:** the SCM fires small, fast cubes into the assembler, and bigger cubes ride a short, fast belt into the portal.
- **Terminal:** flat on the grid, with lines plugging into its back. States: admin, live tail logs, code gen (a diff view, also used for code review).

## Rules on screen

1. An agent only works while hovering over a real node.
2. Every line connects two real things, runs on the grid (never diagonal), and draws in.
3. **The line draws first, then the node appears at its end.** Going away, the node folds first, then its line draws back.
4. Things come in progressively, as the story reaches them.
