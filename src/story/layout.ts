import { Vector3 } from 'three';

/**
 * Where everything sits on the one isometric grid for the two-act story.
 * Act 1's gate leads to Notion, Figma and GitHub; the Atlassian gate sits to
 * the right on screen (along the screen-right diagonal) with its four tools,
 * far enough that the two maps never overlap. Every position is on the grid.
 */
export const ACT1_GATE = new Vector3(2, 0, 2);
export const ATLASSIAN_GATE = new Vector3(8, 0, -4);
export const HOME = new Vector3(-1.8, 0, 5);
/** Screen-space middle of both maps, for framing the whole story. */
export const STORY_CENTER = new Vector3(5, 0, -1);
/** Each map keeps clear of the other gate and of D3V1N's home. */
export const ACT1_MAP = { avoid: [ATLASSIAN_GATE, HOME] } as const;
export const ATLASSIAN_MAP = { avoid: [ACT1_GATE, HOME] } as const;
