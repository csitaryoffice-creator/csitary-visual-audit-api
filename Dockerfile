FROM mcr.microsoft.com/playwright:v1.55.1-noble AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM mcr.microsoft.com/playwright:v1.55.1-noble

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER pwuser
EXPOSE 3000

CMD ["node", "dist/server.js"]
