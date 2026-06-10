import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';
import type { AnyWorkspace } from "@mastra/core/workspace";
import { RequestContext } from "@mastra/core/request-context";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { env } from "../config/env";
import {
  getCodebaseRoot,
  getKnowledgeBaseMirrorPath,
  getWorkspaceRoot,
} from "./workspace-paths";

const execFileAsync = promisify(execFile);

const KNOWLEDGE_BASE_MOUNT = "/knowledge-base";
const CODEBASE_MOUNT = "/codebase";

type InitRecord = {
  promise: Promise<AnyWorkspace>;
  controller: AbortController;
  token: symbol;
};

const workspacesByIncidentId = new Map<string, AnyWorkspace>();
const inFlight = new Map<string, InitRecord>();

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

async function runGit(args: string[], options?: { env?: NodeJS.ProcessEnv; signal?: AbortSignal }) {
  await execFileAsync("git", args, {
    env: options?.env ?? process.env,
    signal: options?.signal,
    maxBuffer: 1024 * 1024 * 10,
  });
}

function assertInitCurrent(
  incidentId: string,
  token: symbol,
  signal: AbortSignal,
) {
  if (signal.aborted || inFlight.get(incidentId)?.token !== token) {
    throw new Error(`Codebase workspace initialization was cancelled for incidentId ${incidentId}`);
  }
}

async function cloneRepositories(
  incidentId: string,
  token: symbol,
  codebaseRoot: string,
  gitEnv: NodeJS.ProcessEnv,
  controller: AbortController,
) {
  assertInitCurrent(incidentId, token, controller.signal);

  const shallowSince = getSixMonthsAgoDate();
  const clonePromises = env.APP_GITHUB_REPOSITORIES.map((repository) => {
    assertInitCurrent(incidentId, token, controller.signal);
    const clonePath = getContainedClonePath(codebaseRoot, repository.name);

    return runGit([
      "clone",
      "--shallow-since",
      shallowSince,
      repository.url,
      clonePath,
    ], {
      env: gitEnv,
      signal: controller.signal,
    });
  });

  let firstFailure: unknown;

  await Promise.all(
    clonePromises.map(async (promise) => {
      try {
        await promise;
      } catch (error) {
        if (!controller.signal.aborted && firstFailure === undefined) {
          firstFailure = error;
        }
        controller.abort();
      }
    }),
  );

  if (firstFailure) {
    throw firstFailure;
  }

  assertInitCurrent(incidentId, token, controller.signal);
}

function getContainedClonePath(codebaseRoot: string, repositoryName: string) {
  const resolvedCodebaseRoot = path.resolve(codebaseRoot);
  const clonePath = path.resolve(path.join(codebaseRoot, repositoryName));

  if (
    clonePath === resolvedCodebaseRoot ||
    !clonePath.startsWith(`${resolvedCodebaseRoot}${path.sep}`)
  ) {
    throw new Error(
      `Repository name escapes codebase root: ${repositoryName}`,
    );
  }

  return clonePath;
}

function createWorkspace(incidentId: string) {
  const codebaseRoot = getCodebaseRoot(incidentId);

  return new Workspace(
    {
      mounts: {
        [KNOWLEDGE_BASE_MOUNT]: new LocalFilesystem({
          basePath: getKnowledgeBaseMirrorPath(incidentId),
          readOnly: true,
        }),
        [CODEBASE_MOUNT]: new LocalFilesystem({
          basePath: codebaseRoot,
        }),
      },
      sandbox: new LocalSandbox({
        workingDirectory: codebaseRoot,
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

async function initCodebaseAgentWorkspace(
  incidentId: string,
  token: symbol,
  controller: AbortController,
): Promise<AnyWorkspace> {
  const workspaceRoot = getWorkspaceRoot(incidentId);
  const codebaseRoot = getCodebaseRoot(incidentId);
  let workspace: AnyWorkspace | undefined;

  try {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await resetSandboxRoot(codebaseRoot);

    await withGitAskpass(async (gitEnv) => {
      await cloneRepositories(
        incidentId,
        token,
        codebaseRoot,
        gitEnv,
        controller,
      );
    });

    assertInitCurrent(incidentId, token, controller.signal);

    workspace = createWorkspace(incidentId);
    await workspace.init();
    assertInitCurrent(incidentId, token, controller.signal);

    workspacesByIncidentId.set(incidentId, workspace);
    return workspace;
  } catch (error) {
    controller.abort();
    await workspace?.destroy().catch(() => undefined);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
    throw error;
  }
}

export function prepareCodebaseAgentWorkspace(incidentId: string): Promise<AnyWorkspace> {
  const workspace = workspacesByIncidentId.get(incidentId);
  if (workspace) {
    return Promise.resolve(workspace);
  }

  const existing = inFlight.get(incidentId);
  if (existing) {
    return existing.promise;
  }

  const controller = new AbortController();
  const token = Symbol(incidentId);
  const promise = initCodebaseAgentWorkspace(incidentId, token, controller)
    .finally(() => {
      if (inFlight.get(incidentId)?.token === token) {
        inFlight.delete(incidentId);
      }
    });

  inFlight.set(incidentId, { promise, controller, token });
  return promise;
}

export async function cleanupCodebaseAgentWorkspace(incidentId: string) {
  const record = inFlight.get(incidentId);
  if (record) {
    record.controller.abort();
    inFlight.delete(incidentId);
    await record.promise.catch(() => undefined);
  }

  const workspaceRoot = getWorkspaceRoot(incidentId);
  const workspace = workspacesByIncidentId.get(incidentId);
  workspacesByIncidentId.delete(incidentId);

  try {
    await workspace?.destroy();
  } catch {
    // Continue tearing down the sandbox even if workspace provider cleanup fails.
  }

  await fs.rm(workspaceRoot, { recursive: true, force: true });
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
