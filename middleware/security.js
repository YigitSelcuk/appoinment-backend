const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');

// Rate limiting - Brute force saldırılarına karşı
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 dakika
  max: 5, // 5 dakikada maksimum 5 deneme
  message: {
    success: false,
    message: 'Çok fazla giriş denemesi yapıldı. 5 dakika sonra tekrar deneyin.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Başarılı girişleri sayma
});

// Genel API rate limiting
const apiLimiter = rateLimit({
  windowMs: 5 * 1000, // 5 saniye
  max: 60, // 5 saniyede maksimum 60 istek
  message: {
    success: false,
    message: 'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Mesajlaşma için özel rate limiting
const messagingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 dakika
  max: 60, // 1 dakikada maksimum 60 mesaj
  message: {
    success: false,
    message: 'Çok fazla mesaj gönderildi. Lütfen daha yavaş yazın.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Helmet güvenlik başlıkları
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'strict-dynamic'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.BACKEND_URL, process.env.FRONTEND_URL].filter(Boolean),
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    },
  },
  crossOriginResourcePolicy: { policy: "same-site" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginEmbedderPolicy: { policy: "require-corp" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
});

// Input validation
const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Geçerli bir email adresi giriniz')
    .isLength({ max: 255 })
    .withMessage('Email adresi çok uzun'),
  
  body('password')
    .isLength({ min: 1, max: 128 })
    .withMessage('Şifre gereklidir'),
];

const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('İsim en az 2, en fazla 100 karakter olmalıdır')
    .matches(/^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/)
    .withMessage('İsim sadece harf ve boşluk içerebilir'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Geçerli bir email adresi giriniz')
    .isLength({ max: 255 })
    .withMessage('Email adresi çok uzun'),
  
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Şifre en az 8, en fazla 128 karakter olmalıdır')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Şifre en az bir küçük harf, bir büyük harf, bir rakam ve bir özel karakter içermelidir'),
  
  body('role')
    .optional()
    .isIn(['patient', 'doctor', 'admin'])
    .withMessage('Geçersiz rol')
];

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Girilen bilgilerde hata var',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg
      }))
    });
  }
  next();
};

// IP whitelist middleware (belediye için)
const ipWhitelist = (req, res, next) => {
  // Geliştirme ortamında tüm IP'lere izin ver
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }
  
  // Prodüksiyon ortamında sadece belirli IP'lere izin ver
  const allowedIPs = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : [];
  const clientIP = req.ip || req.connection.remoteAddress;
  
  if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
    return res.status(403).json({
      success: false,
      message: 'Bu IP adresinden erişim izni yok'
    });
  }
  
  next();
};

// JWT Authentication middleware (Enhanced Security)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Erişim token\'ı gerekli'
    });
  }

  // Token blacklist kontrolü
  if (tokenBlacklist.has(token)) {
    return res.status(401).json({
      success: false,
      message: 'Token geçersiz kılınmış',
      code: 'TOKEN_BLACKLISTED'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token süresi dolmuş',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(403).json({
        success: false,
        message: 'Geçersiz token'
      });
    }
    
    // Access token kontrolü
    if (user.type !== 'access') {
      return res.status(403).json({
        success: false,
        message: 'Geçersiz token türü'
      });
    }
    
    req.user = user;
    next();
  });
};

// Rate Limiting Middleware
const rateLimitStore = new Map();

// JWT Token Blacklist
const tokenBlacklist = new Set();

// Suspicious IP tracking
const suspiciousIPs = new Map();
const blockedIPs = new Set();

// API endpoint protection
const sensitiveEndpoints = [
  '/api/users',
  '/api/admin',
  '/api/auth/register',
  '/api/appointments/admin',
  '/api/tasks/admin'
];

// Request pattern analysis
const requestPatterns = new Map();

// Token blacklist temizleme (her 1 saatte bir)
setInterval(() => {
  // Expired tokenları blacklist'ten temizle
  // Bu basit implementasyon, production'da Redis kullanılmalı
  if (tokenBlacklist.size > 10000) {
    tokenBlacklist.clear();
  }
}, 60 * 60 * 1000);

