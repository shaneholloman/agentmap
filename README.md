**agentmap**

A compact, YAML-based inventory of your codebase, intended to be prepended to a coding agent's context at session start.

**Purpose**

- Give the agent a fast, structured overview of files and responsibilities
- Provide jump targets via top-level `defs` (functions/classes with line numbers)

**Example Output**

```yaml
my-project:
  src:
    cli.ts:
      description: CLI entrypoint for generating codebase maps.
    lib:
      parser.ts:
        description: Tree-sitter parser initialization and code parsing.
        defs:
          parseCode: line 32, function, exported
          resetParser: line 45, function, exported
      types.ts:
        description: Core type definitions for the codebase map.
        defs:
          FileResult: line 101, interface, exported
          GenerateOptions: line 111, interface, exported
```

The map contains:
- **File tree structure** - nested directories and files
- **Descriptions** - extracted from header comments/docstrings in each file
- **Definitions** - top-level functions, classes, interfaces, types with line numbers and export status

**Setup with AGENTS.md (Any Agent)**

Add instructions to your agent's instruction file (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, etc.):

```markdown
## Codebase Structure

At the start of each session, run `npx -y agentmap@latest` to see a structured overview of the codebase at this point in time, with file descriptions and definition locations.

When creating new files, add a brief description comment at the top explaining the file's purpose. This makes the file discoverable in the agentmap.

When making significant changes to a file's purpose or responsibilities, update its header comment to reflect the changes.

You can run agentmap again anytime to see the current state of the codebase as it evolves during the session.
```

This gives the agent a workflow for checking codebase structure at session start and keeping file descriptions up to date.

**OpenCode Plugin**

agentmap includes a plugin for [OpenCode](https://opencode.ai) that automatically injects the codebase map into the system prompt at session start.

Add the plugin to your `opencode.json`:

```json
{
  "plugin": ["@agentmap/opencode"]
}
```

The plugin will scan your project for files with header comments and inject the map into the system prompt wrapped in `<agentmap>` tags. This gives the AI agent immediate context about your codebase structure without needing to explore files first.

**Quick Setup**

The fastest way to get started is to let an AI agent add file descriptions for you:

```bash
opencode -p "$(npx -y agentmap prompt)"
```

This generates a prompt that instructs the agent to:
1. Analyze your repository structure
2. Identify the most important files (entry points, core modules, utilities)
3. Add descriptive comments at the top of each file
4. Mark entry points as such
5. Set up the `@agentmap/opencode` plugin in `opencode.json`

These comments make your files discoverable in the agentmap. The plugin automatically injects the map into future sessions.

**CLI Usage**

```bash
# Map current directory
npx agentmap

# Map specific directory
npx agentmap ./src

# Write to file
npx agentmap -o map.yaml

# Ignore patterns
npx agentmap --ignore "dist/**" --ignore "**/test/**"
```

**Options**

```
-o, --output <file>     Write output to file (default: stdout)
-i, --ignore <pattern>  Ignore pattern (can be repeated)
-d, --diff              Include git diff status for definitions
-h, --help              Show help
-v, --version           Show version
```

**Commands**

```bash
# Generate a prompt to help AI agents add file descriptions
npx agentmap prompt
```

**File Detection**

Files with a header comment or docstring are automatically included. agentmap detects standard comment styles used in existing projects - no special markers needed.

**TypeScript / JavaScript:**

```typescript
// CLI entrypoint.
// Parses args, wires deps, calls into lib/.

export function main() { ... }
```

```typescript
/**
 * Core data structures.
 * Used throughout the application.
 */
export class App { ... }
```

**Python:**

```python
"""
Parsing and normalization utilities.
Handles input validation and transformation.
"""

def parse_input(): ...
```

```python
# Configuration loader.
# Reads from environment and config files.

def load_config(): ...
```

**Rust:**

```rust
//! HTTP client module.
//! Provides async request handling.

pub fn fetch() { ... }
```

**Go:**

```go
// Package utils provides helper functions.
// Includes string manipulation and validation.

func Helper() { ... }
```

Descriptions are limited to the first 20 lines of the header comment.

**Supported Languages**

| Language   | Extensions                |
|------------|---------------------------|
| TypeScript | .ts .tsx .mts .cts        |
| JavaScript | .js .jsx .mjs .cjs        |
| Python     | .py .pyi                  |
| Rust       | .rs                       |
| Go         | .go                       |
| Zig        | .zig                      |
| C/C++      | .c .h .cpp .hpp .cc .cxx  |

**Library Usage**

```typescript
import { generateMap, generateMapYaml } from 'agentmap'

// Get as object
const map = await generateMap({ dir: './src' })

// Get as YAML string
const yaml = await generateMapYaml({ dir: './src' })

// With ignore patterns
const yaml = await generateMapYaml({
  dir: './src',
  ignore: ['**/test/**', '**/*.spec.ts']
})
```

**License**

MIT
