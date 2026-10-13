FROM node:20-bullseye-slim

# Install OpenJDK and GCC for Java and C runner support
RUN apt-get update && \
    apt-get install -y --no-install-recommends default-jdk gcc libc6-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
