---
id: yandex-cases2win-project-base
title: Yandex And Cases2win Project Base
type: ProjectBase
status: Ready
path: vault/outputs/project-bases/yandex-cases2win-base.md
summary: Routing base for Yandex MCP docs, Yandex tools MCP package docs, and the Cases2win Yandex Direct API app spec.
updatedAt: 2026-07-02
tags:
  - project-bases
  - yandex
  - mcp
  - cases2win
  - direct
---
# Yandex And Cases2win Project Base

## Current State

The handover package includes Yandex MCP documentation, Yandex tools package documentation, and a Cases2win Yandex Direct API app spec. The sweep checked yandex-mcp and yandex-tools-mcp as recent clean repos with useful changes pushed.

## Source Documents In Handover ZIP

- `yandex/yandex_mcp/README.md`
- `yandex/yandex_mcp/README.ru.md`
- `yandex/yandex_mcp/docs/plans/2026-02-24-refactor-dry-readme-design.md`
- `yandex/yandex_mcp/docs/plans/2026-02-24-refactor-dry-readme-plan.md`
- `yandex/yandex_tools_mcp/README.md`
- `yandex/yandex_tools_mcp/CHANGELOG.md`
- `yandex/yandex_tools_mcp/packages/yandex-search-mcp/README.md`
- `yandex/yandex_tools_mcp/packages/yandex-metrika-mcp/README.md`
- `yandex/yandex_tools_mcp/packages/yandex-webmaster-mcp/README.md`
- `yandex/yandex_tools_mcp/packages/yandex-wordstat-mcp/README.md`
- `cases2win/yandex-direct-api-app-spec-2026-06-23.txt`

## Next Entry Points

- Verify the current Yandex account and organization context before using console or API workflows.
- Treat Cases2win app material as a spec, not as evidence that production access is configured.
- Keep API tokens and OAuth material outside the vault and outside remote-safe Work DB records.

## Safety Notes

- Account binding and plugin runtime files were not included.
- Any Yandex Direct state should be rechecked live before campaign or app changes.
