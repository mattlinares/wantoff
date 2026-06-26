# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /repo

COPY package.json ./
COPY apps/backend/package.json apps/backend/package.json
RUN npm install --workspace=@mealmate/backend

COPY apps/backend apps/backend
RUN npm run build --workspace=@mealmate/backend
RUN npm run prisma:generate --workspace=@mealmate/backend

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/apps/backend/node_modules apps/backend/node_modules
COPY --from=build /repo/apps/backend/dist apps/backend/dist
COPY --from=build /repo/apps/backend/prisma apps/backend/prisma
COPY --from=build /repo/apps/backend/package.json apps/backend/package.json

WORKDIR /repo/apps/backend
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
