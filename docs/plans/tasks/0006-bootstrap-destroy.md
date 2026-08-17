# Task 0006: Bootstrap destroy

**Branch**: `feature/bootstrap-destroy`
**Depends on**: 0005
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 17

## What to build

`oiva bootstrap destroy` — the guarded, account/region-scoped teardown of all bootstrap resources (S3 state bucket and ECR repository). This is separate from deployment destroy and removes shared resources that may serve multiple deployments.

The command requires explicit `--account-id` and `--region` arguments and compares the authenticated STS account with the supplied account ID.

Before confirmation, the CLI inventories everything that will be removed:

- All deployment state objects and their version history
- Terraform S3 lock objects (`.tflock`)
- All images and tags in the `oiva-agent` ECR repository
- The ECR repository itself
- The remote-state bucket

It refuses teardown when any state still contains Terraform-managed resources or any state lock is active. Empty state left after a successful deployment destroy may be removed.

Confirmation requires typing `destroy bootstrap <account> <region>` and is bound to a stable inventory fingerprint passed from the destroy-plan step to execution so changed resources cannot be deleted under stale approval. No `--force` bypass exists.

After confirmation: delete all versioned S3 objects and ECR images, delete the ECR repository and state bucket, then verify both are gone.

## Implementation work

- [ ] Implement inventory collection: list all state objects and versions, lock objects, ECR images and tags, repository, bucket
- [ ] Implement state-content check: refuse if any state object contains managed resources (parse state JSON for resources); allow empty state
- [ ] Implement lock check: refuse if any `.tflock` object is active
- [ ] Implement stable inventory fingerprint (hash of the full inventory) for stale-approval prevention
- [ ] Implement typed confirmation `destroy bootstrap <account> <region>` bound to fingerprint
- [ ] Implement deletion: versioned S3 object deletion (all versions), ECR image batch deletion, ECR repo deletion, bucket deletion
- [ ] Implement post-delete verification: confirm bucket and repository are gone
- [ ] Implement `--account-id` and `--region` required arguments with STS account comparison
- [ ] Write tests: Stubbers for inventory/refusal-locks/refusal-managed-resources/empty-state-allowed/fingerprint-staleness/deletion-verification

## Acceptance criteria

- [ ] `oiva bootstrap destroy` requires `--account-id` and `--region` and compares with STS account
- [ ] The command inventories all state objects, versions, locks, ECR images, repository, and bucket before confirmation
- [ ] The command refuses teardown when any state contains managed resources
- [ ] The command refuses teardown when any state lock is active
- [ ] Empty state (after successful deployment destroy) is allowed for removal
- [ ] Typed confirmation `destroy bootstrap <account> <region>` is required and bound to a stable fingerprint
- [ ] A stale fingerprint (changed inventory) rejects execution
- [ ] No `--force` bypass exists
- [ ] After confirmation, all versioned objects, images, repository, and bucket are deleted and verified gone
- [ ] Tests pass for inventory, refusal paths, fingerprint staleness, and deletion verification
