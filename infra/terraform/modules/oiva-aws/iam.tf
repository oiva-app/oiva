data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json

  tags = local.tags
}

resource "aws_iam_role" "task" {
  name               = "${local.name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json

  tags = local.tags
}

data "aws_iam_policy_document" "task_execution" {
  statement {
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.ecs.arn}:*"]
  }

  statement {
    actions = ["secretsmanager:GetSecretValue"]
    resources = concat(
      values(local.secret_arns),
      [aws_db_instance.postgres.master_user_secret[0].secret_arn],
    )
  }

  statement {
    actions = [
      "ecr:GetAuthorizationToken",
    ]
    resources = ["*"]
  }

  statement {
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "task_execution" {
  name   = "${local.name}-ecs-execution"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.task_execution.json
}

data "aws_iam_policy_document" "task" {
  statement {
    actions = ["s3:ListBucket"]
    resources = [
      "arn:aws:s3:::${local.knowledge_base_bucket}",
    ]
  }

  statement {
    actions = ["s3:GetObject"]
    resources = [
      "arn:aws:s3:::${local.knowledge_base_bucket}/${var.knowledge_base_s3_prefix}*",
    ]
  }
}

resource "aws_iam_role_policy" "task" {
  name   = "${local.name}-ecs-task"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task.json
}
