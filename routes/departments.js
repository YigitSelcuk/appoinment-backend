const express = require('express');
const router = express.Router();
const {
  getAllDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentById
} = require('../controllers/departmentsController');
const { authenticateToken, requireAdmin } = require('../middleware/security');

// Tüm rotalar için authentication gerekli
router.use(authenticateToken);

// GET /api/departments - Tüm departmanları getir
router.get('/', getAllDepartments);

// GET /api/departments/:id - Tek departman getir
router.get('/:id', getDepartmentById);

// POST /api/departments - Yeni departman oluştur (Admin only)
router.post('/', requireAdmin, createDepartment);

// PUT /api/departments/:id - Departman güncelle (Admin only)
router.put('/:id', requireAdmin, updateDepartment);

// DELETE /api/departments/:id - Departman sil (Admin only)
router.delete('/:id', requireAdmin, deleteDepartment);

module.exports = router;