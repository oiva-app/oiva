#!/usr/bin/env python3
"""
Interactively populate the Oiva runtime secrets in AWS Secrets Manager.
"""

import json
import subprocess
import sys


def run(cmd, check=False):
    """Run a command, returning the CompletedProcess. Capture stdout/stderr."""
    return subprocess.run(cmd, text=True, capture_output=True, check=check)


def terraform_outputs():
    """Read the terraform outputs this script depends on (run in CWD)."""
    try:
        secret_arns = json.loads(
            run(["terraform", "output", "-json", "secret_arns"], check=True).stdout
        )
        cluster = run(
            ["terraform", "output", "-raw", "ecs_cluster_name"], check=True
        ).stdout.strip()
        service = run(
            ["terraform", "output", "-raw", "ecs_service_name"], check=True
        ).stdout.strip()
    except FileNotFoundError:
        sys.exit("error: `terraform` not found on PATH.")
    except subprocess.CalledProcessError as exc:
        sys.exit(
            "error: failed to read terraform outputs:\n"
            f"{exc.stderr.strip()}\n"
            "Run this script from the terraform working directory "
            "(e.g. terraform) after `terraform apply`."
        )
    return secret_arns, cluster, service


def push_secret(arn, value):
    """Push a single secret value. Returns True on success."""
    result = run(
        [
            "aws", "secretsmanager", "put-secret-value",
            "--secret-id", arn,
            "--secret-string", value,
            "--output", "text",
            "--query", "VersionId",
        ]
    )
    if result.returncode != 0:
        print(f"  ! failed: {result.stderr.strip()}")
        return False
    return True


def force_new_deployment(cluster, service):
    """Trigger a single force-new-deployment on the ECS service."""
    result = run(
        [
            "aws", "ecs", "update-service",
            "--cluster", cluster,
            "--service", service,
            "--force-new-deployment",
            "--output", "text",
            "--query", "service.serviceName",
        ]
    )
    if result.returncode != 0:
        sys.exit(f"error: failed to trigger deployment:\n{result.stderr.strip()}")
    print(f"Triggered new deployment for service '{result.stdout.strip()}'.")


def main():
    print("Fetching secrets to populate...")
    secret_arns, cluster, service = terraform_outputs()
    if not secret_arns:
        sys.exit("error: `secret_arns` output is empty -- nothing to populate.")

    print("Enter a value for each secret (leave blank to skip):\n")

    updated = []
    skipped = []
    failed = []
    for key, arn in secret_arns.items():
        value = input(f"  {key}=")
        if not value:
            skipped.append(key)
            continue
        if push_secret(arn, value):
            updated.append(key)
        else:
            failed.append(key)


    print(
        f"\nDone: {len(updated)} updated, {len(skipped)} skipped, "
        f"{len(failed)} failed."
    )
    if failed:
        print(f"Failed: {', '.join(failed)}")
        sys.exit(1)
    else:
        print()
        force_new_deployment(cluster, service)



if __name__ == "__main__":
    main()
