// @agentmap
// OpenCode plugin that injects codebase map into system prompt.

import type { Plugin } from '@opencode-ai/plugin'
import { generateMap, toYaml } from 'agentmap'

const MAX_LINES = 1000

/**
 * Convert __more_N__ markers to YAML comments
 */
function markersToComments(yaml: string): string {
  // Match lines like: __more_25__: 25 more definitions/exports
  // Replace with: # ... 25 more definitions/exports
  return yaml.replace(
    /^(\s*)__more_(\d+)__: (\d+ more (?:definitions|exports))$/gm,
    '$1# ... $3'
  )
}

/**
 * Truncate YAML to max lines, adding a comment if truncated
 */
function truncateLines(yaml: string): string {
  const lines = yaml.split('\n')
  if (lines.length <= MAX_LINES) return yaml

  const truncated = lines.slice(0, MAX_LINES)
  truncated.push('# ... truncated')
  return truncated.join('\n')
}

export const AgentMapPlugin: Plugin = async ({ directory }) => {
  let cachedYaml: string | undefined
  let lastSessionID: string | undefined

  return {
    'chat.message': async ({ sessionID }) => {
      if (sessionID !== lastSessionID) {
        lastSessionID = sessionID
        cachedYaml = undefined
      }
    },

    'experimental.chat.system.transform': async (_input, output) => {
      try {
        // Skip if already has agentmap tag
        if (output.system.some((s) => s.includes('<agentmap>'))) return

        if (!cachedYaml) {
          // Library applies truncation by default (maxDefs: 25)
          const map = await generateMap({ dir: directory, diff: true })

          // Check if map is empty
          const rootKey = Object.keys(map)[0]
          const rootValue = map[rootKey]
          if (!rootValue || Object.keys(rootValue).length === 0) {
            cachedYaml = ''
          } else {
            let yaml = toYaml(map)
            yaml = markersToComments(yaml)
            yaml = truncateLines(yaml)
            cachedYaml = yaml
          }
        }

        if (!cachedYaml.trim()) return

        output.system.push(`

<agentmap>
Tree of the most important files in the repo, showing descriptions and definitions:

${cachedYaml}
</agentmap>

<agentmap-instructions>
When creating new files, add a brief description comment at the top explaining the file's purpose. This makes the file discoverable in the agentmap.

When making significant changes to a file's purpose or responsibilities, update its header comment to reflect the changes.

These descriptions appear in the agentmap XML at the start of every agent session.
</agentmap-instructions>`)
      } catch (err) {
        console.error('[agentmap] Failed to generate map:', err)
      }
    },
  }
}
