terraform {
  backend "s3" {
    bucket         = "freyr-sales-tfstate-602367507820"
    key            = "freyr-sales/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "freyr-sales-tf-lock"
    encrypt        = true
  }
}
