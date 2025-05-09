# The command line, packaged so a shop floor terminal does not need a
# toolchain on it. There is no server here and nothing listens on a port: the
# image runs one command and exits, with the workspace mounted in.
#
# Two stages. The first has the dev dependencies and the sources and produces
# dist/. The second has neither, which is the point: a shop floor image with a
# typescript compiler and a test runner in it is a larger thing to keep patched
# than it needs to be.

FROM node:20.18.2-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Drop everything the build needed and keep only what the program runs on.
RUN npm ci --omit=dev

FROM node:20.18.2-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
# The workspace is mounted here. Nothing inside the image is written to.
ENV ARC_HOME=/workspace

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# The node image already carries an unprivileged user. The records belong to
# whoever mounted them, not to root.
USER node

ENTRYPOINT ["node", "/app/dist/cli/main.js"]
CMD ["--help"]
