# ---------- 阶段 1: 构建 Rust 后端 ----------
FROM rust:1.96-slim AS server-build
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock* ./
COPY server server
# 依赖预热层（缓存加速）
RUN mkdir -p src && echo "fn main(){}" > src/main.rs 2>/dev/null || true
RUN cargo build --release -p jing-admin-server --no-default-features --features sqlite,postgres 2>/dev/null || true
RUN rm -rf src
COPY . .
RUN touch server/src/main.rs && cargo build --release -p jing-admin-server --no-default-features --features sqlite,postgres

# ---------- 阶段 2: 构建前端 ----------
FROM node:22-slim AS web-build
WORKDIR /app
COPY web/package.json web/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY web .
RUN npm run build

# ---------- 阶段 3: 运行 ----------
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=server-build /app/target/release/jing-admin-server ./server
COPY --from=web-build /app/dist ./web
ENV DATABASE_URL=sqlite://./data/jing_admin.db?mode=rwc
ENV PORT=9800
ENV SERVE_STATIC=./web
RUN mkdir -p data/uploads
EXPOSE 9800
HEALTHCHECK --interval=30s --timeout=3s CMD curl -sf http://127.0.0.1:9800/api/health || exit 1
CMD ["./server"]
