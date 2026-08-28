FROM node:22-trixie-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-trixie-slim AS builder
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

FROM node:22-trixie-slim AS runner
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
#
# DEBIAN 13, NOT 12 (Krishna, Aug 28: "the latest image still have many
# vulnarabilities"). That round got it to 74, and then it stopped moving,
# because 65 of the 99 package findings report fixedInVersion: NotAvailable.
# There was no patch left to install: bookworm simply freezes these packages
# at versions the CVEs were written against, and dist-upgrade cannot conjure
# a fix Debian has not published. Every one of the four Criticals was in
# that set.
#
# Trixie moves the floor instead of chasing patches on top of an old one:
#
#     perl    5.36.0  ->  5.40.1     (3 of the 4 Criticals are perl)
#     tiff    4.5.0   ->  4.7.0      (the 4th Critical is libtiff)
#     expat   2.5.0   ->  2.7.1      (18 findings)
#     libreoffice 7.4.7 -> 25.2.3
#
# All three stages move together so the standalone build and the runtime
# share a glibc. No dependency here is a native module, so there is no ABI
# to break: the only compiled thing in the image is Node itself.
RUN apt-get update && \
    apt-get dist-upgrade -y && \
    apt-get install -y --no-install-recommends \
      libreoffice-impress libreoffice-writer \
      fonts-liberation fonts-dejavu-core fontconfig && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
# THE RUNTIME NEVER RUNS NPM. The base ships npm with its own vendored
# node_modules (sigstore, brace-expansion, ip-address...), and Inspector
# flags every one of them against an image whose CMD is plain `node
# server.js`. Ship the runtime, not the package manager.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
