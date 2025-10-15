module.exports = {
  apps: [
    {
      name: 'appointment-backend',
      script: './server.js',
      instances: '1', // CPU çekirdek sayısı kadar instance
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 5000,
        TZ: 'Europe/Istanbul'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        TZ: 'Europe/Istanbul'
      },
      // Monitoring ve logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Memory ve CPU limitleri
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      
      // Auto restart ayarları
      autorestart: true,
      watch: false, // Production'da watch kapalı olmalı
      ignore_watch: ['node_modules', 'logs', 'uploads'],
      
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Health check
      health_check_grace_period: 3000,
      
      // Environment specific settings
      node_args: '--max-old-space-size=2048',
      
      // Cron restart (her gece 3:00'da restart)
      cron_restart: '0 3 * * *',
      
      // Merge logs
      merge_logs: true,
      
      // Time zone
      time: true
    }
  ],
  
  deploy: {
    production: {
      user: 'root',
      host: ['your-server-ip'], // Sunucu IP'sini buraya yazın
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/appointment-app.git', // Git repo URL'ini buraya yazın
      path: '/var/www/appointment-app',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      'ssh_options': 'StrictHostKeyChecking=no'
    }
  }
};