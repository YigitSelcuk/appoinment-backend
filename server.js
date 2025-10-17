require('dotenv').config();

// Environment validation
const { validateEnvironment } = require('./config/env-validation');
validateEnvironment();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const {
  apiLimiter,
  securityHeaders,
  ipWhitelist,
  sessionConfig,
  detectSuspiciousActivity,
  requestFrequencyAnalysis,
  protectSensitiveEndpoints
} = require('./middleware/security');

const {
  securityLogger,
  requestLogger
} = require('./middleware/logger');

// Merkezi veritabanı bağlantısı
const { testConnection, promisePool: db } = require('./config/database');

// Reminder Service
const reminderService = require('./services/reminderService');
const { setIO } = require('./utils/socket');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

// Trust proxy ayarı
app.set('trust proxy', 1);

// CORS yapılandırması - İlk sırada olmalı
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'http://192.168.0.36:3000', // VPN üzerinden erişim için
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ].filter(Boolean);
    
    // Development ortamında daha esnek CORS
    if (process.env.NODE_ENV !== 'production') {
      // VPN IP aralıkları için esnek kontrol
      if (!origin || allowedOrigins.includes(origin) || 
          (origin && origin.match(/^http:\/\/192\.168\.\d+\.\d+:\d+$/)) ||
          (origin && origin.match(/^http:\/\/10\.\d+\.\d+\.\d+:\d+$/))) {
        callback(null, true);
      } else {
        callback(null, true); // Development'ta tüm origin'lere izin ver
      }
    } else {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS policy violation'));
      }
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['set-cookie']
};

app.use(cors(corsOptions));

// Cookie parser middleware
app.use(cookieParser());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware
app.use(session(sessionConfig));

// Logging middleware'leri
app.use(requestLogger);
app.use(securityLogger);

// Advanced Security middleware'leri (sıralama önemli)
app.use(detectSuspiciousActivity); // Suspicious activity detection
app.use(requestFrequencyAnalysis); // Request frequency analysis
app.use(apiLimiter); // Rate limiting
app.use(securityHeaders); // Helmet güvenlik başlıkları
app.use(ipWhitelist); // IP whitelist kontrolü
app.use(protectSensitiveEndpoints); // Sensitive endpoint protection

// Socket.IO bağlantı yönetimi
setIO(io); // Socket instance'ını utils/socket.js'e kaydet
const SocketManager = require('./Socket');
new SocketManager(io);

// Static dosya servisi (resimler için) - Güvenli CORS ile
app.use('/uploads', (req, res, next) => {
  // Sadece GET isteklerine izin ver
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  // Güvenli CORS headers
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'https://yourdomain.com',
    'https://www.yourdomain.com'
  ].filter(Boolean);
  
  const origin = req.get('Origin');
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Cross-Origin-Resource-Policy', 'same-site');
  res.header('Cache-Control', 'public, max-age=3600'); // 1 saat cache
  
  // File type kontrolü
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx'];
  const fileExtension = path.extname(req.path).toLowerCase();
  
  if (fileExtension && !allowedExtensions.includes(fileExtension)) {
    return res.status(403).json({ message: 'File type not allowed' });
  }
  
  next();
}, express.static(path.join(__dirname, 'uploads'), {
  dotfiles: 'deny', // .htaccess gibi dosyaları engelle
  index: false, // Directory listing'i engelle
  maxAge: '1h' // Cache süresi
}));

// Veritabanı bağlantısını test et
testConnection();

// Health check endpoint (production için)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API status endpoint (sadece authenticated users için)
app.get('/api/status', (req, res) => {
  // Production'da bu endpoint'i kaldırabilirsiniz
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' });
  }
  
  res.json({ 
    message: 'API çalışıyor',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/chat', require('./routes/chat')); // Yeni temiz chat sistemi
app.use('/api/requests', require('./routes/requests'));
app.use('/api/activities', require('./routes/activities'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/users', require('./routes/users'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/sms', require('./routes/sms'));
app.use('/api/email', require('./routes/email'));
app.use('/api/cvs', require('./routes/cvs'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/rehber', require('./routes/rehber'));
app.use('/api/departments', require('./routes/departments'));

// 404 handler - Bilinmeyen endpoint'ler için
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint bulunamadı',
    code: 'ENDPOINT_NOT_FOUND'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global Error:', err);
  
  // CORS hatası
  if (err.message === 'CORS policy violation') {
    return res.status(403).json({
      success: false,
      message: 'CORS policy ihlali',
      code: 'CORS_VIOLATION'
    });
  }
  
  // JWT hatası
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Geçersiz token',
      code: 'INVALID_TOKEN'
    });
  }
  
  // Validation hatası
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Veri doğrulama hatası',
      code: 'VALIDATION_ERROR'
    });
  }
  
  // Database hatası
  if (err.code && err.code.startsWith('ER_')) {
    return res.status(500).json({
      success: false,
      message: 'Veritabanı hatası',
      code: 'DATABASE_ERROR'
    });
  }
  
  // Genel hata
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Sunucu hatası' 
      : err.message,
    code: 'INTERNAL_SERVER_ERROR'
  });
});

server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
  console.log('Socket.IO WebSocket desteği aktif');
  console.log('Randevu hatırlatma servisi aktif');
});