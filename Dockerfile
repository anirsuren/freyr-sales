FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
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

FROM node:22-bookworm-slim AS runner
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
# PATCH THE OS BEFORE SHIPPING IT (Krishna, Aug 27: "there are lot package
# vulnerability issues in the container. Total 140 findings... this has to
# remediate first before going to the production"). Inspector's pile — perl,
# libtiff, gnutls, openssl — is almost entirely LibreOffice's OWN dependency
# tree sitting at whatever version the base image froze at. dist-upgrade
# pulls every published Debian security patch into the one stage that
# actually ships; the build stages ship nothing. Node 20 also left LTS in
# April, hence 22 above.
RUN apt-get update && \
    apt-get dist-upgrade -y && \
    apt-get install -y --no-install-recommends \
      libreoffice-impress libreoffice-writer \
      fonts-liberation fonts-dejavu-core fontconfig && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
