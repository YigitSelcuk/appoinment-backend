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
      secure: process.env.NODE_ENV === 'production' ? true : false,
      sameSite: 'none',
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

    if (req.cookies && req.cookies.refreshToken) {
      refreshToken = req.cookies.refreshToken;
    }

    if (!refreshToken) {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        refreshToken = authHeader.split(' ')[1];
      }
    }

    if (!refreshToken && req.body && req.body.refreshToken) {
      refreshToken = req.body.refreshToken;
    }

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token bulunamadı'
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz token türü'
      });
    }

    const query = 'SELECT * FROM users WHERE id = ? AND email = ?';
    const users = await db.query(query, [decoded.id, decoded.email]);

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    const user = users[0];

    const userPermissions = user.permissions ? (() => {
      try { 
        return typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions; 
      } catch (e) { 
        return null; 
      }
    })() : null;

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