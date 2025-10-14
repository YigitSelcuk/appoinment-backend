const express = require('express');
const router = express.Router();
const { getActivities, getActivityStats, logActivityEndpoint, checkTimezone } = require('../controllers/activitiesController');
const { authenticateToken, requireManagement } = require('../middleware/security');

// Tüm rotalar için auth middleware ve management kontrolü
router.use(authenticateToken);
router.use(requireManagement);

// Aktiviteleri getir
router.get('/', getActivities);

// Aktivite istatistikleri
router.get('/stats', getActivityStats);

// Aktivite kaydet
router.post('/log', logActivityEndpoint);

// Saat dilimi kontrol
router.get('/timezone', checkTimezone);

module.exports = router;