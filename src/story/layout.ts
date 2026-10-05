import { Vector3 } from 'three';

/**
 * Where everything sits on the one isometric grid for the two-act story.
 * Act 1's gate leads to Notion, Figma and GitHub; the Atlassian gate sits to
 * the right on screen (along the screen-right diagonal) with its four tools,
 * far enough that the two maps never overlap. Every position is on the grid.
 */
export const ACT1_GATE = new Vector3(2, 0, 2);
export const ATLASSIAN_GATE = new Vector3(10, 0, -6);
export const HOME = new Vector3(-1.8, 0, 5);
/** Screen-space middle of both maps, for framing the whole story. */
export const STORY_CENTER = new Vector3(4.5, 0, -4.5);
/**
 * Each map's traces leave its gate heading toward the other gate, with its
 * nodes on that side: both clusters sit in the middle, close together, so the
 * graph's links between them stay short, and the two maps never cross.
 */
export const ACT1_MAP = { bus: 'z' } as const;
export const ATLASSIAN_MAP = { bus: 'x' } as const;
