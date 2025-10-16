const express = require('express');
const router = express.Router();
const { 
  getUsers, 
  getCurrentUser, 
  getUserProfile, 
  updateUserProfile, 
  getUserOnlineStatus, 
  createUser,
  updateUser, 
  updateUserPermissions,
  deleteUser,
  deleteMultipleUsers,
  getDepartments,
  checkEmailExists
} = require('../controllers/usersController');
const { authenticateToken, requireAdmin, requireManagement } = require('../middleware/security');
const upload = require('../middleware/upload');

// Kullanıcı durumu güncelleme endpoint'i (navigator.sendBeacon için)
router.post('/update-status', express.json(), async (req, res) => {
  try {
    const { userId, isOnline, timestamp } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId gerekli' });
    }

    const db = require('../config/database');
    // Türkiye saati için UTC+3 ekle
    const currentTime = new Date();
    const turkeyTime = new Date(currentTime.getTime() + (3 * 60 * 60 * 1000)); // UTC+3
    const formattedTime = turkeyTime.toISOString().slice(0, 19).replace('T', ' ');
    
    await db.execute(
      'UPDATE users SET is_online = ?, last_seen = ? WHERE id = ?',
      [isOnline ? 1 : 0, formattedTime, userId]
    );
    
    console.log(`📡 Beacon ile durum güncellendi: User ${userId} -> ${isOnline ? 'online' : 'offline'}`);
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Beacon durum güncelleme hatası:', error);
    res.status(500).json({ error: 'Durum güncellenemedi' });
  }
});

// Kullanıcıları listele
router.get('/', authenticateToken, getUsers);

// Department listesini getir
router.get('/departments', authenticateToken, getDepartments);

// E-posta kontrolü
router.get('/check-email/:email', authenticateToken, checkEmailExists);

// Mevcut kullanıcının bilgilerini getir
router.get('/me', authenticateToken, getCurrentUser);

// Kullanıcı profilini getir
router.get('/profile', authenticateToken, getUserProfile);

// Kullanıcı profilini güncelle
router.put('/profile', authenticateToken, upload.single('avatar'), upload.handleError, updateUserProfile);

// Kullanıcının online durumunu kontrol et
router.get('/online-status', authenticateToken, getUserOnlineStatus);

// Management: Yeni kullanıcı oluştur
router.post('/', authenticateToken, requireManagement, createUser);

// Management: Kullanıcı izinlerini güncelle
router.put('/:id/permissions', authenticateToken, requireManagement, updateUserPermissions);

// Kullanıcı güncelle (Management)
router.put('/:id', authenticateToken, requireManagement, updateUser);

// Toplu kullanıcı silme (Management)
router.delete('/bulk', authenticateToken, requireManagement, deleteMultipleUsers);

// Kullanıcı sil (Management)
router.delete('/:id', authenticateToken, requireManagement, deleteUser);

module.exports = router;