#!/usr/bin/env bash
#
# Local deploy script.
#
# Steps:
#   1. Build Docker image for linux/amd64 (Fargate architecture).
#   2. Log in to ECR.
#   3. Tag + push image to ECR.
#   4. Force a new deployment of the ECS service — it picks up the new
#      `:latest` image on the next task start.
#
# In production this would live in a GitHub Actions workflow with an
# OIDC-assumed IAM role. For the PoC a local script is enough and
# doubles as a record of which AWS commands actually perform the deploy.
#
# Usage:
#   ./scripts/deploy.sh
#
# Prereqs:
#   - Docker Desktop running.
#   - AWS CLI configured (`aws configure`) with an IAM user that has ECR
#     push + ECS update-service permissions.
#   - ECR repository + ECS service already created (one-off, see README).
#
# Override any variable from the environment, e.g.:
#   AWS_REGION=eu-west-1 ./scripts/deploy.sh

set -euo pipefail

# ─── Config (override via env) ─────────────────────────────────────────────
AWS_REGION="${AWS_REGION:-eu-central-1}"
ECR_REPO_NAME="${ECR_REPO_NAME:-funwithflights-routes}"
ECS_CLUSTER="${ECS_CLUSTER:-default}"
ECS_SERVICE="${ECS_SERVICE:-funwithflights-routes-32e0}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# ─── Derived values ────────────────────────────────────────────────────────
AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}"

echo "────────────────────────────────────────────────────────────"
echo "Region:       ${AWS_REGION}"
echo "ECR repo:     ${ECR_URI}"
echo "Image tag:    ${IMAGE_TAG}"
echo "ECS cluster:  ${ECS_CLUSTER}"
echo "ECS service:  ${ECS_SERVICE}"
echo "────────────────────────────────────────────────────────────"

# ─── 1. Build ──────────────────────────────────────────────────────────────
echo "[1/4] Building Docker image (linux/amd64)..."
docker build --platform linux/amd64 -t "${ECR_REPO_NAME}:${IMAGE_TAG}" .

# ─── 2. ECR login ──────────────────────────────────────────────────────────
echo "[2/4] Logging in to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# ─── 3. Tag + push ─────────────────────────────────────────────────────────
echo "[3/4] Tagging and pushing image..."
docker tag "${ECR_REPO_NAME}:${IMAGE_TAG}" "${ECR_URI}:${IMAGE_TAG}"
docker push "${ECR_URI}:${IMAGE_TAG}"

# ─── 4. Force ECS re-deploy ────────────────────────────────────────────────
echo "[4/4] Forcing ECS service to pull the new image..."
aws ecs update-service \
  --cluster "${ECS_CLUSTER}" \
  --service "${ECS_SERVICE}" \
  --force-new-deployment \
  --region "${AWS_REGION}" \
  --output table \
  --query 'service.{name:serviceName,status:status,desired:desiredCount,running:runningCount}'

echo ""
echo "Deploy kicked off. Watch rollout in the AWS Console → ECS →"
echo "cluster '${ECS_CLUSTER}' → service '${ECS_SERVICE}' → Deployments tab."
echo "Tail logs: aws logs tail /ecs/${ECS_SERVICE} --follow --region ${AWS_REGION}"
