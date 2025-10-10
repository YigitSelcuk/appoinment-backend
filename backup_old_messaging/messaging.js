const express = require('express');
const router = express.Router();
const messagesController = require('../controllers/messagesController');
const messagingController = require('../controllers/messagingController');
const { authenticateToken, messagingLimiter } = require('../middleware/security');
const chatUpload = require('../middleware/chatUpload');

// Chat odalarını getir
router.get('/rooms', authenticateToken, messagesController.getChatRooms);

// Chat odasının mesajlarını getir
router.get('/rooms/:roomId/messages', authenticateToken, messagesController.getChatMessages);

// Yeni mesaj gönder
router.post('/rooms/:roomId/messages', authenticateToken, messagingLimiter, messagesController.sendMessage);

// Dosya mesajı gönder
router.post('/rooms/:roomId/messages/file', authenticateToken, messagingLimiter, chatUpload.single('file'), messagesController.sendFileMessage);

// Kullanıcı listesini getir
router.get('/users', authenticateToken, messagesController.getAllUsers);

// Yeni chat başlat
router.post('/rooms/start', authenticateToken, messagesController.startNewChat);

// Okunmamış mesaj sayılarını getir
router.get('/unread-counts', authenticateToken, messagingController.getUnreadCounts);

// Mesajları okundu olarak işaretle
router.post('/rooms/:roomId/mark-read', authenticateToken, messagesController.markMessagesAsRead);

module.exports = router;