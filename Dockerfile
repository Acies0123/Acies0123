FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production DATA_FILE=/data/db.json PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]
