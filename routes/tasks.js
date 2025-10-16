const express = require('express');
const router = express.Router();
const tasksController = require('../controllers/tasksController');
const { authenticateToken } = require('../middleware/security');

// Tüm rotalar için token doğrulaması
router.use('/', authenticateToken);

// GET /api/tasks - Tüm görevleri getir (sayfalama ve filtreleme ile)
router.get('/', tasksController.getTasks);

// GET /api/tasks/stats - Görev istatistikleri
router.get('/stats', tasksController.getTaskStats);

// GET /api/tasks/debug - Debug endpoint
router.get('/debug', tasksController.debugTaskStatus);

// GET /api/tasks/:id - Belirli bir görevi getir
router.get('/:id', tasksController.getTask);

// POST /api/tasks - Yeni görev oluştur
router.post('/', tasksController.createTask);

// PUT /api/tasks/:id - Görevi güncelle
router.put('/:id', tasksController.updateTask);

// PUT /api/tasks/:id/approval - Görev onay durumunu güncelle
router.put('/:id/approval', tasksController.updateTaskApproval);

// DELETE /api/tasks/bulk - Toplu görev silme
router.delete('/bulk', tasksController.deleteMultipleTasks);

// DELETE /api/tasks/:id - Görevi sil
router.delete('/:id', tasksController.deleteTask);

module.exports = router;