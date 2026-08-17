# Task 0008: Terraform apply

**Branch**: `feature/terraform-apply`
**Depends on**: 0007
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 9

## What to build

`oiva apply` — the Terraform apply command that creates/shows a plan, requires interactive confirmation, runs `terraform apply`, and preserves the current image digest from Terraform output. Does not build images or upload secrets.

When infrastructure already exists with a deployed image, `apply` reads the `agent_image` from Terraform output and passes it back unchanged so infrastructure changes do not accidentally roll back the application. If no current image exists (first deployment without `launch`), `apply` fails with guidance to use `oiva launch` instead.

The workflow:

```
read config → validate → map to Terraform inputs
→ read current agent_image from Terraform output (if any)
→ if no current image: fail with "use oiva launch" guidance
→ terraform plan -out=<planfile>
→ display plan
→ require TTY confirmation
→ terraform apply <planfile>
→ display result
```

Confirmation uses the shared TTY-required utility from task 0003. The subprocess runner and config mapping from task 0007 are reused.

## Implementation work

- [ ] Implement current-image reading: `terraform output -json` → extract `agent_image` value
- [ ] Implement no-current-image guard: fail with actionable "use `oiva launch`" message
- [ ] Implement image-preservation: pass the current `agent_image` from output back as a Terraform input so it does not change during apply
- [ ] Implement `oiva apply` command: plan → display → confirm → apply → display result
- [ ] Implement TTY confirmation with plan summary before apply
- [ ] Write tests: fake Terraform output with/without `agent_image`, subprocess spies, image-preservation verification, no-image guidance message, confirmation flow

## Acceptance criteria

- [ ] `oiva apply` creates a plan, displays it, requires confirmation, and applies it
- [ ] `oiva apply` reads the current `agent_image` from Terraform output and passes it back unchanged
- [ ] `oiva apply` fails with "use `oiva launch`" guidance when no current image exists
- [ ] `oiva apply` does not build images or upload secrets
- [ ] Confirmation requires a TTY
- [ ] Tests pass for image preservation, no-image guard, and apply flow
