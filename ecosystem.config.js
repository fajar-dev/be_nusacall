module.exports = {
  apps: [
    {
      name: "hono-be",
      script: "dist/index.js",
      interpreter: "bun",
      env: {
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
  ],
};
