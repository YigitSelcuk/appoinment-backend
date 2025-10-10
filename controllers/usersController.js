const db = require('../config/database');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Admin: Yeni kullanıcı oluştur
const createUser = async (req, res) => {
  try {
    const { 
      name, 
      email, 
      password, 
      role = 'user', 
      permissions = null,
      phone = null,
      address = null,
      bio = null,
      department = null,
      color = '#4E0DCC'
    } = req.body;
    const roleNormalized = role === 'user' ? 'patient' : role;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'İsim, email ve şifre zorunludur' });
    }

    // Email eşsiz mi?
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Bu email zaten kayıtlı' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const insertSql = `
      INSERT INTO users (name, email, password, role, permissions, phone, address, bio, department, color, is_online, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, NOW())
    `;
    const [result] = await db.execute(insertSql, [
      name,
      email,
      hashed,
      roleNormalized,
      permissions ? JSON.stringify(permissions) : null,
      phone,
      address,
      bio,
      department,
      color
    ]);

    res.status(201).json({
      success: true,
      message: 'Kullanıcı oluşturuldu',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Kullanıcı oluşturma hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
  }
};

// Admin: Kullanıcı izinlerini güncelle
const updateUserPermissions = async (req, res) => {
  try {
    const userId = req.params.id;
    const { permissions } = req.body;

    if (permissions === undefined) {
      return res.status(400).json({ success: false, message: 'permissions alanı zorunludur' });
    }

    const [exists] = await db.execute('SELECT id FROM users WHERE id = ?', [userId]);
    if (exists.length === 0) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    await db.execute('UPDATE users SET permissions = ?, updated_at = NOW() WHERE id = ?', [
      permissions ? JSON.stringify(permissions) : null,
      userId
    ]);

    const [updatedRows] = await db.execute('SELECT id, name, email, role, permissions FROM users WHERE id = ?', [userId]);
    const updated = updatedRows[0];
    if (updated && updated.permissions) {
      try { updated.permissions = typeof updated.permissions === 'string' ? JSON.parse(updated.permissions) : updated.permissions; } catch (e) { updated.permissions = null; }
    }

    res.json({ success: true, message: 'İzinler güncellendi', data: updated });
  } catch (error) {
    console.error('İzin güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
  }
};

// Tüm kullanıcıları getir
const getUsers = async (req, res) => {
  try {
    const query = `
      SELECT 
        id,
        name,
        email,
        avatar,
        role,
        phone,
        address,
        bio,
        department,
        color,
        permissions,
        DATE_FORMAT(created_at, '%d.%m.%Y') AS created_at
      FROM users
      ORDER BY name ASC
    `;

    const [users] = await db.execute(query);

    const formatted = users.map(u => ({
      ...u,
      permissions: u.permissions ? (() => { try { return typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions; } catch (e) { return null; } })() : null
    }));

    res.json({
      success: true,
      data: formatted
    });

  } catch (error) {
    console.error('Kullanıcılar getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcılar getirilirken hata oluştu',
      error: error.message
    });
  }
};

// Mevcut kullanıcının bilgilerini getir
const getCurrentUser = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const query = `
      SELECT 
        id,
        name,
        email,
        avatar,
        role,
        phone,
        address,
        bio,
        color,
        permissions,
        created_at
      FROM users
      WHERE id = ?
    `;

    const [users] = await db.execute(query, [userId]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    const current = users[0];
    if (current && current.permissions) {
      try {
        current.permissions = typeof current.permissions === 'string' ? JSON.parse(current.permissions) : current.permissions;
      } catch (e) {
        current.permissions = null;
      }
    }

    res.json({
      success: true,
      data: current
    });

  } catch (error) {
    console.error('Mevcut kullanıcı getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı bilgileri getirilirken hata oluştu',
      error: error.message
    });
  }
};

// Kullanıcı profilini getir
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const query = `
      SELECT 
        id,
        name,
        email,
        avatar,
        role,
        phone,
        address,
        bio,
        department,
        color,
        permissions,
        is_online,
        last_seen,
        created_at,
        updated_at
      FROM users
      WHERE id = ?
    `;

    const [users] = await db.execute(query, [userId]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    const user = users[0];
    if (user && user.permissions) {
      try {
        user.permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
      } catch (e) {
        user.permissions = null;
      }
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Profil getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Profil getirilirken hata oluştu',
      error: error.message
    });
  }
};

// Kullanıcı profilini güncelle
const updateUserProfile = async (req, res) => {
  try {
    console.log('updateUserProfile çağrıldı');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('req.body:', req.body);
    console.log('req.file:', req.file);
    
    const userId = req.user.id;
    const { name, email, phone, address, bio, role, department, color, currentPassword, newPassword } = req.body;

    // Mevcut kullanıcı bilgilerini al
    const [currentUser] = await db.execute(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );

    if (currentUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Email değişikliği kontrolü
    if (email && email !== currentUser[0].email) {
      const [existingUser] = await db.execute(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId]
      );

      if (existingUser.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Bu email adresi zaten kullanılıyor'
        });
      }
    }

    let updateFields = [];
    let updateValues = [];

    // Güncelleme alanlarını hazırla
    if (name) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (email) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }
    if (address !== undefined) {
      updateFields.push('address = ?');
      updateValues.push(address);
    }
    if (bio !== undefined) {
      updateFields.push('bio = ?');
      updateValues.push(bio);
    }
    if (role !== undefined) {
      updateFields.push('role = ?');
      updateValues.push(role);
    }
    if (department !== undefined) {
      updateFields.push('department = ?');
      updateValues.push(department);
    }
    if (color !== undefined) {
      updateFields.push('color = ?');
      updateValues.push(color);
    }

    // Şifre değişikliği kontrolü
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: 'Yeni şifre belirlemek için mevcut şifrenizi girmelisiniz'
        });
      }

      // Mevcut şifreyi kontrol et
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, currentUser[0].password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Mevcut şifre yanlış'
        });
      }

      // Yeni şifreyi hashle
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      updateFields.push('password = ?');
      updateValues.push(hashedNewPassword);
    }

    // Avatar güncelleme
    if (req.file) {
      console.log('Avatar dosyası yüklendi:', req.file.filename);
      // Eski avatar'ı sil
      if (currentUser[0].avatar) {
        const oldAvatarPath = path.join(__dirname, '../uploads/avatars', currentUser[0].avatar);
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
        }
      }

      updateFields.push('avatar = ?');
      updateValues.push(req.file.filename);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Güncellenecek alan bulunamadı'
      });
    }

    updateValues.push(userId);

    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = ?
    `;

    await db.execute(updateQuery, updateValues);

    // Güncellenmiş kullanıcı bilgilerini getir
    const [updatedUser] = await db.execute(
      `SELECT id, name, email, avatar, role, phone, address, bio, department, color, permissions, is_online, last_seen, created_at, updated_at 
       FROM users WHERE id = ?`,
      [userId]
    );

    console.log('Güncellenen kullanıcı bilgileri:', updatedUser[0]);

    const updated = updatedUser[0];
    if (updated && updated.permissions) {
      try {
        updated.permissions = typeof updated.permissions === 'string' ? JSON.parse(updated.permissions) : updated.permissions;
      } catch (e) {
        updated.permissions = null;
      }
    }

    res.json({
      success: true,
      message: 'Profil başarıyla güncellendi',
      data: updated
    });

  } catch (error) {
    console.error('Profil güncellenirken hata:', error);
    console.error('Error stack:', error.stack);
    
    // Multer hatalarını özel olarak yakala
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Dosya boyutu çok büyük (maksimum 5MB)'
      });
    }
    
    if (error.message && error.message.includes('Sadece resim dosyaları')) {
      return res.status(400).json({
        success: false,
        message: 'Sadece resim dosyaları yüklenebilir'
      });
    }
    
    if (error.message && error.message.includes('Content-Type')) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz Content-Type. Lütfen multipart/form-data kullanın.'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Profil güncellenirken hata oluştu',
      error: error.message
    });
  }
};

