# Changelog

## 0.3.0

- Show only exported symbols when truncating files with many definitions
- Add `<agentmap-instructions>` section with guidance for maintaining file descriptions
- Safety checks now handled by agentmap library (non-git repos, home directory)
- Update to use agentmap 0.6.0

## 0.2.0

- Update to use agentmap 0.3.0 with new diff features
- Improved system prompt description

## 0.1.0

- Initial release
- OpenCode plugin that injects codebase map into system prompt
- Uses `experimental.chat.system.transform` hook to inject map wrapped in `<agentmap>` tags
