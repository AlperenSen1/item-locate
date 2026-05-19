FROM oven/bun:latest

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY . .

RUN bun install

EXPOSE 3000

CMD ["bun", "run", "--cwd", "apps/api", "dev"]
