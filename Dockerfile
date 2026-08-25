FROM node:20-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_BUILD_CPUS=1
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_BUILD_CPUS=${NEXT_BUILD_CPUS} \
    NODE_OPTIONS=--max-old-space-size=1536 \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
# LIBREOFFICE RENDERS THE SALES MATERIALS (Anir, Aug 25: a deck's preview must
# look exactly like the downloaded file). /api/offerings/[id]/materials/pdf
# shells out to soffice to print PowerPoint and Word files to PDF; without it
# the route answers 501 and the viewer falls back to the old in-browser
# reconstructions. Impress+Writer only (no Calc/Base), plus the font families
# decks actually use — without fonts a headless conversion draws tofu.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libreoffice-impress libreoffice-writer \
      fonts-liberation fonts-dejavu-core fontconfig && \
    rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
