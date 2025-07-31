#!/bin/bash

echo "🔍 DevContainer 환경변수 사전 체크..."

# 환경변수 확인
if [[ -n "$CLAUDE_HOST_PROJECTS" ]]; then
    echo "✅ CLAUDE_HOST_PROJECTS 설정됨: $CLAUDE_HOST_PROJECTS"
    
    # 경로 존재 확인
    if [[ -d "$CLAUDE_HOST_PROJECTS" ]]; then
        echo "✅ 경로 존재 확인됨"
        
        # devcontainer-mount.json 생성 (마운트 포함)
        cat > .devcontainer/devcontainer-mount.json << 'EOF'
{
  "mounts": [
    "source=${localEnv:CLAUDE_HOST_PROJECTS},target=/host/projects,type=bind,consistency=cached"
  ]
}
EOF
        echo "📦 마운트 설정이 활성화됩니다"
    else
        echo "⚠️  경로가 존재하지 않습니다: $CLAUDE_HOST_PROJECTS"
        echo "💡 폴더를 생성하거나 다른 경로로 설정하세요"
        
        # 빈 마운트 설정
        cat > .devcontainer/devcontainer-mount.json << 'EOF'
{
  "mounts": []
}
EOF
        echo "📦 마운트 없이 진행됩니다"
    fi
else
    echo "ℹ️  CLAUDE_HOST_PROJECTS 환경변수가 설정되지 않았습니다"
    
    # 빈 마운트 설정
    cat > .devcontainer/devcontainer-mount.json << 'EOF'
{
  "mounts": []
}
EOF
    echo "📦 마운트 없이 진행됩니다"
fi

echo "🎯 환경변수 체크 완료!"