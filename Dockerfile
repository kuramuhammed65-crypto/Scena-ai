FROM node:20-slim
RUN apt-get update && apt-get install -y zip && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10
WORKDIR /app
COPY . .
RUN pnpm install
RUN pnpm run build
RUN cp -r artifacts/scene-breakdown/dist/public artifacts/api-server/public
WORKDIR /app/artifacts/api-server
EXPOSE 3000
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]