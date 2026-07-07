variable "region" { default = "us-east-1" }
variable "aws_profile" { default = "276654751635_Infra_Engineer" }
variable "environment" { default = "production" }

variable "vpc_cidr" { default = "10.42.0.0/16" }
variable "azs" { default = ["us-east-1a", "us-east-1b"] }
variable "public_subnet_cidrs" { default = ["10.42.0.0/24", "10.42.1.0/24"] }
variable "private_subnet_cidrs" { default = ["10.42.10.0/24", "10.42.11.0/24"] }

variable "image_tag" { default = "latest" }
variable "desired_count" { default = 1 }
variable "task_cpu" { default = 512 }
variable "task_memory" { default = 1024 }

# non-secret runtime config (public values)
variable "next_public_supabase_url" {}
variable "next_public_supabase_anon_key" {}
variable "email_from" { default = "" }
