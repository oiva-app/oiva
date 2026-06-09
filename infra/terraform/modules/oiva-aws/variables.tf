variable "deployment_name" {
  description = "Short lowercase name used to name Oiva AWS resources."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}[a-z0-9]$", var.deployment_name))
    error_message = "deployment_name must be 3-32 characters, lowercase, start with a letter, and contain only lowercase letters, numbers, and hyphens."
  }
}

variable "aws_region" {
  description = "AWS region where Oiva will run."
  type        = string
}

variable "agent_image" {
  description = "Container image URI for the oiva-agent container."
  type        = string

  validation {
    condition     = var.agent_image != "" && var.agent_image != "replace-me"
    error_message = "agent_image must be set to a real container image URI before applying."
  }
}

variable "domain_name" {
  description = "Full public DNS name for the Oiva service, such as oiva.example.com."
  type        = string
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID for DNS records and ACM validation when Terraform manages them."
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

variable "vpc_cidr" {
  description = "CIDR block for the managed Oiva VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for managed public subnets."
  type        = list(string)
  default     = ["10.42.0.0/24", "10.42.1.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) == 2
    error_message = "public_subnet_cidrs must contain exactly two CIDR blocks for the managed VPC."
  }
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for managed private subnets."
  type        = list(string)
  default     = ["10.42.10.0/24", "10.42.11.0/24"]

  validation {
    condition     = length(var.private_subnet_cidrs) == 2
    error_message = "private_subnet_cidrs must contain exactly two CIDR blocks for the managed VPC."
  }
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

variable "correlation_window_minutes" {
  description = "Correlation window for incident grouping."
  type        = number
  default     = 30
}

variable "reaper_enabled" {
  description = "Whether the cleanup reaper is enabled."
  type        = bool
  default     = false
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

variable "desired_count" {
  description = "Number of Oiva ECS tasks to run."
  type        = number
  default     = 1
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

variable "adot_collector_image" {
  description = "Pinned AWS Distro for OpenTelemetry Collector image."
  type        = string
  default     = "public.ecr.aws/aws-observability/aws-otel-collector:v0.48.0"
}

variable "adot_config_content" {
  description = "Production ADOT collector config content, usually loaded with file()."
  type        = string
}

variable "health_check_path" {
  description = "ALB target group health check path."
  type        = string
  default     = "/health"
}

variable "cloudwatch_log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

variable "postgres_engine_version" {
  description = "RDS Postgres engine version."
  type        = string
  default     = "17"
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

variable "postgres_storage_type" {
  description = "RDS storage type."
  type        = string
  default     = "gp3"
}

variable "postgres_backup_retention" {
  description = "RDS backup retention period in days."
  type        = number
  default     = 7
}

variable "postgres_publicly_accessible" {
  description = "Whether RDS is publicly accessible."
  type        = bool
  default     = false
}

variable "postgres_deletion_protection" {
  description = "Whether RDS deletion protection is enabled."
  type        = bool
  default     = false
}

variable "postgres_skip_final_snapshot" {
  description = "Whether to skip the final RDS snapshot on destroy."
  type        = bool
  default     = true
}

variable "postgres_database_name" {
  description = "Initial Postgres database name."
  type        = string
  default     = "oiva"
}

variable "postgres_username" {
  description = "Postgres master username."
  type        = string
  default     = "oiva"
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

variable "secrets_recovery_window_days" {
  description = "Secrets Manager recovery window for placeholder secrets on destroy."
  type        = number
  default     = 7
}

variable "openai_api_key_secret_arn" {
  description = "Existing Secrets Manager ARN for OPENAI_API_KEY."
  type        = string
  default     = null
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

variable "tags" {
  description = "Additional tags for AWS resources."
  type        = map(string)
  default     = {}
}
