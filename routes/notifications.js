const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notificationsController');
const { authenticateToken } = require('../middleware/security');

// Tüm route'lar için authentication gerekli
router.use(authenticateToken);

// Bildirimleri getir
router.get('/', notificationsController.getNotifications);

// Okunmamış bildirim sayısını getir
router.get('/unread-count', notificationsController.getUnreadCount);

// Türe göre bildirimleri getir
router.get('/type/:type', notificationsController.getNotificationsByType);

// Bildirimi okundu olarak işaretle
router.patch('/:id/read', notificationsController.markAsRead);

// Tüm bildirimleri okundu olarak işaretle
router.patch('/mark-all-read', notificationsController.markAllAsRead);

// Bildirimi sil
router.delete('/:id', notificationsController.deleteNotification);

module.exports = router;