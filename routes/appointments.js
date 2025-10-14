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

// Test endpoint - son eklenen randevuları getir
router.get('/test/recent', authenticateToken, async (req, res) => {
  try {
    const db = require('../config/database');
    const [appointments] = await db.execute(
      'SELECT * FROM appointments ORDER BY created_at DESC LIMIT 10'
    );
    res.json({ success: true, appointments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Veritabanı güncelleme endpoint'i - repeat alanı ekle
router.post('/admin/add-repeat-column', authenticateToken, async (req, res) => {
  try {
    const db = require('../config/database');
    
    const [columns] = await db.execute(
      "SHOW COLUMNS FROM appointments LIKE 'repeat_type'"
    );
    
    if (columns.length === 0) {
      await db.execute(`
        ALTER TABLE appointments 
        ADD COLUMN repeat_type ENUM('TEKRARLANMAZ', 'HAFTALIK', 'AYLIK') DEFAULT 'TEKRARLANMAZ' 
        AFTER source
      `);
      
      await db.execute(`
        UPDATE appointments SET repeat_type = 'TEKRARLANMAZ' WHERE repeat_type IS NULL
      `);
      
      res.json({ success: true, message: 'repeat_type alanı başarıyla eklendi' });
    } else {
      res.json({ success: true, message: 'repeat_type alanı zaten mevcut' });
    }
  } catch (error) {
    console.error('Veritabanı güncelleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;