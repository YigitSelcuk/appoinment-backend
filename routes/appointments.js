const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/security');
const {
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  getAppointmentsByDateRange,
  checkConflict,
  getInviteePreviousAppointments,
  resendReminder,
  updateReminderTime,
  getAppointmentStats
} = require('../controllers/appointmentsController');

// Tüm randevuları getir
router.get('/', authenticateToken, getAppointments);

// Randevu çakışması kontrolü (/:id'den önce olmalı)
router.get('/check-conflict', authenticateToken, checkConflict);

// Randevu istatistikleri getir
router.get('/stats', authenticateToken, getAppointmentStats);

// Tarih aralığındaki randevuları getir
router.get('/range', authenticateToken, getAppointmentsByDateRange);

// ID'ye göre randevu getir (en sona koyuyoruz)
router.get('/:id', authenticateToken, getAppointmentById);

// Davetli kişilerin önceki randevularını getir
router.post('/invitee-previous', authenticateToken, getInviteePreviousAppointments);

// Yeni randevu oluştur
router.post('/', authenticateToken, createAppointment);

// Randevu güncelle
router.put('/:id', authenticateToken, updateAppointment);

// Randevu sil
router.delete('/:id', authenticateToken, deleteAppointment);

// Hatırlatma yeniden gönder
router.post('/:id/resend-reminder', authenticateToken, resendReminder);

// Hatırlatma zamanını güncelle
router.put('/:id/reminder-time', authenticateToken, updateReminderTime);

module.exports = router;