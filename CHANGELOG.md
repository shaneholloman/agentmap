# Changelog

## 0.2.0

- Added OpenCode plugin (`agentmap/opencode`) that injects codebase map into system prompt
- Plugin uses `experimental.chat.system.transform` hook to inject map wrapped in `<agentmap>` tags

## 0.1.2

- Initial public release
- CLI tool to generate YAML maps of codebases
- Support for TypeScript, JavaScript, Python, Rust, and Go
- Tree-sitter based parsing for accurate definition extraction
- `@agentmap` marker system for selective file inclusion
