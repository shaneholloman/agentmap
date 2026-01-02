// @agentmap
// Format map object to YAML string.

import yaml from 'js-yaml'
import type { MapNode } from '../types.js'

/**
 * Convert map object to YAML string
 */
export function toYaml(map: MapNode): string {
  return yaml.dump(map, {
    indent: 2,
    lineWidth: -1,  // Don't wrap lines
    noRefs: true,   // Don't use YAML references
    sortKeys: true, // Consistent ordering
    quotingType: '"',
    forceQuotes: false,
  })
}
