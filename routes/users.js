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
  deleteUser
} = require('../controllers/usersController');
const { authenticateToken, requireAdmin } = require('../middleware/security');
const upload = require('../middleware/upload');

// Kullanıcıları listele
router.get('/', authenticateToken, getUsers);

// Mevcut kullanıcının bilgilerini getir
router.get('/me', authenticateToken, getCurrentUser);

// Kullanıcı profilini getir
router.get('/profile', authenticateToken, getUserProfile);

// Kullanıcı profilini güncelle
router.put('/profile', authenticateToken, upload.single('avatar'), upload.handleError, updateUserProfile);

// Kullanıcının online durumunu kontrol et
router.get('/online-status', authenticateToken, getUserOnlineStatus);

// Admin: Yeni kullanıcı oluştur
router.post('/', authenticateToken, requireAdmin, createUser);

// Admin: Kullanıcı izinlerini güncelle
router.put('/:id/permissions', authenticateToken, requireAdmin, updateUserPermissions);

// Kullanıcı güncelle (Admin)
router.put('/:id', authenticateToken, requireAdmin, updateUser);

// Kullanıcı sil (Admin)
router.delete('/:id', authenticateToken, requireAdmin, deleteUser);

module.exports = router;