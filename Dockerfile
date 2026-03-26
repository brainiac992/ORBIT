FROM node:20-slim

WORKDIR /app

# Copy root package files and install
COPY package.json ./
RUN npm install

# Copy client package files and install
COPY client/package.json client/
RUN cd client && npm install

# Copy all source
COPY . .

# Build frontend
RUN cd client && npm run build

EXPOSE ${PORT:-3000}

CMD ["npm", "start"]
