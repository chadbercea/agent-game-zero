import { Vector3 } from 'three';

/**
 * Where everything sits on the one isometric grid for the two-act story.
 * Act 1's gate leads to Notion, Figma and GitHub; the Atlassian gate sits to
 * the right on screen (along the screen-right diagonal) with its four tools,
 * far enough that the two maps never overlap. Every position is on the grid.
 */
export const ACT1_GATE = new Vector3(2, 0, 2);
export const ATLASSIAN_GATE = new Vector3(12, 0, -8);
export const HOME = new Vector3(-1.8, 0, 5);
/** Atlassian map: four tools, a little tighter across than Act 1's three. */
export const ATLASSIAN_MAP = { depth: 6, spread: 2.5 } as const;
/** Screen-space middle of both maps, for framing the whole story. */
export const STORY_CENTER = new Vector3(4.5, 0, -6.5);
