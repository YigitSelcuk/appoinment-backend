const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticateToken } = require('../middleware/security');
const chatUpload = require('../middleware/chatUpload');

/**
 * Temiz Chat Routes
 * 
 * API Endpoints:
 * GET    /api/chat/conversations        - Konuşma listesi
 * GET    /api/chat/:contactId/messages  - Belirli kullanıcıyla mesajlar
 * POST   /api/chat/:contactId/messages  - Mesaj gönder
 * POST   /api/chat/:contactId/mark-read - Mesajları okundu işaretle
 * GET    /api/chat/users                - Tüm kullanıcılar (yeni chat için)
 */

// Konuşma listesini getir (mesajlaştığı kullanıcılar)
router.get('/conversations', authenticateToken, chatController.getConversations);

// Tüm kullanıcıları getir (yeni chat başlatmak için)
router.get('/users', authenticateToken, chatController.getAllUsers);

// Belirli bir kullanıcıyla mesajları getir
router.get('/:contactId/messages', authenticateToken, chatController.getMessages);

// Mesaj gönder
router.post('/:contactId/messages', authenticateToken, chatController.sendMessage);

// Dosya mesajı gönder
router.post('/:contactId/messages/file', authenticateToken, chatUpload.single('file'), chatController.sendFileMessage);

// Mesajları okundu olarak işaretle
router.post('/:contactId/mark-read', authenticateToken, chatController.markAsRead);

// Online durumunu güncelle
router.post('/update-status', authenticateToken, chatController.updateOnlineStatus);

// Mesaj sabitle/sabitlemeyi kaldır
router.post('/messages/:messageId/pin', authenticateToken, chatController.togglePinMessage);

// Tüm mesajları sil (sadece silen kullanıcı için)
router.delete('/:contactId/messages', authenticateToken, chatController.deleteAllMessages);

module.exports = router;