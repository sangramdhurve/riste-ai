# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- Runtime ----
FROM base AS runner
ENV NODE_ENV=production
# Standalone server must bind to 0.0.0.0 so Caddy / other containers can reach it.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Next.js standalone output (for riste-web)
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Source + deps needed by the worker (riste-worker overrides the command)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
# tsconfig is REQUIRED at runtime: the worker runs via tsx and resolves the
# "@/..." path aliases from it.
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3000
CMD ["node", "server.js"]
