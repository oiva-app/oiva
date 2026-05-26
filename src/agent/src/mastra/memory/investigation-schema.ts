import { z } from 'zod'

export const investigationSchema = z.object({
  timeAnchor: z.string().optional(),
  affectedServices: z.array(z.string()).optional(),
  failureMode: z.string().optional(),
  currentHypothesis: z.string().optional(),
  confidenceLevel: z.enum(['low', 'medium', 'high']).optional(),
  keyCommitsFound: z.array(z.object({
    hash: z.string(),
    summary: z.string(),
    relevance: z.string(),
  })).optional(),
  servicesRuledOut: z.array(z.string()).optional(),
  remainingInvestigationPaths: z.array(z.string()).optional(),
})
