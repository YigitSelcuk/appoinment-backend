const express = require('express');
const router = express.Router();
const smsController = require('../controllers/smsController');
const { authenticateToken } = require('../middleware/security');

// Tüm SMS route'ları authentication gerektirir
router.use(authenticateToken);

// SMS konfigürasyon bilgilerini getir
router.get('/config', smsController.getSMSConfig);

// Tekli SMS gönder - PHP banaozelSmsGonder mantığı
router.post('/send', smsController.sendSMS);

// Toplu SMS gönder
router.post('/send-bulk', smsController.sendBulkSMS);

// SMS geçmişini getir
router.get('/history', smsController.getSMSHistory);

// SMS istatistikleri
router.get('/stats', smsController.getSMSStats);

// SMS test fonksiyonu
router.post('/test', smsController.testSMS);

module.exports = router;