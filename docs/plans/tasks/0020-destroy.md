# Task 0020: Destroy

**Branch**: `feature/destroy`
**Depends on**: 0008
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 14, 17

## What to build

`oiva destroy` — the deployment destruction command that follows the configured safety policy (`protected` or `disposable`). Both modes retain the state bucket and ECR repository; only `bootstrap destroy` (task 0006) removes those.

**Protected mode**:

1. Inventory persistent resources (RDS, S3 knowledge bucket, secrets)
2. Generate a final RDS snapshot identifier
3. Compare remote knowledge objects with the committed local mirror; stop on unexpected remote content
4. Display the full disclosed sequence: snapshot ID, knowledge deletion, Terraform destroy
5. Require typed `destroy protected <deployment> <account> <region>` confirmation bound to a stable inventory fingerprint
6. Disable RDS deletion protection
7. Verify and empty the knowledge bucket (only if local mirror matches)
8. Run `terraform destroy` with `postgres_skip_final_snapshot=false` and the final snapshot identifier
9. Verify the RDS snapshot exists
10. Retain state bucket and ECR

**Disposable mode**:

1. Inventory persistent resources
2. Display the sequence: knowledge deletion, Terraform destroy (no final snapshot)
3. Require typed `destroy disposable <deployment> <account> <region>` confirmation bound to a stable fingerprint
4. Run `terraform destroy` with `postgres_skip_final_snapshot=true`
5. Retain state bucket and ECR

A stale fingerprint (changed inventory) rejects execution. No `--force` bypass.

## Implementation work

- [ ] Implement persistent-resource inventory: RDS instance, S3 knowledge bucket objects, Secrets Manager secrets from Terraform output
- [ ] Implement final-snapshot identifier generation
- [ ] Implement knowledge comparison: remote S3 objects vs local `knowledge-base/` mirror; stop on unexpected remote content for protected
- [ ] Implement stable inventory fingerprint for stale-approval prevention
- [ ] Implement typed confirmation `destroy protected|disposable <deployment> <account> <region>` bound to fingerprint
- [ ] Implement protected path: disable deletion protection → verify/empty knowledge bucket → `terraform destroy` with final snapshot → verify snapshot
- [ ] Implement disposable path: `terraform destroy` without final snapshot → verify
- [ ] Implement safety-mode mapping from config to Terraform safety booleans
- [ ] Implement state-bucket and ECR retention (never destroy them)
- [ ] Write tests: Terraform/RDS/S3 fakes, protected-cannot-silently-destroy test, disposable-still-requires-confirmation test, fingerprint-staleness test, knowledge-recoverability-verification test, snapshot-verification test

## Human checkpoints

- [ ] [verify] Protected destroy in a disposable AWS account with a real RDS final snapshot. Expected: snapshot exists after destroy. Failure: snapshot missing or knowledge unrecoverable. Reason: AWS deletion-protection/snapshot behavior cannot be fully established by mocks.
- [ ] [confirm-db] Destructive RDS deletion and knowledge-base data deletion require explicit approval.

## Acceptance criteria

- [ ] `oiva destroy` in protected mode requires a final RDS snapshot and verifies it exists after destroy
- [ ] `oiva destroy` in protected mode refuses unexpected remote knowledge content
- [ ] `oiva destroy` in disposable mode skips the final snapshot but still requires typed confirmation
- [ ] Both modes require typed confirmation bound to a stable inventory fingerprint
- [ ] A stale fingerprint rejects execution
- [ ] No `--force` bypass exists
- [ ] Both modes retain the state bucket and ECR repository
- [ ] Tests pass for protected and disposable paths, fingerprint staleness, and knowledge recoverability
