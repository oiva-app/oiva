locals {
  create_acm_certificate = var.certificate_arn == null
  certificate_arn        = var.certificate_arn == null ? aws_acm_certificate.oiva[0].arn : var.certificate_arn
}

resource "aws_acm_certificate" "oiva" {
  count = local.create_acm_certificate ? 1 : 0

  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.tags, {
    Name = "${local.name}-certificate"
  })
}

resource "aws_route53_record" "certificate_validation" {
  for_each = local.create_acm_certificate ? {
    for option in aws_acm_certificate.oiva[0].domain_validation_options :
    option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.hosted_zone_id
}

resource "aws_acm_certificate_validation" "oiva" {
  count = local.create_acm_certificate ? 1 : 0

  certificate_arn         = aws_acm_certificate.oiva[0].arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]
}

resource "aws_route53_record" "oiva" {
  count = var.create_route53_record ? 1 : 0

  name    = var.domain_name
  type    = "A"
  zone_id = var.hosted_zone_id

  alias {
    name                   = aws_lb.oiva.dns_name
    zone_id                = aws_lb.oiva.zone_id
    evaluate_target_health = true
  }
}
