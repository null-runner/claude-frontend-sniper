FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json .

# Install dependencies
RUN npm install

# Copy server code
COPY index.js .

# MCP servers use stdio, no ports to expose
ENTRYPOINT ["node", "index.js"]
