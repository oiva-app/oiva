# Task 0012: Knowledge check and sync

**Branch**: `feature/knowledge-check-sync`
**Depends on**: 0008
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 11

## What to build

`oiva knowledge check` and `oiva knowledge sync` — the commands that validate the local knowledge base and mirror it to the Terraform-managed S3 application bucket.

`oiva knowledge check`:

- Validates that `knowledge-base/` exists and contains `ARCHITECTURE.md`
- Enumerates supported files (markdown, text)
- Rejects unsafe paths (symlinks, absolute paths, traversal), oversized files
- Reports bucket availability from Terraform output
- Does not mutate anything

`oiva knowledge sync`:

- Builds a stable inventory comparing local files to remote S3 objects
- Categorises as additions, updates, unchanged, and deletions
- Requires confirmation when remote deletions will occur
- Binds execution to the reviewed inventory via a stable fingerprint so stale approval cannot delete changed targets
- Mirrors exactly: uploads additions/updates, deletes remote-only files
- Can only target the Terraform application-bucket output — never the state bucket

## Implementation work

- [ ] Create `oiva_cli/aws/` S3 knowledge service module: list objects, upload, delete, compare inventories
- [ ] Implement local file enumeration with safety checks (no symlinks, no traversal, size limits)
- [ ] Require `knowledge-base/ARCHITECTURE.md` existence
- [ ] Implement `oiva knowledge check` command: validate local files, report bucket availability, no mutation
- [ ] Implement stable inventory: local file list with hashes vs remote S3 object list with ETags
- [ ] Implement `oiva knowledge sync` command: build inventory → display additions/updates/deletions → confirm if deletions → execute → verify mirror
- [ ] Implement inventory fingerprint for stale-approval prevention
- [ ] Implement state-bucket refusal: sync target must be the application bucket, never the state bucket
- [ ] Write tests: S3 Stubber, filesystem fakes, inventory-staleness test, state-bucket-refusal test, exact-mirror verification, symlink/oversized-file rejection

## Acceptance criteria

- [ ] `oiva knowledge check` validates `knowledge-base/` exists, requires `ARCHITECTURE.md`, enumerates files, rejects unsafe paths/symlinks/oversized files
- [ ] `oiva knowledge check` reports bucket availability from Terraform output
- [ ] `oiva knowledge sync` shows a stable inventory of additions, updates, unchanged, and deletions
- [ ] `oiva knowledge sync` requires confirmation when remote deletions will occur
- [ ] A stale inventory fingerprint rejects execution after inventory changes
- [ ] `oiva knowledge sync` makes S3 an exact mirror of local after confirmation
- [ ] `oiva knowledge sync` never targets the state bucket
- [ ] Tests pass for file validation, inventory, staleness, mirror, and state-bucket refusal
