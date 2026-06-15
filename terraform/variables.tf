variable "deployment_name" {
  description = "Short lowercase name used to name Oiva AWS resources."
  type        = string
}

variable "aws_region" {
  description = "AWS region where Oiva will run."
  type        = string
}

variable "agent_image" {
  description = "Container image URI for the oiva-agent container."
  type        = string
}

variable "domain_name" {
  description = "Full public DNS name for the Oiva service, such as oiva.example.com."
  type        = string
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID for DNS records and ACM validation."
  type        = string
  default     = null
}

variable "create_route53_record" {
  description = "Whether Terraform should create the Route 53 alias record for domain_name."
  type        = bool
  default     = true
}

variable "certificate_arn" {
  description = "Existing ACM certificate ARN. Required when create_route53_record is false."
  type        = string
  default     = null
}

variable "create_vpc" {
  description = "Whether Terraform should create a dedicated VPC, subnets, routes, and NAT Gateway."
  type        = bool
  default     = true
}

variable "vpc_id" {
  description = "Existing VPC ID when create_vpc is false."
  type        = string
  default     = null
}

variable "public_subnet_ids" {
  description = "Existing public subnet IDs for the ALB when create_vpc is false."
  type        = list(string)
  default     = []
}

variable "private_subnet_ids" {
  description = "Existing private subnet IDs for ECS and RDS when create_vpc is false."
  type        = list(string)
  default     = []
}

variable "observed_app_name" {
  description = "Name of the app Oiva observes."
  type        = string
}

variable "app_github_repositories" {
  description = "GitHub repositories Oiva should inspect."
  type = list(object({
    name = string
    url  = string
  }))

  validation {
    condition = alltrue([
      for repository in var.app_github_repositories :
      can(regex("^[A-Za-z0-9._-]+$", repository.name))
    ])
    error_message = "Repository names must contain only letters, numbers, periods, underscores, and hyphens."
  }

  validation {
    condition = alltrue([
      for repository in var.app_github_repositories :
      !contains([".", ".."], repository.name)
    ])
    error_message = "Repository names must not be '.' or '..'."
  }

  validation {
    condition     = length(var.app_github_repositories) > 0
    error_message = "app_github_repositories must contain at least one repository."
  }

  validation {
    condition     = length(distinct([for repository in var.app_github_repositories : repository.name])) == length(var.app_github_repositories)
    error_message = "Repository names must be unique."
  }
}

variable "slack_channel_id" {
  description = "Slack channel ID where Oiva posts investigation updates and reports."
  type        = string
}

variable "task_cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 1024
}

variable "task_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 2048
}

variable "ephemeral_storage_gib" {
  description = "Fargate task ephemeral storage size in GiB."
  type        = number
  default     = 50
}

variable "cloudwatch_log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

variable "postgres_instance_class" {
  description = "RDS Postgres instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "postgres_allocated_storage" {
  description = "RDS allocated storage in GiB."
  type        = number
  default     = 20
}

variable "postgres_backup_retention" {
  description = "RDS backup retention period in days."
  type        = number
  default     = 7
}

variable "postgres_multi_az" {
  description = "Whether RDS Postgres uses Multi-AZ standby failover."
  type        = bool
  default     = true
}

variable "create_knowledge_base_bucket" {
  description = "Whether Terraform should create a private knowledge-base S3 bucket."
  type        = bool
  default     = true
}

variable "knowledge_base_s3_bucket" {
  description = "Existing knowledge-base S3 bucket name when create_knowledge_base_bucket is false."
  type        = string
  default     = null
}

variable "knowledge_base_s3_prefix" {
  description = "S3 prefix containing Oiva knowledge-base files."
  type        = string
  default     = ""
}

variable "knowledge_base_force_destroy" {
  description = "Whether Terraform may delete the managed knowledge-base bucket even when it contains objects."
  type        = bool
  default     = true
}

