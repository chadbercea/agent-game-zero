import type { Meta, StoryObj } from '@storybook/html-vite';
import { rowPosition, specimenStage } from '../../stage/specimen';
import { SYSTEM_KINDS } from './emblems';
import { SystemNode } from './SystemNode';

const meta: Meta = {
  title: 'Primitives/System Node',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/**
 * Every system's emblem: the Act 1 tools (Figma, GitHub, Notion) and the
 * Atlassian tools behind the second gate (Code search, Confluence, Jira,
 * Bitbucket). Monochrome; told apart by shape.
 */
export const Emblems: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 4.2, focusY: 0.6 });
    SYSTEM_KINDS.forEach((kind, i) => {
      const { x, z } = rowPosition(i, SYSTEM_KINDS.length, 1.9);
      const node = new SystemNode({ kind });
      node.position.set(x, 0, z);
      stage.add(node);
    });
    return root;
  },
};
