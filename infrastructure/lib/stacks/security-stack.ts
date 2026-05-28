import * as cdk from "aws-cdk-lib/core";
import * as kms from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";

/**
 * SecurityStack — общая безопасность проекта.
 *
 * Принцип: каждая Lambda получает минимально необходимые права через
 * CDK .grantRead() / .grantWrite() — никаких AdministratorAccess или
 * AmazonDynamoDBFullAccess на Lambda ролях.
 *
 * Этот стек предоставляет:
 * - Общий Customer Managed KMS key (CMK) для шифрования DynamoDB / SQS / SNS
 *   вместо дефолтного AWS managed key (SSE-S3/SSE-SQS).
 *
 * Почему CMK (а не AWS managed key):
 * - Полный контроль: можно отозвать ключ и мгновенно заблокировать доступ к данным
 * - Audit trail: каждое обращение к ключу логируется в CloudTrail
 * - Cross-account sharing: можно дать доступ к данным другому аккаунту
 * - Требование compliance (SOC2, HIPAA, PCI DSS)
 *
 * Стоимость: $1/месяц за ключ + $0.03 за 10K API вызовов (практически бесплатно).
 */
export class SecurityStack extends cdk.Stack {
  /** Общий CMK key — можно передавать в другие стеки через props */
  public readonly documentProcessingKey: kms.Key;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Customer Managed Key для шифрования ресурсов платформы.
    // enableKeyRotation = true: AWS автоматически ротирует key material каждый год.
    // Это best practice — даже если старый материал утёк, новые данные зашифрованы новым.
    this.documentProcessingKey = new kms.Key(this, "DocumentProcessingKey", {
      alias: "alias/docprocess-key",
      description: "CMK for Document Processing Platform — DynamoDB, SQS, SNS",
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // CloudFormation Output — ARN ключа для использования в других стеках
    new cdk.CfnOutput(this, "DocumentProcessingKeyArn", {
      value: this.documentProcessingKey.keyArn,
      exportName: "DocProcess-KmsKeyArn",
      description: "CMK ARN for Document Processing Platform",
    });
  }
}
