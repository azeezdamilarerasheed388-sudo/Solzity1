FROM node:20-bookworm

WORKDIR /usr/src/app

# Copy package files
COPY package.json yarn.lock ./

# Copy application source and keys (including master mnemonic)
COPY . .

# Install dependencies
RUN yarn install --frozen-lockfile --ignore-engines --ignore-scripts

ENV PORT=10000
EXPOSE 10000

# Start the app
CMD [ "node", "server.js" ]