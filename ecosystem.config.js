// PM2 ecosystem configuration for Rizqun API
//
// Usage:
//   pm2 start ecosystem.config.js --env production
//   pm2 save
//   pm2 startup  (enables auto-start on system boot)
//
// Log rotation (install once):
//   pm2 install pm2-logrotate
//   pm2 set pm2-logrotate:max_size 10M
//   pm2 set pm2-logrotate:retain 30
//   pm2 set pm2-logrotate:compress true

module.exports = {
  apps: [
    {
      name: 'rizqun-api',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '500M',

      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // Logging
      out_file: './logs/rizqun-out.log',
      error_file: './logs/rizqun-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Graceful shutdown
      kill_timeout: 10000,
      wait_ready: false,
      listen_timeout: 10000,
    },
  ],
};
