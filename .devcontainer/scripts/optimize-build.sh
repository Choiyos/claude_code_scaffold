#!/bin/bash
# ============================================
# BUILD OPTIMIZATION SCRIPT - Claude Code Dev Environment
# ============================================
# This script optimizes Docker builds for faster rebuilds

set -e

echo "🚀 Optimizing Docker build for Claude Code Dev Environment..."

# ============================================
# BUILDKIT CONFIGURATION
# ============================================

echo "🔧 Configuring BuildKit..."

# Enable BuildKit
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Configure BuildKit
mkdir -p ~/.docker
cat > ~/.docker/buildkitd.toml <<EOF
[worker.oci]
  max-parallelism = 4

[registry."docker.io"]
  mirrors = ["mirror.gcr.io"]

[registry."ghcr.io"]
  mirrors = ["ghcr.io"]

[[cache]]
  type = "local"
  path = "/tmp/buildkit-cache"

[[cache]]
  type = "registry"
  ref = "ghcr.io/claude-code/buildcache"
EOF

# ============================================
# CACHE WARMING
# ============================================

echo "🔥 Warming build cache..."

# Pull base images
docker pull ubuntu:22.04 || true
docker pull node:20-slim || true
docker pull python:3.11-slim || true
docker pull golang:1.21-alpine || true
docker pull rust:1.75-slim || true

# ============================================
# LAYER CACHE OPTIMIZATION
# ============================================

echo "📦 Optimizing layer cache..."

# Create cache directories
mkdir -p /tmp/buildkit-cache
mkdir -p /tmp/.buildx-cache

# Set cache permissions
chmod -R 777 /tmp/buildkit-cache
chmod -R 777 /tmp/.buildx-cache

# ============================================
# BUILD EXECUTION
# ============================================

echo "🏗️  Building optimized image..."

# Build with cache mount
cd /workspace/.devcontainer

# Multi-platform build setup
docker buildx create --name claude-builder --use --driver docker-container --platform linux/amd64,linux/arm64 || true
docker buildx use claude-builder

# Build with all optimizations
time docker buildx build \
  --platform linux/amd64 \
  --cache-from type=local,src=/tmp/.buildx-cache \
  --cache-from type=registry,ref=ghcr.io/claude-code/dev-environment:cache \
  --cache-to type=local,dest=/tmp/.buildx-cache-new,mode=max \
  --cache-to type=registry,ref=ghcr.io/claude-code/dev-environment:cache,mode=max \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --build-arg VARIANT=ubuntu-22.04 \
  --build-arg NODE_VERSION=20 \
  --build-arg PYTHON_VERSION=3.11 \
  --build-arg GO_VERSION=1.21 \
  --build-arg RUST_VERSION=1.75 \
  --build-arg USER_UID=1000 \
  --build-arg USER_GID=1000 \
  --progress=plain \
  --load \
  -t claude-code-dev-environment:optimized \
  -f Dockerfile \
  .

# Move cache
rm -rf /tmp/.buildx-cache
mv /tmp/.buildx-cache-new /tmp/.buildx-cache

# ============================================
# PERFORMANCE METRICS
# ============================================

echo "📊 Build performance metrics..."

# Show image size
docker images claude-code-dev-environment:optimized --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"

# Show layer information
docker history claude-code-dev-environment:optimized --no-trunc --format "table {{.CreatedBy}}\t{{.Size}}"

# ============================================
# CLEANUP
# ============================================

echo "🧹 Cleaning up..."

# Remove dangling images
docker image prune -f

# Clean BuildKit cache (optional - keeps recent cache)
docker buildx prune --keep-storage 10GB

echo "✅ Build optimization completed!"
echo ""
echo "💡 Tips for faster rebuilds:"
echo "  1. Place frequently changing files at the end of Dockerfile"
echo "  2. Use multi-stage builds to parallelize work"
echo "  3. Leverage BuildKit cache mounts for package managers"
echo "  4. Use .dockerignore to exclude unnecessary files"
echo "  5. Consider using remote cache for team sharing"