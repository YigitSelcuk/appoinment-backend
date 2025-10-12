const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { tokenBlacklist } = require('../middleware/security');

// Merkezi veritabanı bağlantısı
const db = require('../config/database');

// Kullanıcı girişi
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email ve şifre gereklidir'
      });
    }

    // Rate limiting kontrolü (IP bazlı)
    const clientIP = req.ip || req.connection.remoteAddress;
    const rateLimitKey = `login_attempts_${clientIP}`;
    
    // Kullanıcıyı veritabanından bul
    const query = 'SELECT * FROM users WHERE email = ?';
    const [users] = await db.query(query, [email]);

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz email veya şifre'
      });
    }

    const user = users[0];

    // Şifreyi kontrol et
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz email veya şifre'
      });
    }

    // Kullanıcıyı online yap
    const updateOnlineQuery = 'UPDATE users SET is_online = TRUE, last_seen = CURRENT_TIMESTAMP WHERE id = ?';
    await db.query(updateOnlineQuery, [user.id]);

    // permissions alanını parse et
    const userPermissions = user.permissions ? (() => {
      try { 
        return typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions; 
      } catch (e) { 
        return null; 
      }
    })() : null;

    // Access Token (orta süreli - 3 saat)
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

    // Refresh Token (uzun süreli - 7 gün)
    const refreshToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        type: 'refresh'
      },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Refresh token'ı HttpOnly cookie olarak ayarla
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 gün
      path: '/'
    });

    // Şifreyi response'dan çıkar
    const { password: _, ...userWithoutPassword } = user;
    userWithoutPassword.is_online = true;

    // Sadece gerekli kullanıcı bilgilerini gönder (hassas bilgileri çıkar)
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
      accessToken, // Sadece access token frontend'e gönderilir
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

// Kullanıcı kaydı
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

    // Email zaten kayıtlı mı kontrol et
    const checkQuery = 'SELECT id FROM users WHERE email = ?';
    const [existingUsers] = await db.query(checkQuery, [email]);

    if (existingUsers.length > 0) {
      return res.status(409).json({
          success: false,
        message: 'Bu email adresi zaten kayıtlı'
        });
      }

    // Şifreyi hash'le
      const hashedPassword = await bcrypt.hash(password, 10);

    // Kullanıcıyı kaydet
    const insertQuery = `
      INSERT INTO users (name, email, password, role, permissions, is_online, created_at)
      VALUES (?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)
    `;
    const [result] = await db.query(insertQuery, [name, email, hashedPassword, roleNormalized, permissions ? JSON.stringify(permissions) : null]);

    // Yeni kullanıcı bilgilerini al
    const [newUser] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    const userData = newUser[0];

    // JWT token oluştur
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

// Token yenileme
exports.refreshToken = async (req, res) => {
  try {
    // req.cookies kontrolü
    if (!req.cookies) {
      return res.status(401).json({
        success: false,
        message: 'Cookies bulunamadı'
      });
    }

    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token bulunamadı'
      });
    }

    // Refresh token'ı doğrula
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz token türü'
      });
    }

    // Kullanıcıyı veritabanından al
    const query = 'SELECT * FROM users WHERE id = ? AND email = ?';
    const [users] = await db.query(query, [decoded.id, decoded.email]);

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    const user = users[0];

    // permissions alanını parse et
    const userPermissions = user.permissions ? (() => {
      try { 
        return typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions; 
      } catch (e) { 
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

    res.json({
      success: true,
      accessToken: newAccessToken
    });

  } catch (error) {
    console.error('Token yenileme hatası:', error);
    res.status(401).json({
      success: false,
      message: 'Geçersiz refresh token'
    });
  }
};

// Kullanıcı çıkışı
exports.logout = async (req, res) => {
  try {
    const userId = req.user.id;

    // Access token'ı blacklist'e ekle
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      tokenBlacklist.add(token);
    }

    // Kullanıcıyı offline yap
    const updateQuery = 'UPDATE users SET is_online = FALSE, last_seen = CURRENT_TIMESTAMP WHERE id = ?';
    await db.query(updateQuery, [userId]);

    // Refresh token cookie'sini temizle
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

// Token doğrulama
exports.verify = async (req, res) => {
  try {
    // Token middleware tarafından doğrulanmış, user bilgisi req.user'da
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