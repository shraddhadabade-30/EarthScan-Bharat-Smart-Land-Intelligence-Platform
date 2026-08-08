# Build stage
FROM node:20-alpine AS build
WORKDIR /app

# Copy dependency configs
COPY package*.json ./
RUN npm install

# Copy all source files
COPY . .

# Set API URL build argument to empty string for relative paths
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# Build the production bundle
RUN npm run build

# Nginx runtime stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
