const express = require('express');
const router = express.Router();
const rehberController = require('../controllers/rehberController');
const { authenticateToken } = require('../middleware/security');

// Get rehber statistics
router.get('/stats', authenticateToken, rehberController.getRehberStats);

module.exports = router;