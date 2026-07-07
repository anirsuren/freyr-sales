resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/freyr-sales"
  retention_in_days = 30
}
