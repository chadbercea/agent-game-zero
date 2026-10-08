import type { Preview } from '@storybook/html-vite'
import { disposeSpecimenStage } from '../src/stage/specimen'

const preview: Preview = {
  // Each story mounts a live WebGL stage; tear it down when the story ends so
  // render loops never pile up (matters most for the headless test run).
  beforeEach: () => disposeSpecimenStage,
  parameters: {
    options: {
      // The narrative first, then the story (the demos), then the parts it's built from, then the primitives.
      storySort: { order: ['Story Narrative', 'Story', 'Story Parts', 'Primitives'] },
    },
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    }
  },
};

export default preview;