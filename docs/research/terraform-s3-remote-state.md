# Terraform S3 remote state for the Oiva CLI

## Planning decision informed

How the CLI should bootstrap, configure, lock, isolate, and migrate Terraform state.

## Answer

The Terraform root should declare a partial S3 backend. The CLI should create or adopt the bucket before initialization, supply only non-secret backend coordinates, use native S3 lockfiles, and treat local-state migration as a distinct confirmed operation. Native S3 locking requires raising Oiva's Terraform minimum from 1.5 to 1.10.

## Verified findings

- Terraform 1.10 introduced native S3 state locking. The S3 backend enables it with `use_lockfile = true`; locking is otherwise disabled by default. — [Terraform 1.10 release](https://github.com/hashicorp/terraform/releases/tag/v1.10.0), [S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3)
- DynamoDB-based locking is deprecated. A new backend does not need a DynamoDB table. — [S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3)
- HashiCorp highly recommends S3 bucket versioning for state recovery. The backend can encrypt state and lock objects with `encrypt = true`. — [S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3)
- Partial configuration requires a backend declaration such as `terraform { backend "s3" {} }`; remaining values can be passed during `terraform init`. — [Backend partial configuration](https://developer.hashicorp.com/terraform/language/backend#partial-configuration)
- Terraform persists merged backend configuration under `.terraform`, and saved plans capture it. Credentials should therefore come from the environment or conventional AWS credential chain, not backend configuration. — [Backend credentials and sensitive data](https://developer.hashicorp.com/terraform/language/backend#credentials-and-sensitive-data), [S3 credentials](https://developer.hashicorp.com/terraform/language/backend/s3#credentials-and-shared-configuration)
- Backend changes require `terraform init` again. `-migrate-state` attempts to copy existing state, whereas `-reconfigure` prevents migration. HashiCorp recommends backing up state before migration. — [Terraform init](https://developer.hashicorp.com/terraform/cli/commands/init#backend-initialization), [Backend initialization](https://developer.hashicorp.com/terraform/language/backend#initialize-the-backend)
- Non-default Terraform workspaces alter S3 key layout, but workspaces are not appropriate when environments need separate credentials or access controls. — [S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3), [Workspace limitations](https://developer.hashicorp.com/terraform/cli/workspaces#when-not-to-use-multiple-workspaces)

## Reasonable inferences

- The CLI must create or adopt the backend bucket before initializing the main Oiva Terraform root because backend configuration cannot refer to resources in that root.
- Oiva should stay in Terraform's default workspace and use a deterministic key per deployment.
- Fresh initialization, idempotent reinitialization, changed backend metadata, and local-to-S3 migration require distinct handling.

## Applicability

The repository currently requires Terraform `>= 1.5.0` and has no backend declaration. Native S3 locking changes that minimum to `>= 1.10.0`. The normal AWS credential chain, including SSO-backed shared configuration, can serve boto3 and Terraform without storing credentials in Oiva configuration.

## Unresolved uncertainty

None for the selected design. Bucket ownership/name collision remains a runtime condition that must fail safely rather than trigger unverified adoption.

## Sources

- [Terraform v1.10.0 release](https://github.com/hashicorp/terraform/releases/tag/v1.10.0) — HashiCorp release record establishing native S3 locking availability.
- [S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3) — HashiCorp reference for configuration, locking, permissions, credentials, and versioning.
- [Backend configuration](https://developer.hashicorp.com/terraform/language/backend) — HashiCorp reference for partial configuration, persistence, and initialization.
- [Terraform init](https://developer.hashicorp.com/terraform/cli/commands/init) — HashiCorp CLI reference for backend migration and reconfiguration.
- [Terraform workspaces](https://developer.hashicorp.com/terraform/cli/workspaces) — HashiCorp guidance on workspace isolation limits.
