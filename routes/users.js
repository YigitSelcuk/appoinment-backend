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
  getDepartments
} = require('../controllers/usersController');
const { authenticateToken, requireAdmin, requireManagement } = require('../middleware/security');
const upload = require('../middleware/upload');

// Kullanıcıları listele
router.get('/', authenticateToken, getUsers);

// Department listesini getir
router.get('/departments', authenticateToken, getDepartments);

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