const express = require('express');
const router = express.Router();
const { getActivities, getActivityStats, logActivityEndpoint } = require('../controllers/activitiesController');
const { authenticateToken } = require('../middleware/security');

// Tüm rotalar için auth middleware
router.use(authenticateToken);

// Aktiviteleri getir
router.get('/', getActivities);

// Aktivite istatistikleri
router.get('/stats', getActivityStats);

// Aktivite kaydet
router.post('/log', logActivityEndpoint);

module.exports = router;