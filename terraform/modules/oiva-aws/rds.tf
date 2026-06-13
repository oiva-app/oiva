resource "aws_db_subnet_group" "postgres" {
  name       = "${local.name}-postgres"
  subnet_ids = local.private_subnet_ids

  tags = merge(local.tags, {
    Name = "${local.name}-postgres-subnet-group"
  })
}

resource "aws_db_instance" "postgres" {
  identifier = "${local.name}-postgres"

  engine         = "postgres"
  engine_version = var.postgres_engine_version
  instance_class = var.postgres_instance_class

  allocated_storage = var.postgres_allocated_storage
  storage_type      = var.postgres_storage_type
  storage_encrypted = true

  db_name  = var.postgres_database_name
  username = var.postgres_username

  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = var.postgres_publicly_accessible
  multi_az               = true

  backup_retention_period = var.postgres_backup_retention
  deletion_protection     = var.postgres_deletion_protection
  skip_final_snapshot     = var.postgres_skip_final_snapshot

  tags = merge(local.tags, {
    Name = "${local.name}-postgres"
  })
}
