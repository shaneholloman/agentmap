// @agentmap
// OpenCode plugin that injects codebase map into system prompt.

import type { Plugin } from '@opencode-ai/plugin'
import { generateMapYaml } from '../index.js'

export const AgentMapPlugin: Plugin = async ({ directory }) => {
  return {
    'experimental.chat.system.transform': async (_input, output) => {
      const yaml = await generateMapYaml({ dir: directory })
      if (!yaml.trim()) return

      output.system.push(`<agentmap>
These are some of the files in the repo with their descriptions and definition locations:

${yaml}
</agentmap>`)
    },
  }
}
