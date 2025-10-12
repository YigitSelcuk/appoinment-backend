const cron = require('node-cron');
const db = require('../config/database');
const emailService = require('./emailService');
const smsService = require('./smsService');
const notificationsController = require('../controllers/notificationsController');

class ReminderService {
  constructor() {
    this.isRunning = false;
    this.startScheduler();
  }

  startScheduler() {
    if (this.isRunning) {
      console.log('Hatırlatma scheduler zaten çalışıyor');
      return;
    }

    cron.schedule('* * * * *', async () => {
      await this.checkAndSendReminders();
    });

    this.isRunning = true;
    console.log('✅ Hatırlatma scheduler başlatıldı - Her dakika çalışacak');
  }

  async scheduleReminder(appointmentId, reminderValue, reminderUnit) {
    try {
      console.log(`📅 Hatırlatma zamanlanıyor: Randevu ID ${appointmentId}, ${reminderValue} ${reminderUnit}`);

      if (!reminderValue || !reminderUnit) {
        console.log('❌ Hatırlatma değeri veya birimi eksik');
        return false;
      }

      const [appointments] = await db.execute(
        'SELECT * FROM appointments WHERE id = ?',
        [appointmentId]
      );

      if (appointments.length === 0) {
        console.log('❌ Randevu bulunamadı:', appointmentId);
        return false;
      }

      const appointment = appointments[0];
      
      const dateStr = appointment.date.toISOString().split('T')[0];
      const timeStr = appointment.start_time.substring(0, 5); // HH:MM formatı
      
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hour, minute] = timeStr.split(':').map(Number);
      
      const appointmentDateTime = new Date(year, month - 1, day, hour, minute, 0);
      
      console.log(`📅 Randevu tarihi: ${dateStr}`);
      console.log(`🕐 Randevu saati: ${timeStr}`);
      console.log(`📅 Birleştirilmiş: ${appointmentDateTime.toLocaleString('tr-TR')}`);
      
      const reminderTime = this.calculateReminderTime(appointmentDateTime, reminderValue, reminderUnit);
      
      // Türkiye saati için +3 saat ekle
      const reminderTimeWithTimezone = new Date(reminderTime.getTime() + (3 * 60 * 60 * 1000));
      
      const reminderTimeForDB = reminderTimeWithTimezone.getFullYear() + '-' + 
        String(reminderTimeWithTimezone.getMonth() + 1).padStart(2, '0') + '-' + 
        String(reminderTimeWithTimezone.getDate()).padStart(2, '0') + ' ' + 
        String(reminderTimeWithTimezone.getHours()).padStart(2, '0') + ':' + 
        String(reminderTimeWithTimezone.getMinutes()).padStart(2, '0') + ':' + 
        String(reminderTimeWithTimezone.getSeconds()).padStart(2, '0');
      
      console.log(`⏰ Randevu zamanı: ${appointmentDateTime.toLocaleString('tr-TR')}`);
      console.log(`⏰ Hatırlatma zamanı (orijinal): ${reminderTime.toLocaleString('tr-TR')}`);
      console.log(`⏰ Hatırlatma zamanı (+3 saat): ${reminderTimeWithTimezone.toLocaleString('tr-TR')}`);
      console.log(`⏰ Hatırlatma zamanı (DB string): ${reminderTimeForDB}`);
      
      if (reminderTimeWithTimezone <= new Date()) {
        console.log('⚠️ Hatırlatma zamanı geçmiş, kaydetmiyorum');
        return false;
      }

      const [result] = await db.execute(
        `INSERT INTO appointment_reminders (appointment_id, reminder_time, status, created_at, updated_at) 
         VALUES (?, ?, 'scheduled', NOW(), NOW())`,
        [appointmentId, reminderTimeForDB]
      );

      console.log(`✅ Hatırlatma kaydedildi: ID ${result.insertId}`);
      return true;

    } catch (error) {
      console.error('❌ Hatırlatma zamanlama hatası:', error);
      return false;
    }
  }

  calculateReminderTime(appointmentDateTime, value, unit) {
    const reminderTime = new Date(appointmentDateTime);
    
    switch (unit) {
      case 'minutes':
        reminderTime.setMinutes(reminderTime.getMinutes() - value);
        break;
      case 'hours':
        reminderTime.setHours(reminderTime.getHours() - value);
        break;
      case 'days':
        reminderTime.setDate(reminderTime.getDate() - value);
        break;
      case 'weeks':
        reminderTime.setDate(reminderTime.getDate() - (value * 7));
        break;
      default:
        throw new Error('Geçersiz hatırlatma birimi: ' + unit);
    }
    
    return reminderTime;
  }

  async checkAndSendReminders() {
    try {
      const now = new Date();
      console.log(`🔍 Hatırlatma kontrolü: ${now.toLocaleString('tr-TR')}`);
      
      const [reminders] = await db.execute(
        `SELECT ar.*, a.title, a.date, a.start_time, a.end_time, a.location, a.description,
                a.user_id, a.notification_email, a.notification_sms,
                u.name as creator_name, u.email as creator_email, u.phone as creator_phone
         FROM appointment_reminders ar
         JOIN appointments a ON ar.appointment_id = a.id
         JOIN users u ON a.user_id = u.id
         WHERE ar.reminder_time <= NOW() AND ar.status = 'scheduled'
         ORDER BY ar.reminder_time ASC`,
        []
      );
      
      if (reminders.length === 0) {
        return;
      }

      console.log(`📬 ${reminders.length} hatırlatma gönderilecek`);
      
      for (const reminder of reminders) {
        await this.processReminder(reminder);
      }
      
    } catch (error) {
      console.error('❌ Hatırlatma kontrol hatası:', error);
    }
  }

  async processReminder(reminder) {
    try {
      console.log(`📤 Hatırlatma gönderiliyor: ${reminder.title} (ID: ${reminder.id})`);
      
      // Durumu 'sending' yap (çift gönderim önleme)
      const [updateResult] = await db.execute(
        'UPDATE appointment_reminders SET status = "sending", updated_at = NOW() WHERE id = ? AND status = "scheduled"',
        [reminder.id]
      );
      
      if (updateResult.affectedRows === 0) {
        console.log('⚠️ Hatırlatma zaten işleniyor:', reminder.id);
        return;
      }
      
      let success = true;
      const errors = [];
      
      // E-posta gönder
      if (reminder.creator_email && reminder.notification_email) {
        try {
          await this.sendEmailReminder(reminder);
          console.log(`✅ E-posta gönderildi: ${reminder.creator_email}`);
        } catch (error) {
          console.error('❌ E-posta hatası:', error.message);
          errors.push('E-posta: ' + error.message);
          success = false;
        }
      }
      
      // SMS gönder
      if (reminder.creator_phone && reminder.notification_sms) {
        try {
          await this.sendSMSReminder(reminder);
          console.log(`✅ SMS gönderildi: ${reminder.creator_phone}`);
        } catch (error) {
          console.error('❌ SMS hatası:', error.message);
          errors.push('SMS: ' + error.message);
          success = false;
        }
      }
      
      // Uygulama içi bildirim
      try {
        await this.sendInAppNotification(reminder);
        console.log(`✅ Uygulama içi bildirim gönderildi: ${reminder.user_id}`);
      } catch (error) {
        console.error('❌ Uygulama içi bildirim hatası:', error.message);
        errors.push('Bildirim: ' + error.message);
        success = false;
      }
      
      // Katılımcılara gönder
      try {
        await this.sendToParticipants(reminder);
        console.log('✅ Katılımcılara gönderildi');
      } catch (error) {
        console.error('❌ Katılımcı hatası:', error.message);
        errors.push('Katılımcılar: ' + error.message);
        success = false;
      }
      
      // Final durumu güncelle
      const finalStatus = success ? 'sent' : 'failed';
      await db.execute(
        'UPDATE appointment_reminders SET status = ?, sent_at = NOW(), updated_at = NOW() WHERE id = ?',
        [finalStatus, reminder.id]
      );
      
      if (success) {
        console.log(`✅ Hatırlatma başarıyla tamamlandı: ${reminder.id}`);
      } else {
        console.log(`❌ Hatırlatma kısmen başarısız: ${reminder.id} - Hatalar: ${errors.join(', ')}`);
      }
      
    } catch (error) {
      console.error('❌ Hatırlatma işleme hatası:', error);
      
      // Hata durumunda failed yap
      try {
        await db.execute(
          'UPDATE appointment_reminders SET status = "failed", updated_at = NOW() WHERE id = ?',
          [reminder.id]
        );
      } catch (updateError) {
        console.error('❌ Durum güncelleme hatası:', updateError);
      }
    }
  }

  // E-posta hatırlatması gönder
  async sendEmailReminder(reminder) {
    const appointmentData = {
      title: reminder.title,
      date: reminder.date,
      startTime: reminder.start_time,
      endTime: reminder.end_time,
      location: reminder.location,
      description: reminder.description
    };
    
    await emailService.sendAppointmentNotification(
      appointmentData,
      reminder.creator_email,
      'reminder'
    );
  }

  // SMS hatırlatması gönder
  async sendSMSReminder(reminder) {
    // Kısa ve etkili mesaj formatı (banaozel sistemine uygun)
    const dateStr = reminder.date.toISOString().split('T')[0];
    const timeStr = reminder.start_time.substring(0, 5); // HH:MM formatı
    
    const message = `HATIRLATMA\n${reminder.title}\n${dateStr} ${timeStr}\n${reminder.location || 'Lokasyon belirtilmemiş'}`;
    
    console.log('📱 SMS hatırlatması gönderiliyor:', reminder.creator_phone);
    const result = await smsService.sendSMS(reminder.creator_phone, message);
    
    if (!result.success) {
      throw new Error(`SMS gönderim hatası: ${result.error}`);
    }
    
    return result;
  }

  // Uygulama içi bildirim gönder
  async sendInAppNotification(reminder) {
    await notificationsController.createNotification(
      reminder.user_id,
      'Randevu Hatırlatması',
      `${reminder.title} - ${reminder.date.toISOString().split('T')[0]} ${reminder.start_time}`,
      'appointment_reminder',
      reminder.appointment_id,
      'appointments'
    );
  }

  // Katılımcılara hatırlatma gönder (tek tablo sistemi)
  async sendToParticipants(reminder) {
    // Randevu bilgilerini al ve JSON alanlarını parse et
    const [appointments] = await db.execute(
      'SELECT invitees, visible_to_users FROM appointments WHERE id = ?',
      [reminder.appointment_id]
    );

    if (appointments.length === 0) {
      console.log('⚠️ Randevu bulunamadı:', reminder.appointment_id);
      return;
    }

    const appointment = appointments[0];
    
    // Invitees JSON'ını parse et
    let invitees = [];
    try {
      if (appointment.invitees) {
        // Eğer zaten obje/array ise direkt kullan, string ise parse et
        invitees = typeof appointment.invitees === 'string' 
          ? JSON.parse(appointment.invitees) 
          : appointment.invitees;
      }
    } catch (error) {
      console.error('Invitees JSON parse hatası:', error);
      invitees = [];
    }

    // Davetlilere gönder
    for (const invitee of invitees) {
      // E-posta gönder (sadece e-posta bildirimi aktifse)
      if (invitee.email && reminder.notification_email) {
        try {
          await this.sendEmailReminder({...reminder, creator_email: invitee.email, creator_name: invitee.name});
        } catch (error) {
          console.error('Davetli e-posta hatası:', error);
        }
      }
      
      // SMS gönder (sadece SMS bildirimi aktifse) 
      if (invitee.phone && reminder.notification_sms) {
        try {
          await this.sendSMSReminder({...reminder, creator_phone: invitee.phone, creator_name: invitee.name});
        } catch (error) {
          console.error('Davetli SMS hatası:', error);
        }
      }
    }

    // Görünürlük kullanıcılarına gönder
    let visibleUsers = [];
    try {
      if (appointment.visible_to_users) {
        // Eğer zaten obje/array ise direkt kullan, string ise parse et
        visibleUsers = typeof appointment.visible_to_users === 'string' 
          ? JSON.parse(appointment.visible_to_users) 
          : appointment.visible_to_users;
      }
    } catch (error) {
      console.error('Visible users JSON parse hatası:', error);
      visibleUsers = [];
    }

    for (const user of visibleUsers) {
      // E-posta gönder (sadece e-posta bildirimi aktifse)
      if (user.email && reminder.notification_email) {
        try {
          await this.sendEmailReminder({...reminder, creator_email: user.email, creator_name: user.name});
        } catch (error) {
          console.error('Görünür kullanıcı e-posta hatası:', error);
        }
      }
      
      // SMS gönder (sadece SMS bildirimi aktifse)
      if (user.phone && reminder.notification_sms) {
        try {
          await this.sendSMSReminder({...reminder, creator_phone: user.phone, creator_name: user.name});
        } catch (error) {
          console.error('Görünür kullanıcı SMS hatası:', error);
        }
      }
      
      // Uygulama içi bildirim
      if (user.id) {
        try {
          await this.sendInAppNotification({...reminder, user_id: user.id});
        } catch (error) {
          console.error('Görünür kullanıcı bildirim hatası:', error);
        }
      }
    }
  }

  // Hatırlatmayı iptal et
  async cancelReminder(appointmentId) {
    try {
      const [result] = await db.execute(
        'UPDATE appointment_reminders SET status = "cancelled", updated_at = NOW() WHERE appointment_id = ? AND status = "scheduled"',
        [appointmentId]
      );
      
      if (result.affectedRows > 0) {
        console.log(`✅ Hatırlatma iptal edildi: Randevu ${appointmentId}`);
      }
      
      return result.affectedRows > 0;
    } catch (error) {
      console.error('❌ Hatırlatma iptal hatası:', error);
      return false;
    }
  }
}

// Singleton instance export et
module.exports = new ReminderService();