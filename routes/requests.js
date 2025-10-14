const express = require('express');
const router = express.Router();
const {
  getRequests,
  createRequest,
  updateRequest,
  deleteRequest,
  deleteMultipleRequests,
  getRequestById,
  checkTCExists,
  getDepartmentRequests,
  updateRequestStatus,
  getRequestStatusHistory,
  getRequestStats
} = require('../controllers/requestsController');
const { authenticateToken } = require('../middleware/security');

// Tüm rotalar authentication gerektirir
router.use(authenticateToken);

// GET /api/requests/stats - Talep istatistikleri (önce gelmeli)
router.get('/stats', getRequestStats);

// GET /api/requests/check-tc/:tcNo - TC Kimlik No kontrolü (önce gelmeli)
router.get('/check-tc/:tcNo', checkTCExists);

// GET /api/requests/department/list - Müdürlük bazlı talepleri getir (önce gelmeli)
router.get('/department/list', getDepartmentRequests);

// GET /api/requests - Tüm talepleri getir
router.get('/', getRequests);

// POST /api/requests - Yeni talep oluştur
router.post('/', createRequest);

// GET /api/requests/:id - Tek talep getir
router.get('/:id', getRequestById);

// PUT /api/requests/:id - Talep güncelle
router.put('/:id', updateRequest);

// DELETE /api/requests/bulk - Toplu talep sil
router.delete('/bulk', deleteMultipleRequests);

// DELETE /api/requests/:id - Talep sil
router.delete('/:id', deleteRequest);

// PUT /api/requests/:id/status - Talep durumunu güncelle
router.put('/:id/status', updateRequestStatus);

// GET /api/requests/:id/history - Talep durum geçmişini getir
router.get('/:id/history', getRequestStatusHistory);

module.exports = router;