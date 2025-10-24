# 🚀 KasStamp Web - Build & Deploy

## 📦 Build Process

### Step 1: Build JS Packages (when packages change)

```bash
cd js
npm run build
```

### Step 2: Build Web App

```bash
cd web
npm run build
```

This creates the `dist/` folder with all static files.

### Step 3: Build Docker Image

```bash
cd web
docker build -t registry.gitlab.com/kasdag/kasstamp_web:latest .
```

### Step 4: Push to GitLab Registry

```bash
docker push registry.gitlab.com/kasdag/kasstamp_web:latest
```

---

## 🎯 Quick Commands

### Full build (from monorepo root):

```bash
# Build packages and web
cd js && npm run build && cd ../web && npm run build

# Build and push Docker image
cd web
docker build -t registry.gitlab.com/kasdag/kasstamp_web:latest .
docker push registry.gitlab.com/kasdag/kasstamp_web:latest
```

### Quick rebuild (when only web changed):

```bash
cd web
npm run build
docker build -t registry.gitlab.com/kasdag/kasstamp_web:latest .
docker push registry.gitlab.com/kasdag/kasstamp_web:latest
```

---

## 🧪 Test Docker Image Locally

```bash
# Run locally
docker run -d --name kasstamp-web-test -p 8080:80 registry.gitlab.com/kasdag/kasstamp_web:latest

# Test
curl http://localhost:8080
curl http://localhost:8080/health

# Stop
docker stop kasstamp-web-test
docker rm kasstamp-web-test
```

---

## 📋 Deploy to Server

### Prerequisites

1. Docker network created: `docker network create web`
2. Your nginx container on the network: `docker network connect web nginx-proxy`
3. Logged into GitLab: `docker login registry.gitlab.com`

### Deploy

```bash
# Pull latest image
docker pull registry.gitlab.com/kasdag/kasstamp_web:latest

# Stop old container
docker stop kasstamp-web 2>/dev/null || true
docker rm kasstamp-web 2>/dev/null || true

# Run new container (no port exposure - uses Docker network)
docker run -d \
  --name kasstamp-web \
  --restart unless-stopped \
  --network web \
  registry.gitlab.com/kasdag/kasstamp_web:latest

# Verify
docker exec nginx-proxy curl http://kasstamp-web/health
```

---

## 🔧 nginx Configuration

Add this to your nginx container's config:

```nginx
server {
    listen 443 ssl http2;
    server_name kasstamp.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://kasstamp-web:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Reload: `docker exec nginx-proxy nginx -s reload`

---