// Suspicious activity detection
const detectSuspiciousActivity = (req, res, next) => {
  const clientIP = req.ip;
  const userAgent = req.get('User-Agent') || '';
  const endpoint = req.originalUrl;
  
  // Blocked IP kontrolü
  if (blockedIPs.has(clientIP)) {
    return res.status(403).json({
      success: false,
      message: 'IP adresi engellenmiş',
      code: 'IP_BLOCKED'
    });
  }
  
  // Suspicious patterns
  const suspiciousPatterns = [
    /\.\.\//, // Path traversal
    /<script/i, // XSS attempts
    /union.*select/i, // SQL injection
    /exec\(/i, // Code injection
    /eval\(/i, // Code injection
    /javascript:/i, // XSS
    /vbscript:/i, // XSS
    /onload=/i, // XSS
    /onerror=/i // XSS
  ];
  
  const requestData = JSON.stringify({
    url: req.originalUrl,
    query: req.query,
    body: req.body,
    headers: req.headers
  });
  
  // Suspicious pattern kontrolü
  const isSuspicious = suspiciousPatterns.some(pattern => 
    pattern.test(requestData) || pattern.test(userAgent)
  );
  
  if (isSuspicious) {
    // Suspicious activity kaydet
    const suspiciousData = suspiciousIPs.get(clientIP) || { count: 0, firstSeen: Date.now() };
    suspiciousData.count++;
    suspiciousData.lastSeen = Date.now();
    suspiciousIPs.set(clientIP, suspiciousData);
    
    // 5 suspicious request sonrası IP'yi engelle
    if (suspiciousData.count >= 5) {
      blockedIPs.add(clientIP);
      console.log(`🚨 IP blocked due to suspicious activity: ${clientIP}`);
    }
    
    return res.status(400).json({
      success: false,
      message: 'Geçersiz istek tespit edildi',
      code: 'SUSPICIOUS_REQUEST'
    });
  }
  
  next();
};

// Request frequency analysis
const requestFrequencyAnalysis = (req, res, next) => {
  const clientIP = req.ip;
  const now = Date.now();
  const windowMs = 30 * 1000; // 30 saniye
  
  const pattern = requestPatterns.get(clientIP) || { requests: [], blocked: false };
  
  // Eski requestleri temizle
  pattern.requests = pattern.requests.filter(time => now - time < windowMs);
  pattern.requests.push(now);
  
  // 30 saniyede 360'tan fazla request = suspicious (12/s üstü)
  if (pattern.requests.length > 360) {
    pattern.blocked = true;
    blockedIPs.add(clientIP);
    console.log(`🚨 IP blocked due to high frequency requests: ${clientIP}`);
    
    return res.status(429).json({
      success: false,
      message: 'Çok fazla istek gönderildi',
      code: 'HIGH_FREQUENCY_BLOCKED'
    });
  }
  
  requestPatterns.set(clientIP, pattern);
  next();
};

// Sensitive endpoint protection
const protectSensitiveEndpoints = (req, res, next) => {
  const endpoint = req.originalUrl;
  const method = req.method;
  
  if (endpoint.includes('/admin')) {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için admin yetkisi gerekli',
        code: 'ADMIN_REQUIRED'
      });
    }
  }
  
  const isSensitive = sensitiveEndpoints.some(sensitive => 
    endpoint.startsWith(sensitive)
  );
  
  if (isSensitive) {
    if (['POST', 'PUT'].includes(method)) {
      const contentTypeHeader = req.get('Content-Type') || '';
      const contentType = contentTypeHeader.toLowerCase();
      const isJSON = contentType.includes('application/json');
      const isMultipart = contentType.includes('multipart/form-data');
      const isForm = contentType.includes('application/x-www-form-urlencoded');

      if (!(isJSON || isMultipart || isForm)) {
        return res.status(400).json({
          success: false,
          message: 'Geçersiz Content-Type',
          code: 'INVALID_CONTENT_TYPE'
        });
      }
      
      const contentLength = parseInt(req.get('Content-Length') || '0');
      if (isJSON || isForm) {
        if (contentLength > 1024 * 1024) {
          return res.status(413).json({
            success: false,
            message: 'İstek boyutu çok büyük',
            code: 'REQUEST_TOO_LARGE'
          });
        }
      } else if (isMultipart) {
        if (contentLength > 6 * 1024 * 1024) {
          return res.status(413).json({
            success: false,
            message: 'İstek boyutu çok büyük',
            code: 'REQUEST_TOO_LARGE'
          });
        }
      }
    }
  }
  
  next();
};

// Cleanup functions
const cleanupSecurityData = () => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 saat
  
  // Eski suspicious IP kayıtlarını temizle
  for (const [ip, data] of suspiciousIPs.entries()) {
    if (now - data.lastSeen > maxAge) {
      suspiciousIPs.delete(ip);
    }
  }
  
  // Eski request pattern kayıtlarını temizle
  for (const [ip, pattern] of requestPatterns.entries()) {
    if (pattern.requests.length === 0) {
      requestPatterns.delete(ip);
    }
  }
  
  // Blocked IP'leri 24 saat sonra temizle (manuel unblock için)
  // Production'da bu daha uzun olabilir
};

// Her saat cleanup çalıştır
setInterval(cleanupSecurityData, 60 * 60 * 1000);

const customRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!rateLimitStore.has(clientIP)) {
      rateLimitStore.set(clientIP, []);
    }
    
    const requests = rateLimitStore.get(clientIP);
    
    // Eski istekleri temizle
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    validRequests.push(now);
    rateLimitStore.set(clientIP, validRequests);
    
    next();
  };
};

// Login Rate Limiting (Daha sıkı)
const loginRateLimit = customRateLimit(5, 15 * 60 * 1000); // 15 dakikada 5 deneme

// Session güvenliği
const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS'de true
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 saat
    sameSite: 'strict'
  },
  name: 'belediye.sid' // Varsayılan session adını değiştir
};

module.exports = {
  loginLimiter,
  apiLimiter,
  messagingLimiter,
  securityHeaders,
  loginValidation,
  registerValidation,
  handleValidationErrors,
  ipWhitelist,
  sessionConfig,
  authenticateToken,
  rateLimit: customRateLimit,
  loginRateLimit,
  tokenBlacklist,
  detectSuspiciousActivity,
  requestFrequencyAnalysis,
  protectSensitiveEndpoints,
  // Require admin role middleware
  requireAdmin: (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yönetici yetkisi gerekir'
      });
    }
    next();
  }
};