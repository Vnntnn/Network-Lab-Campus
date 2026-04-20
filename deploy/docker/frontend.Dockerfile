FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_API_BASE_URL=/api/v1
ARG VITE_WS_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WS_BASE_URL=${VITE_WS_BASE_URL}

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine

COPY deploy/nginx/frontend.docker.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
