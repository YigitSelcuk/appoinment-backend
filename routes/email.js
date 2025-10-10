const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const { authenticateToken } = require('../middleware/security');

// Tüm e-posta route'ları authentication gerektirsin
router.use(authenticateToken);

// E-posta konfigürasyonu test
router.get('/config', emailController.getEmailConfig);

// E-posta gönder
router.post('/send', emailController.sendEmail);

// Randevu bildirimi e-postası gönder
router.post('/send-appointment-notification', emailController.sendAppointmentNotification);

// E-posta geçmişi
router.get('/history', emailController.getEmailHistory);

// E-posta istatistikleri
router.get('/stats', emailController.getEmailStats);

module.exports = router;