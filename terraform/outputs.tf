output "alb_dns_name" { value = aws_lb.alb.dns_name }
output "ecr_repo_url" { value = aws_ecr_repository.app.repository_url }
output "cluster_name" { value = aws_ecs_cluster.main.name }
output "service_name" { value = aws_ecs_service.app.name }
output "task_family" { value = aws_ecs_task_definition.app.family }
