resource "terraform_data" "input_validation" {
  input = var.deployment_name

  lifecycle {
    precondition {
      condition = var.create_vpc || (
        var.vpc_id != null &&
        length(var.public_subnet_ids) >= 2 &&
        length(var.private_subnet_ids) >= 2
      )
      error_message = "When create_vpc is false, provide vpc_id, at least two public_subnet_ids, and at least two private_subnet_ids."
    }

    precondition {
      condition     = !var.create_route53_record || var.hosted_zone_id != null
      error_message = "hosted_zone_id is required when create_route53_record is true."
    }

    precondition {
      condition     = var.create_route53_record || var.certificate_arn != null
      error_message = "certificate_arn is required when create_route53_record is false."
    }

    precondition {
      condition     = var.create_knowledge_base_bucket || var.knowledge_base_s3_bucket != null
      error_message = "knowledge_base_s3_bucket is required when create_knowledge_base_bucket is false."
    }
  }
}
