resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Allow public HTTPS traffic to the Oiva ALB"
  vpc_id      = local.vpc_id

  tags = merge(local.tags, {
    Name = "${local.name}-alb-sg"
  })
}

resource "aws_security_group" "ecs" {
  name        = "${local.name}-ecs"
  description = "Allow Oiva app traffic from the ALB and outbound runtime access"
  vpc_id      = local.vpc_id

  tags = merge(local.tags, {
    Name = "${local.name}-ecs-sg"
  })
}

resource "aws_security_group" "rds" {
  name        = "${local.name}-rds"
  description = "Allow Postgres traffic from Oiva ECS tasks"
  vpc_id      = local.vpc_id

  tags = merge(local.tags, {
    Name = "${local.name}-rds-sg"
  })
}

resource "aws_security_group_rule" "alb_ingress_https" {
  type              = "ingress"
  description       = "HTTPS from internet"
  security_group_id = aws_security_group.alb.id
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "alb_egress_app" {
  type                     = "egress"
  description              = "Oiva app traffic to ECS tasks"
  security_group_id        = aws_security_group.alb.id
  from_port                = 4111
  to_port                  = 4111
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs.id
}

resource "aws_security_group_rule" "ecs_ingress_app" {
  type                     = "ingress"
  description              = "Oiva app traffic from ALB"
  security_group_id        = aws_security_group.ecs.id
  from_port                = 4111
  to_port                  = 4111
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "ecs_egress_postgres" {
  type                     = "egress"
  description              = "Postgres to RDS"
  security_group_id        = aws_security_group.ecs.id
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.rds.id
}

resource "aws_security_group_rule" "ecs_egress_https" {
  type              = "egress"
  description       = "HTTPS outbound"
  security_group_id = aws_security_group.ecs.id
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "rds_ingress_postgres" {
  type                     = "ingress"
  description              = "Postgres from ECS tasks"
  security_group_id        = aws_security_group.rds.id
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs.id
}
