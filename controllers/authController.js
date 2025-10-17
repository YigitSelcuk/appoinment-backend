const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { tokenBlacklist } = require('../middleware/security');

const db = require('../config/database');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email ve şifre gereklidir'
      });
    }

    const clientIP = req.ip || req.connection.remoteAddress;
    const rateLimitKey = `login_attempts_${clientIP}`;
    
    const query = 'SELECT * FROM users WHERE email = ?';
    const users = await db.query(query, [email]);

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz email veya şifre'
      });
    }

    const user = users[0];

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz email veya şifre'
      });
    }

    const updateOnlineQuery = 'UPDATE users SET is_online = TRUE, last_seen = CURRENT_TIMESTAMP WHERE id = ?';
    await db.query(updateOnlineQuery, [user.id]);

    const userPermissions = user.permissions ? (() => {
      try { 
        return typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions; 
      } catch (e) { 
        return null; 
      }
    })() : null;

    const accessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        department: user.department,
        permissions: userPermissions,
        type: 'access'
      },
      process.env.JWT_SECRET,
      { expiresIn: '3h' }
    );

    const refreshToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        type: 'refresh'
      },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false, // HTTP ortamı için false
      sameSite: 'lax', // VPN erişimi için daha esnek
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 gün
      path: '/'
    });

    const { password: _, ...userWithoutPassword } = user;
    userWithoutPassword.is_online = true;

    const safeUserData = {
      id: userWithoutPassword.id,
      name: userWithoutPassword.name,
      email: userWithoutPassword.email,
      role: userWithoutPassword.role,
      department: userWithoutPassword.department,
      is_online: userWithoutPassword.is_online,
      permissions: userPermissions
    };

    res.json({
      success: true,
      message: 'Giriş başarılı',
      accessToken, 
      user: safeUserData
    });

  } catch (error) {
    console.error('Login hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
};

exports.register = async (req, res) => {
  try {
    const { name, email, password, role = 'user', permissions = null } = req.body;
    const roleNormalized = role === 'user' ? 'patient' : role; // DB enum ile uyum

    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Tüm alanlar gereklidir' 
      });
    }

    const checkQuery = 'SELECT id FROM users WHERE email = ?';
    const existingUsers = await db.query(checkQuery, [email]);

    if (existingUsers.length > 0) {
      return res.status(409).json({
          success: false,
        message: 'Bu email adresi zaten kayıtlı'
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

    const insertQuery = `
      INSERT INTO users (name, email, password, role, permissions, is_online, created_at)
      VALUES (?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)
    `;
    const result = await db.query(insertQuery, [name, email, hashedPassword, roleNormalized, permissions ? JSON.stringify(permissions) : null]);

    const newUserRows = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    const userData = newUserRows[0];

    const token = jwt.sign(
      { 
        id: result.insertId, 
        email, 
        role: roleNormalized,
        name,
        department: userData.department
      },
      process.env.JWT_SECRET || 'default-secret-key',
      { expiresIn: '24h' }
    );

        res.status(201).json({ 
          success: true,
      message: 'Kullanıcı başarıyla kaydedildi',
      token,
      user: {
        id: result.insertId,
        name,
        email,
        role: roleNormalized,
        permissions: permissions || null,
        is_online: false
      }
    });

  } catch (error) {
    console.error('Kayıt hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
        });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    let refreshToken = null;

    // Debug: Gelen request'i logla
    console.log('=== REFRESH TOKEN DEBUG v2.1 ===');
    console.log('IP:', req.ip);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Cookies:', JSON.stringify(req.cookies, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Origin:', req.get('Origin'));
    console.log('Referer:', req.get('Referer'));
    console.log('Timestamp:', new Date().toISOString());

    // Cookie'den refresh token al
    if (req.cookies && req.cookies.refreshToken) {
      refreshToken = req.cookies.refreshToken;
      console.log('Refresh token cookie\'den alındı');
    }

    // Authorization header'dan refresh token al
    if (!refreshToken) {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        refreshToken = authHeader.split(' ')[1];
        console.log('Refresh token authorization header\'dan alındı');
      }
    }

    // Body'den refresh token al
    if (!refreshToken && req.body && req.body.refreshToken) {
      refreshToken = req.body.refreshToken;
      console.log('Refresh token body\'den alındı');
    }

    if (!refreshToken) {
      console.log('❌ Refresh token bulunamadı:', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        cookies: !!req.cookies?.refreshToken,
        authHeader: !!req.headers['authorization'],
        body: !!req.body?.refreshToken,
        cookieKeys: req.cookies ? Object.keys(req.cookies) : [],
        headerKeys: Object.keys(req.headers)
      });
      
      return res.status(401).json({
        success: false,
        message: 'Refresh token bulunamadı'
      });
    }

    console.log('✅ Refresh token bulundu, doğrulanıyor...');

    // Token'ı doğrula
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    if (decoded.type !== 'refresh') {
      console.log('Geçersiz token türü:', decoded.type);
      return res.status(401).json({
        success: false,
        message: 'Geçersiz token türü'
      });
    }

    // Kullanıcıyı veritabanından kontrol et
    const query = 'SELECT * FROM users WHERE id = ? AND email = ?';
    const users = await db.query(query, [decoded.id, decoded.email]);

    if (users.length === 0) {
      console.log('Kullanıcı bulunamadı:', { id: decoded.id, email: decoded.email });
      return res.status(401).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    const user = users[0];

    // Kullanıcı permissions'ını parse et
    const userPermissions = user.permissions ? (() => {
      try { 
        return typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions; 
      } catch (e) { 
        console.error('Permissions parse hatası:', e);
        return null; 
      }
    })() : null;

    // Yeni access token oluştur
    const newAccessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        department: user.department,
        permissions: userPermissions,
        type: 'access'
      },
      process.env.JWT_SECRET,
      { expiresIn: '3h' }
    );

    console.log('Token başarıyla yenilendi:', { userId: user.id, email: user.email });

    res.json({
      success: true,
      accessToken: newAccessToken
    });

  } catch (error) {
    console.error('Token yenileme hatası:', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token süresi dolmuş',
        code: 'REFRESH_TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }
    
    res.status(401).json({
      success: false,
      message: 'Geçersiz refresh token'
    });
  }
};

exports.logout = async (req, res) => {
  try {
    const userId = req.user.id;

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      tokenBlacklist.add(token);
    }

    const updateQuery = 'UPDATE users SET is_online = FALSE, last_seen = CURRENT_TIMESTAMP WHERE id = ?';
    await db.query(updateQuery, [userId]);

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    res.json({
      success: true,
      message: 'Başarıyla çıkış yapıldı'
    });

  } catch (error) {
    console.error('Çıkış hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
};

exports.verify = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Token geçerli',
      user: {
        id: req.user.id,
        userId: req.user.userId,
        email: req.user.email,
        role: req.user.role,
        name: req.user.name,
        department: req.user.department,
        permissions: req.user.permissions
      }
    });
  } catch (error) {
    console.error('Token doğrulama hatası:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server hatası' 
    });
  }
};