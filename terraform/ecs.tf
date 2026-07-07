resource "aws_ecs_cluster" "main" {
  name = "freyr-sales-cluster"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = "freyr-sales"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name         = "freyr-sales"
    image        = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
    essential    = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "NEXT_PUBLIC_SUPABASE_URL", value = var.next_public_supabase_url },
      { name = "NEXT_PUBLIC_SUPABASE_ANON_KEY", value = var.next_public_supabase_anon_key },
      { name = "EMAIL_FROM", value = var.email_from }
    ]
    secrets = [
      { name = "SUPABASE_SERVICE_ROLE_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:SUPABASE_SERVICE_ROLE_KEY::" },
      { name = "ANTHROPIC_API_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:ANTHROPIC_API_KEY::" },
      { name = "APIFY_API_TOKEN", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:APIFY_API_TOKEN::" },
      { name = "FIRECRAWL_API_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:FIRECRAWL_API_KEY::" },
      { name = "RESEND_API_KEY", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:RESEND_API_KEY::" },
      { name = "SMTP_URL", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:SMTP_URL::" },
      { name = "TELEGRAM_BOT_TOKEN", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:TELEGRAM_BOT_TOKEN::" },
      { name = "TELEGRAM_CHAT_ID", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:TELEGRAM_CHAT_ID::" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "app" {
  name            = "freyr-sales-svc"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.svc.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "freyr-sales"
    container_port   = 3000
  }

  health_check_grace_period_seconds = 60

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.http]

  # The Azure DevOps pipeline updates the task-def revision; don't let TF revert it.
  lifecycle {
    ignore_changes = [task_definition]
  }
}
