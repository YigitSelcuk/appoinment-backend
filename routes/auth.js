const express = require('express');
const { login, register, logout, refreshToken } = require('../controllers/authController');
const { 
  loginLimiter, 
  loginValidation, 
  registerValidation, 
  handleValidationErrors,
  authenticateToken,
  loginRateLimit,
  rateLimit
} = require('../middleware/security');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Kullanıcı kaydı - Güvenlik kontrolü ile
router.post('/register', 
  registerValidation, 
  handleValidationErrors, 
  register
);

// Kullanıcı girişi - Enhanced Rate limiting ve validation ile
router.post('/login', 
  loginRateLimit, 
  loginValidation, 
  handleValidationErrors, 
  login
);

// Token yenileme endpoint'i - Debug için rate limiting kaldırıldı
router.post('/refresh-token', 
  (req, res, next) => {
    console.log('🔍 AUTH ROUTE v2.3: Refresh token endpoint\'ine istek geldi:', {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    origin: req.headers.origin,
    referer: req.headers.referer,
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });
    next();
  },
  // rateLimit(10, 15 * 60 * 1000), // Geçici olarak kapatıldı
  refreshToken
);

// Kullanıcı çıkışı
router.post('/logout', authenticateToken, logout);

// sendBeacon için logout endpoint (token gerektirmez)
router.post('/logout-beacon', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (decoded && decoded.id) {
        const db = require('../config/database');
        const updateQuery = 'UPDATE users SET is_online = FALSE, last_seen = CURRENT_TIMESTAMP WHERE id = ?';
        await db.query(updateQuery, [decoded.id]);
        console.log(`Kullanıcı ${decoded.id} beacon ile offline yapıldı`);
      }
    }
  } catch (error) {
    console.error('Logout beacon error:', error);
  }
  
  res.status(200).json({ success: true, message: 'Logout beacon received' });
});

// Token doğrulama endpoint'i
router.get('/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token bulunamadı'
      });
    }

    const token = authHeader.substring(7); 

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).json({
          success: false,
          message: 'Geçersiz token'
        });
      }

      res.json({
        success: true,
        message: 'Token geçerli',
        user: {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role
        }
      });
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server hatası'
    });
  }
});

module.exports = router;