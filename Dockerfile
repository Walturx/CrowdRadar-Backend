# Multi-stage build: compile TypeScript, then ship only production dependencies and dist/.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json .sequelizerc ./
# sequelize-cli is a production dependency: the container runs the migrations at start-up (`npm run db:migrate`).
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY database ./database
USER node
# PUERTO defaults to 3000 (see .env.example); compose maps it.
EXPOSE 3000
CMD ["node", "dist/server.js"]
