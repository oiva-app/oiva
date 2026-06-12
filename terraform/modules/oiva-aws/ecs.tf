resource "aws_ecs_cluster" "oiva" {
  name = local.name

  tags = local.tags
}

resource "aws_ecs_task_definition" "oiva" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.task_cpu)
  memory                   = tostring(var.task_memory)
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  ephemeral_storage {
    size_in_gib = var.ephemeral_storage_gib
  }

  container_definitions = jsonencode([
    {
      name      = "adot-collector"
      image     = var.adot_collector_image
      essential = true

      environment = [
        {
          name  = "AOT_CONFIG_CONTENT"
          value = var.adot_config_content
        },
      ]

      secrets = [
        {
          name      = "HONEYCOMB_API_KEY"
          valueFrom = local.secret_arns.honeycomb_api_key
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "adot-collector"
        }
      }
    },
    {
      name      = "oiva-agent"
      image     = var.agent_image
      essential = true

      portMappings = [
        {
          containerPort = 4111
          hostPort      = 4111
          protocol      = "tcp"
        },
      ]

      dependsOn = [
        {
          containerName = "adot-collector"
          condition     = "START"
        },
      ]

      environment = local.app_environment
      secrets     = local.app_secrets
      stopTimeout = 60

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "oiva-agent"
        }
      }
    },
  ])

  tags = local.tags
}

resource "aws_ecs_service" "oiva" {
  name            = local.name
  cluster         = aws_ecs_cluster.oiva.id
  task_definition = aws_ecs_task_definition.oiva.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  enable_execute_command            = false
  health_check_grace_period_seconds = 60
  wait_for_steady_state             = false
  enable_ecs_managed_tags           = true
  propagate_tags                    = "SERVICE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.private_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.oiva.arn
    container_name   = "oiva-agent"
    container_port   = 4111
  }

  depends_on = [
    aws_lb_listener.https,
    aws_iam_role_policy.task_execution,
    aws_iam_role_policy.task,
  ]

  tags = local.tags
}
