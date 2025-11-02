#!/bin/zsh

cd js
npm install
npm run build
cd ..

cd web
npm install
npm run build
cd ..

cd web
docker build -t kasstamp-web:local .
cd ..

docker run --rm \
  --name kasstamp-web-test \
  -p 8080:80 \
  kasstamp-web:local
