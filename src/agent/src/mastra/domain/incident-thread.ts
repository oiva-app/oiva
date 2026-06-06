const THREAD_PREFIX = "incident:";

export const threadIdForIncident = (incidentId: string): string =>
  `${THREAD_PREFIX}${incidentId}`;

export const incidentIdFromThreadId = (
  threadId: string | undefined,
): string | null =>
  threadId?.startsWith(THREAD_PREFIX)
    ? threadId.slice(THREAD_PREFIX.length)
    : null;
