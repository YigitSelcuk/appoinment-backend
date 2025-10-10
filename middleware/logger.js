const fs = require('fs');
const path = require('path');

// Log dizinini oluştur
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Log seviyeleri
const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
  SECURITY: 'SECURITY'
};

// Log yazma fonksiyonu
const writeLog = (level, message, metadata = {}) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...metadata
  };
  
  const logString = JSON.stringify(logEntry) + '\n';
  
  // Console'a yazdır (development)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[${timestamp}] ${level}: ${message}`, metadata);
  }
  
  // Dosyaya yazdır
  const logFile = path.join(logDir, `${level.toLowerCase()}.log`);
  fs.appendFileSync(logFile, logString);
  
  // Genel log dosyasına da yazdır
  const generalLogFile = path.join(logDir, 'app.log');
  fs.appendFileSync(generalLogFile, logString);
};

// Security logger middleware
const securityLogger = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Güvenlik olaylarını logla
    if (res.statusCode === 401 || res.statusCode === 403) {
      writeLog(LOG_LEVELS.SECURITY, 'Unauthorized access attempt', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        timestamp: new Date().toISOString()
      });
    }
    
    // Rate limit aşımlarını logla
    if (res.statusCode === 429) {
      writeLog(LOG_LEVELS.SECURITY, 'Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

// Request logger middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    writeLog(LOG_LEVELS.INFO, 'HTTP Request', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  });
  
  next();
};

// Log temizleme (eski logları sil)
const cleanupLogs = () => {
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 gün
  const now = Date.now();
  
  fs.readdir(logDir, (err, files) => {
    if (err) return;
    
    files.forEach(file => {
      const filePath = path.join(logDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
};

// Her gün log temizliği yap
setInterval(cleanupLogs, 24 * 60 * 60 * 1000);

module.exports = {
  LOG_LEVELS,
  writeLog,
  securityLogger,
  requestLogger,
  cleanupLogs
};