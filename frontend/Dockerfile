# syntax=docker/dockerfile:1

# ---- build stage: produce the static Vite bundle ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# The API base URL is inlined into the bundle at BUILD time, so it must point at
# a URL the browser can reach (the host-published backend port) — never the
# `backend` compose service name. Vite reads it from .env.production during the
# production `vite build`.
ARG VITE_API_BASE_URL=http://localhost:3000
RUN echo "VITE_API_BASE_URL=$VITE_API_BASE_URL" > .env.production
RUN npm run build

# ---- runtime stage: serve the static files with nginx ----
FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
