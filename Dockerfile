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
# sequelize-cli stays in the production dependencies on purpose: the one-shot `migrate` service of docker-compose
# runs `npm run db:migrate` from this same image. The default CMD below only starts the server and never migrates.
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY database ./database
USER node
# PUERTO defaults to 3000 (see .env.example); compose maps it.
EXPOSE 3000
CMD ["node", "dist/server.js"]
