resource "aws_secretsmanager_secret" "runtime" {
  name        = "freyr-sales/runtime"
  description = "Runtime secrets for freyr-sales (values set out-of-band via CLI)"
}
