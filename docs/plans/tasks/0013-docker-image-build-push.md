# Task 0013: Docker image build and push

**Branch**: `feature/docker-image-build-push`
**Depends on**: 0005
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 6, 8

## What to build

The Docker image build and push service that `launch` (task 0015) and `deploy` (task 0016) depend on. Builds `src/agent` using its Dockerfile, tags with the Git commit, authenticates to ECR, pushes, and resolves the immutable registry digest.

Before building, the service validates:

- Docker is installed and the daemon is reachable
- The Git working tree is clean (no uncommitted changes) for production deployments
- An exact Git commit is identified

The build uses the existing `src/agent/Dockerfile` with the repo root as the build context. The image is tagged with a human-readable tag including the commit short SHA and optional Git tag. After pushing, the service resolves the image to its immutable digest-qualified URI (e.g. `123456789012.dkr.ecr.us-east-1.amazonaws.com/oiva-agent@sha256:...`).

The Docker subprocess runner reuses the sanitized subprocess runner pattern from task 0007. ECR authentication uses the standard AWS credential chain (with `--profile` if set).

## Implementation work

- [ ] Create `oiva_cli/docker/` package with a Docker service module
- [ ] Implement Git state validation: clean working tree, exact commit identification, commit short SHA and optional tag
- [ ] Implement Docker build: `docker build -t <tag> -f src/agent/Dockerfile <repo-root>` via subprocess runner
- [ ] Implement ECR authentication: `aws ecr get-login-password` → `docker login`
- [ ] Implement image tag: `<ecr-uri>/oiva-agent:<commit-short-sha>` (and optional git tag if present)
- [ ] Implement push: `docker push <tag>`
- [ ] Implement digest resolution: `docker inspect --format='{{index .RepoDigests 0}}' <image>` or ECR `describe_images` to get the digest-qualified URI
- [ ] Implement dirty-checkout refusal for production with actionable message
- [ ] Write tests: Docker subprocess spies, ECR Stubber, clean-Git-state test, dirty-checkout refusal, digest-resolution verification

## Acceptance criteria

- [ ] The service builds `src/agent` using its Dockerfile with the repo root as context
- [ ] The image is tagged with the Git commit short SHA and optional tag
- [ ] ECR authentication uses the standard AWS credential chain
- [ ] After push, the immutable digest-qualified URI is resolved
- [ ] A dirty Git working tree is rejected for production with an actionable message
- [ ] Docker daemon unreachability is reported with a clear error
- [ ] Tests pass for build, tag, push, digest resolution, and dirty-checkout refusal
