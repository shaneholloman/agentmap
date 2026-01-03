# Changelog

## 0.4.2

- Improve `prompt` command for monorepos: detect workspaces/packages and use Task tool for concurrent processing
- Update existing file comments instead of skipping them
- Add note about re-running prompt to keep descriptions up to date
- Update README with better OpenCode integration example using `-p` flag

## 0.4.1

- Simplify definition output to show only start line instead of line range

## 0.4.0

- Add `prompt` command to generate AI instructions for adding file descriptions
- Prompt instructs agent to analyze repo, add header comments to important files, and set up OpenCode plugin

## 0.3.0

- Add `--diff` flag to show git diff status for definitions
- Show line ranges (e.g., `line 10-25`) instead of just start line
- File-level diff stats (`+N-M`) using reliable `--numstat` parsing
- Definition-level status: `added (+N)` or `updated (+N-M)`
- Defensive git options for cross-platform reliability
- Handle edge cases: binary files, paths with spaces, Windows paths
- Graceful error handling - diff failures don't crash the system
- Decrease minimum body lines from 7 to 5

## 0.2.0

- Moved to bun workspace monorepo structure
- OpenCode plugin moved to separate package `@agentmap/opencode`

## 0.1.2

- Initial public release
- CLI tool to generate YAML maps of codebases
- Support for TypeScript, JavaScript, Python, Rust, and Go
- Tree-sitter based parsing for accurate definition extraction
- `@agentmap` marker system for selective file inclusion
