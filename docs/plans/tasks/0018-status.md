# Task 0018: Status

**Branch**: `feature/status`
**Depends on**: 0008
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 12

## What to build

`oiva status` — a read-only command that displays a concise operational summary of the current deployment. Does not require the AWS console.

The command displays:

- Deployment name and safety mode
- AWS account and region
- Git commit and image digest (from Terraform output)
- ECS service health (desired/running/pending counts, last event)
- Public URL (from Terraform output)
- Endpoint health (quick `/health` probe)

Reads configured values from Terraform output and runtime values from boto3 ECS. If infrastructure does not exist, reports that and exits with guidance to use `oiva launch`.

## Implementation work

- [ ] Implement ECS status service: `describe_services` for desired/running/pending counts and last event
- [ ] Implement Terraform output reading for URL, agent_image, deployment_name
- [ ] Implement quick `/health` HTTP probe
- [ ] Implement `oiva status` command: read output → query ECS → probe health → display via Rich
- [ ] Implement missing-infrastructure guidance
- [ ] Write tests: ECS Stubber, Terraform output fakes, HTTP fake, summary-format verification, missing-infrastructure guidance

## Acceptance criteria

- [ ] `oiva status` displays deployment name, safety mode, account, region, commit, digest, ECS service health, task counts, and public URL
- [ ] `oiva status` probes the `/health` endpoint
- [ ] `oiva status` works without TTY (read-only)
- [ ] Missing infrastructure produces actionable guidance
- [ ] Tests pass for status display, health probe, and missing-infrastructure guidance
