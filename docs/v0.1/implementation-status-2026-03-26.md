# OpenMAIC v0.1 Implementation Status Update 2026-03-26

## Scope

This supplement records the latest hardening work after the original
`implementation-status.md` baseline.

## Completed in This Round

- Added shared Zod schemas for:
  - `stateless chat`
  - `quiz grade`
  - `azure voices`
  - `pbl chat`
  - `proxy media`
  - `verify model`
  - `verify pdf provider`
- Updated the corresponding routes to return `INVALID_REQUEST` for malformed payloads instead of relying on ad-hoc field checks.
- Added `parseJsonRequestWithSchema()` so malformed JSON now fails as `INVALID_REQUEST` instead of falling through to `500` on the hardened routes.
- Added schema-backed read/write guards for:
  - `generationSession`
  - `generationParams`
- Normalized and propagated `scopeId` across:
  - homepage
  - preview
  - classroom resume
  - server generation
  - retrieval
  - export
- Added shared generation-context merge/count helpers to prevent empty arrays from masking persisted classroom context.
- Fixed `quiz-grade` request validation while preserving the existing grading fallback behavior.
- Added route-param schemas for `kb` and `memory` detail/file endpoints so invalid `id/fileId` values fail at the route boundary.

## Files Updated

- [lib/server/generation/contracts.ts](/d:/Workspace/OpenMAIC/lib/server/generation/contracts.ts)
- [app/api/chat/route.ts](/d:/Workspace/OpenMAIC/app/api/chat/route.ts)
- [app/api/quiz-grade/route.ts](/d:/Workspace/OpenMAIC/app/api/quiz-grade/route.ts)
- [app/api/azure-voices/route.ts](/d:/Workspace/OpenMAIC/app/api/azure-voices/route.ts)
- [app/api/pbl/chat/route.ts](/d:/Workspace/OpenMAIC/app/api/pbl/chat/route.ts)
- [app/api/proxy-media/route.ts](/d:/Workspace/OpenMAIC/app/api/proxy-media/route.ts)
- [app/api/verify-model/route.ts](/d:/Workspace/OpenMAIC/app/api/verify-model/route.ts)
- [app/api/verify-pdf-provider/route.ts](/d:/Workspace/OpenMAIC/app/api/verify-pdf-provider/route.ts)
- [lib/generation/session-storage.ts](/d:/Workspace/OpenMAIC/lib/generation/session-storage.ts)
- [lib/context/generation-context.ts](/d:/Workspace/OpenMAIC/lib/context/generation-context.ts)

## Remaining Routes Worth Reviewing

- Existing legacy prompt/docs files with encoding corruption still need a dedicated cleanup pass.
- Some route comments and non-runtime strings still contain historical mojibake and should be normalized when the affected files are next touched.

## Verification Status

- `git diff --check` should still be run before commit after the next batch of route changes.
- Project-level compile/typecheck/test has not been run because the workspace still lacks `node_modules`.
