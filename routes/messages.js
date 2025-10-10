const express = require('express');
const router = express.Router();
const smsController = require('../controllers/smsController');
const { authenticateToken } = require('../middleware/security');

// SMS Mesajları - Bana Özel SMS Sistemi
// SMS geçmişini getir (sayfalama ve filtreleme ile)
router.get('/', authenticateToken, smsController.getSMSHistory);

// SMS istatistikleri
router.get('/stats', authenticateToken, smsController.getSMSStats);

// SMS test fonksiyonu
router.post('/test', authenticateToken, smsController.testSMS);

// Tekli SMS gönder
router.post('/send', authenticateToken, smsController.sendSMS);

// Toplu SMS gönder
router.post('/send-bulk', authenticateToken, smsController.sendBulkSMS);

// SMS konfigürasyonu
router.get('/config', authenticateToken, smsController.getSMSConfig);

module.exports = router;