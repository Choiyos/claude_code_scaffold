# 🔧 Docker 완전 정리 및 DevContainer 재빌드 가이드

## 🚨 문제 상황
```
ERROR: failed to solve: process "/bin/sh -c npm install -g vibetunnel@1.0.0-beta.15.1" 
did not complete successfully: exit code: 1
```

현재 Dockerfile에는 vibetunnel 설치 명령이 없지만, Docker 캐시나 임시 파일에서 여전히 시도하고 있습니다.

## 📋 단계별 해결 방법

### 1️⃣ VS Code 완전 종료
```
모든 VS Code 창 닫기
```

### 2️⃣ PowerShell에서 Docker 완전 정리
```powershell
# 1. 모든 컨테이너 중지 및 삭제
docker stop $(docker ps -aq)
docker rm $(docker ps -aq)

# 2. DevContainer 관련 이미지 삭제
docker images | findstr vsc-claude_code_scaffold
# 위에서 나온 IMAGE ID들을 복사해서 삭제:
docker rmi [IMAGE_ID1] [IMAGE_ID2] [IMAGE_ID3] --force

# 3. 모든 이미지와 캐시 완전 정리
docker system prune -a --volumes --force
docker builder prune --all --force

# 4. DevContainer 캐시 정리
docker volume ls | findstr vscode
# vscode 관련 볼륨들 삭제:
docker volume rm [VOLUME_NAME1] [VOLUME_NAME2] --force
```

### 3️⃣ VS Code DevContainer 캐시 정리
```
1. VS Code 다시 열기
2. Ctrl+Shift+P
3. "Dev Containers: Clean Up Dev Containers" 실행
```

### 4️⃣ 완전 새로 빌드
```
1. 프로젝트 폴더 열기
2. Ctrl+Shift+P
3. "Dev Containers: Rebuild Container Without Cache" 실행
```

## 🎯 예상 결과

성공 시:
```
✅ Node.js 20.x 설치 완료
✅ Claude CLI 설치 완료 
✅ MCP 서버 설치 완료
🌐 vibetunnel 설치 상태 확인...
📦 vibetunnel 백업 설치 시도 중...
✅ npm으로 vibetunnel 설치 성공!
```

## 🆘 만약 여전히 실패한다면

1. **완전히 새로운 폴더에 클론**:
   ```bash
   cd C:\Users\User\Seb\git\
   git clone . claude_code_scaffold_clean
   cd claude_code_scaffold_clean
   # VS Code에서 이 새로운 폴더 열기
   ```

2. **Docker Desktop 재시작**

3. **Windows 재부팅**

## 📝 추가 정보

- 현재 Dockerfile에는 vibetunnel 설치 명령이 없습니다
- 문제는 캐시된 Docker layers에 있습니다
- 위 방법으로 99% 해결됩니다