variable "supervisor_max_steps" {
  description = "Maximum supervisor agent steps."
  type        = number
  default     = 30
}

variable "subagent_max_steps" {
  description = "Maximum subagent steps."
  type        = number
  default     = 20
}

variable "telemetry_max_steps" {
  description = "Maximum telemetry agent steps."
  type        = number
  default     = 20
}

variable "codebase_max_steps" {
  description = "Maximum codebase agent steps."
  type        = number
  default     = 20
}

variable "supervisor_agent_model" {
  description = "Mastra model router id for the supervisor agent."
  type        = string
  default     = "openai/gpt-5.4"
}

variable "telemetry_agent_model" {
  description = "Mastra model router id for the telemetry agent."
  type        = string
  default     = "openai/gpt-5.4"
}

variable "codebase_agent_model" {
  description = "Mastra model router id for the codebase agent."
  type        = string
  default     = "openai/gpt-5.4"
}

variable "report_agent_model" {
  description = "Mastra model router id for the report agent."
  type        = string
  default     = "openai/gpt-4o-mini"
}

variable "correlation_window_minutes" {
  description = "Correlation window for incident grouping."
  type        = number
  default     = 30
}

variable "reaper_enabled" {
  description = "Whether the cleanup reaper is enabled."
  type        = bool
  default     = true
}

variable "reaper_interval_minutes" {
  description = "Cleanup reaper sweep interval."
  type        = number
  default     = 10
}

variable "reaper_delivered_quiet_minutes" {
  description = "Minutes before delivered incidents are eligible for cleanup."
  type        = number
  default     = 1440
}

variable "reaper_failed_quiet_minutes" {
  description = "Minutes before failed incidents are eligible for cleanup."
  type        = number
  default     = 1440
}

variable "reaper_stuck_deadline_minutes" {
  description = "Minutes before a stuck investigation is eligible for cleanup."
  type        = number
  default     = 60
}

variable "llm_provider_secret_env_vars" {
  description = "LLM provider API key environment variable names to create as Secrets Manager placeholders and inject into the agent container. Names must match Mastra/provider expectations, such as OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY."
  type        = set(string)
  default     = ["OPENAI_API_KEY"]

  validation {
    condition = alltrue([
      for name in var.llm_provider_secret_env_vars :
      can(regex("^[A-Z_][A-Z0-9_]*$", name))
    ])
    error_message = "llm_provider_secret_env_vars entries must be valid uppercase environment variable names."
  }

  validation {
    condition = length(setintersection(var.llm_provider_secret_env_vars, toset([
      "HC_MCP_KEY",
      "HC_SHARED_SECRET",
      "GITHUB_PAT",
      "SLACK_BOT_TOKEN",
      "SLACK_SIGNING_SECRET",
      "HONEYCOMB_API_KEY",
    ]))) == 0
    error_message = "llm_provider_secret_env_vars must contain only LLM provider API key env vars, not Oiva integration secret names."
  }
}

variable "hc_mcp_key_secret_arn" {
  description = "Existing Secrets Manager ARN for HC_MCP_KEY."
  type        = string
  default     = null
}

variable "hc_shared_secret_secret_arn" {
  description = "Existing Secrets Manager ARN for HC_SHARED_SECRET."
  type        = string
  default     = null
}

variable "github_pat_secret_arn" {
  description = "Existing Secrets Manager ARN for GITHUB_PAT."
  type        = string
  default     = null
}

variable "slack_bot_token_secret_arn" {
  description = "Existing Secrets Manager ARN for SLACK_BOT_TOKEN."
  type        = string
  default     = null
}

variable "slack_signing_secret_secret_arn" {
  description = "Existing Secrets Manager ARN for SLACK_SIGNING_SECRET."
  type        = string
  default     = null
}

variable "honeycomb_api_key_secret_arn" {
  description = "Existing Secrets Manager ARN for HONEYCOMB_API_KEY."
  type        = string
  default     = null
}
