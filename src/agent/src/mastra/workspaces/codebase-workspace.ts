import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';
import type { AnyWorkspace } from "@mastra/core/workspace";
import { RequestContext } from "@mastra/core/request-context";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { env } from "../config/env";

const execFileAsync = promisify(execFile);

const KNOWLEDGE_BASE_MOUNT = "/knowledge-base";
const CODEBASE_MOUNT = "/codebase";

const workspacesByIncidentId = new Map<string, AnyWorkspace>();

function getSandboxRoot(incidentId: string) {
  return path.join(env.SANDBOX_BASE_PATH, incidentId);
}

function getCodebaseClonePath(incidentId: string) {
  return path.join(
    getSandboxRoot(incidentId),
    getRepoName(env.APP_GITHUB_HTTPS_URL),
  );
}

function getRepoName(remoteUrl: string) {
  const pathname = new URL(remoteUrl).pathname;
  const repoName = path.basename(pathname).replace(/\.git$/, "");
  if (repoName.length === 0) {
    throw new Error(
      `Unable to derive repository name from APP_GITHUB_HTTPS_URL: ${remoteUrl}`,
    );
  }
  return repoName;
}

function getSixMonthsAgoDate() {
  const now = new Date();
  const targetMonth = now.getMonth() - 6;
  const lastDayOfTargetMonth = new Date(
    now.getFullYear(),
    targetMonth + 1,
    0,
  ).getDate();
  const date = new Date(
    now.getFullYear(),
    targetMonth,
    Math.min(now.getDate(), lastDayOfTargetMonth),
  );
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

async function resetSandboxRoot(sandboxRoot: string) {
  await fs.rm(sandboxRoot, { recursive: true, force: true });
  await fs.mkdir(sandboxRoot, { recursive: true });
}

async function withGitAskpass<T>(fn: (env: NodeJS.ProcessEnv) => Promise<T>) {
  const askpassPath = path.join(
    os.tmpdir(),
    `oiva-git-askpass-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`,
  );
  const askpassScript = `#!/bin/sh
case "$1" in
  *Username*) printf '%s\\n' 'x-access-token' ;;
  *Password*) printf '%s\\n' "$GITHUB_PAT" ;;
  *) printf '%s\\n' "$GITHUB_PAT" ;;
esac
`;

  await fs.writeFile(askpassPath, askpassScript, { mode: 0o700 });

  try {
    return await fn({
      ...process.env,
      GIT_ASKPASS: askpassPath,
      GIT_TERMINAL_PROMPT: "0",
      GITHUB_PAT: env.GITHUB_PAT,
    });
  } finally {
    await fs.rm(askpassPath, { force: true });
  }
}

async function runGit(args: string[], options?: { env?: NodeJS.ProcessEnv }) {
  await execFileAsync("git", args, {
    env: options?.env ?? process.env,
    maxBuffer: 1024 * 1024 * 10,
  });
}

function createWorkspace(incidentId: string) {
  const sandboxRoot = getSandboxRoot(incidentId);

  return new Workspace(
    {
      mounts: {
        [KNOWLEDGE_BASE_MOUNT]: new LocalFilesystem({
          basePath: env.KNOWLEDGE_BASE_PATH,
          readOnly: true,
        }),
        [CODEBASE_MOUNT]: new LocalFilesystem({
          basePath: sandboxRoot,
        }),
      },
      sandbox: new LocalSandbox({
        workingDirectory: sandboxRoot,
      }),
      onMount: ({ mountPath }) => {
        if (mountPath === CODEBASE_MOUNT) return false;
        if (mountPath === KNOWLEDGE_BASE_MOUNT) return false;
      },
      lsp: true,
      bm25: true,
      autoIndexPaths: [CODEBASE_MOUNT],
    },
  );
}

export async function prepareCodebaseAgentWorkspace(incidentId: string) {
  if (workspacesByIncidentId.has(incidentId)) {
    return workspacesByIncidentId.get(incidentId)!;
  }

  const sandboxRoot = getSandboxRoot(incidentId);
  const clonePath = getCodebaseClonePath(incidentId);

  try {
    await fs.mkdir(env.SANDBOX_BASE_PATH, { recursive: true });
    await resetSandboxRoot(sandboxRoot);

    await withGitAskpass(async (gitEnv) => {
      await runGit([
        "clone",
        "--shallow-since",
        getSixMonthsAgoDate(),
        env.APP_GITHUB_HTTPS_URL,
        clonePath,
      ], { env: gitEnv });
    });

    const workspace = createWorkspace(incidentId);
    await workspace.init();
    workspacesByIncidentId.set(incidentId, workspace);
    return workspace;
  } catch (error) {
    await cleanupCodebaseAgentWorkspace(incidentId);
    throw error;
  }
}

export async function cleanupCodebaseAgentWorkspace(incidentId: string) {
  const sandboxRoot = getSandboxRoot(incidentId);
  const workspace = workspacesByIncidentId.get(incidentId);
  workspacesByIncidentId.delete(incidentId);

  try {
    await workspace?.destroy();
  } catch {
    // Continue tearing down the sandbox even if workspace provider cleanup fails.
  }

  await fs.rm(sandboxRoot, { recursive: true, force: true });
}

export function getCodebaseAgentWorkspace({ requestContext }: { requestContext: RequestContext }) {
  const incidentId = requestContext.get("incidentId");
  if (typeof incidentId !== "string" || incidentId.length === 0) {
    throw new Error("getCodebaseAgentWorkspace: incidentId missing from request context");
  }

  const workspace = workspacesByIncidentId.get(incidentId);
  if (!workspace) {
    throw new Error(`getCodebaseAgentWorkspace: workspace not prepared for incidentId ${incidentId}`);
  }

  return workspace;
}
