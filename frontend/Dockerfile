# syntax=docker/dockerfile:1.7
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund --foreground-scripts --loglevel=warn
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-save typescript @types/react @types/node --no-audit --no-fund --foreground-scripts --loglevel=warn

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3001

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3001"]