// Kullanıcının online durumunu kontrol et
const getUserOnlineStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const query = `
      SELECT 
        id,
        is_online,
        last_seen
      FROM users
      WHERE id = ?
    `;

    const [users] = await db.execute(query, [userId]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    res.json({
      success: true,
      data: {
        userId: users[0].id,
        isOnline: users[0].is_online,
        lastSeen: users[0].last_seen
      }
    });

  } catch (error) {
    console.error('Online durum kontrolü hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Online durum kontrol edilirken hata oluştu',
      error: error.message
    });
  }
};

// Admin: Kullanıcı güncelle
const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, phone, address, bio, department, permissions, role, color } = req.body;

    // Kullanıcının var olup olmadığını kontrol et
    const [existingUser] = await db.execute(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Email benzersizlik kontrolü (kendisi hariç)
    if (email && email !== existingUser[0].email) {
      const [emailCheck] = await db.execute(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId]
      );

      if (emailCheck.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Bu email adresi zaten kullanılıyor'
        });
      }
    }

    // Güncelleme alanlarını hazırla
    const updateFields = [];
    const updateValues = [];

    if (name) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (email) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }
    if (address !== undefined) {
      updateFields.push('address = ?');
      updateValues.push(address);
    }
    if (bio !== undefined) {
      updateFields.push('bio = ?');
      updateValues.push(bio);
    }
    if (department !== undefined) {
      updateFields.push('department = ?');
      updateValues.push(department);
    }
    if (role) {
      updateFields.push('role = ?');
      updateValues.push(role);
    }
    if (color) {
      updateFields.push('color = ?');
      updateValues.push(color);
    }
    if (permissions) {
      updateFields.push('permissions = ?');
      updateValues.push(JSON.stringify(permissions));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Güncellenecek alan bulunamadı'
      });
    }

    updateValues.push(userId);

    // Kullanıcıyı güncelle
    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = ?
    `;

    await db.execute(updateQuery, updateValues);

    // Güncellenmiş kullanıcı bilgilerini getir
    const [updatedUser] = await db.execute(
      `SELECT id, name, email, avatar, role, phone, address, bio, department, color, permissions, created_at 
       FROM users WHERE id = ?`,
      [userId]
    );

    const updated = updatedUser[0];
    if (updated && updated.permissions) {
      try {
        updated.permissions = JSON.parse(updated.permissions);
      } catch (e) {
        updated.permissions = {};
      }
    }

    res.json({
      success: true,
      message: 'Kullanıcı başarıyla güncellendi',
      data: updated
    });

  } catch (error) {
    console.error('Kullanıcı güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı güncellenirken hata oluştu',
      error: error.message
    });
  }
};

// Admin: Kullanıcı sil
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const currentUserId = req.user.id;
    
    // Kendi kendini silmeye izin verme
    if (parseInt(userId) === parseInt(currentUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Kendi hesabınızı silemezsiniz'
      });
    }

    // Kullanıcının var olup olmadığını kontrol et
    const [existingUser] = await db.execute(
      'SELECT id, name, email FROM users WHERE id = ?',
      [userId]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Kullanıcıyı sil
    await db.execute('DELETE FROM users WHERE id = ?', [userId]);

    res.json({
      success: true,
      message: 'Kullanıcı başarıyla silindi',
      data: {
        deletedUser: existingUser[0]
      }
    });

  } catch (error) {
    console.error('Kullanıcı silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı silinirken hata oluştu',
      error: error.message
    });
  }
};

module.exports = {
  getUsers,
  getCurrentUser,
  getUserProfile,
  updateUserProfile,
  getUserOnlineStatus,
  createUser,
  updateUser,
  updateUserPermissions,
  deleteUser
};