const db = require('../config/database');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');
const reminderService = require('../services/reminderService');
const notificationsController = require('./notificationsController');
const { logActivity } = require('./activitiesController');
const { getIO } = require('../utils/socket');

const formatDateForDB = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const checkAppointmentConflict = async (userId, date, startTime, endTime, excludeId = null) => {
  try {
    
    let query = `
      SELECT id, title, start_time, end_time, user_id, attendee_name, status
      FROM appointments 
      WHERE user_id = ?
      AND DATE(date) = ?
      AND NOT (end_time <= ? OR start_time >= ?)
      AND status NOT IN ('COMPLETED', 'CANCELLED', 'CONFIRMED')
    `;
    
   
    
    const params = [userId, date, startTime, endTime];

    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }

    const [conflicts] = await db.execute(query, params);
    return conflicts;
  } catch (error) {
    console.error('Çakışma kontrolü hatası:', error);
    throw error;
  }
};

const checkGlobalAppointmentConflict = async (date, startTime, endTime, excludeId = null, userId = null) => {
  try {
    
    if (!startTime || !endTime) {
      console.log('StartTime veya endTime boş, çakışma kontrolü atlanıyor');
      return [];
    }
    
    
   
    let query = `
      SELECT id, title, date, start_time, end_time, user_id, attendee_name, status
      FROM appointments 
      WHERE DATE(date) = ?
      AND NOT (end_time <= ? OR start_time >= ?)
      AND status NOT IN ('COMPLETED', 'CANCELLED', 'CONFIRMED')
    `;
    
    const params = [date, startTime, endTime];

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }

    console.log('Çakışma kontrolü sorgusu:', query);
    console.log('Parametreler:', params);
    
    const [conflicts] = await db.execute(query, params);
    
    console.log('Bulunan çakışmalar:', conflicts.length);
    if (conflicts.length > 0) {
      console.log('Çakışan randevular:');
      conflicts.forEach(conflict => {
        console.log(`- ID: ${conflict.id}, Başlık: ${conflict.title}, Tarih: ${conflict.date}, Saat: ${conflict.start_time} - ${conflict.end_time}`);
      });
    }
    
    return conflicts;
  } catch (error) {
    console.error('Global çakışma kontrolü hatası:', error);
    throw error;
  }
};

const getAppointments = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = req.user;
    
    const canViewAll = user.role === 'admin' || 
                      user.role === 'başkan' || 
                      user.department === 'BAŞKAN';
    
    let query, queryParams;
    
    if (canViewAll) {
      query = `
        SELECT DISTINCT
          a.*,
          creator.name as creator_name,
          creator.email as creator_email,
          creator.color as creator_color,
          COALESCE(creator.name, a.created_by_name, 'Bilinmiyor') as created_by_name,
          COALESCE(creator.email, a.created_by_email) as created_by_email
        FROM appointments a
        LEFT JOIN users creator ON a.user_id = creator.id
        WHERE a.status NOT IN ('COMPLETED', 'CANCELLED')
        ORDER BY a.date, a.start_time
      `;
      queryParams = [];
    } else {
      query = `
        SELECT DISTINCT
          a.*,
          creator.name as creator_name,
          creator.email as creator_email,
          creator.color as creator_color,
          COALESCE(creator.name, a.created_by_name, 'Bilinmiyor') as created_by_name,
          COALESCE(creator.email, a.created_by_email) as created_by_email
        FROM appointments a
        LEFT JOIN users creator ON a.user_id = creator.id
        WHERE 
          a.status NOT IN ('COMPLETED', 'CANCELLED') AND (
            a.user_id = ? OR 
            a.visible_to_all = TRUE OR
            (
              a.visible_to_users IS NOT NULL AND 
              (
                JSON_SEARCH(a.visible_to_users, 'one', ?) IS NOT NULL OR
                JSON_SEARCH(a.visible_to_users, 'one', CAST(? AS CHAR)) IS NOT NULL
              )
            )
          )
        ORDER BY a.date, a.start_time
      `;
      queryParams = [userId, userId.toString(), userId];
    }
    
    console.log('🔴 getAppointmentsByDateRange DEBUG - Query:', query);
    console.log('🔴 getAppointmentsByDateRange DEBUG - Query params:', queryParams);
    
    const [appointments] = await db.execute(query, queryParams);
    
    console.log('🔴 getAppointmentsByDateRange DEBUG - Found appointments:', appointments.length);
    if (appointments.length > 0) {
      console.log('🔴 getAppointmentsByDateRange DEBUG - First appointment:', {
        id: appointments[0].id,
        title: appointments[0].title,
        date: appointments[0].date,
        status: appointments[0].status,
        user_id: appointments[0].user_id
      });
    }
    
    for (let appointment of appointments) {
      try {
        if (appointment.id === 11) { // Sizin randevunuzun ID'si
          console.log('=== BACKEND INVITEES DEBUG (Appointment ID: 11) ===');
          console.log('PARSE ÖNCESI:');
          console.log('Raw invitees from DB:', appointment.invitees);
          console.log('Type invitees:', typeof appointment.invitees);
          console.log('Raw attendees from DB:', appointment.attendees);
          console.log('Type attendees:', typeof appointment.attendees);
          console.log('Raw attendee_name:', appointment.attendee_name);
          console.log('Raw attendee_email:', appointment.attendee_email);
        }
        
        const safeJsonParse = (jsonData) => {
          if (typeof jsonData === 'object' && jsonData !== null) {
            return Array.isArray(jsonData) ? jsonData : [jsonData];
          }
          
          if (typeof jsonData === 'string') {
            if (!jsonData || jsonData === null || jsonData === '') {
              return [];
            }
            try {
              return JSON.parse(jsonData);
            } catch {
              return [];
            }
          }
          
          return [];
        };
        
        appointment.attendees = safeJsonParse(appointment.attendees);
        appointment.invitees = safeJsonParse(appointment.invitees);
        appointment.visible_to_users = safeJsonParse(appointment.visible_to_users);
        
        if (appointment.id === 11) { 
          console.log('PARSE SONRASI:');
          console.log('Parsed invitees:', appointment.invitees);
          console.log('Is Array:', Array.isArray(appointment.invitees));
          console.log('Length:', appointment.invitees ? appointment.invitees.length : 'null');
          if (appointment.invitees && appointment.invitees.length > 0) {
            console.log('First invitee:', appointment.invitees[0]);
          }
          console.log('Parsed attendees:', appointment.attendees);
          console.log('===================================================');
        }
      } catch (error) {
        console.error('JSON parse hatası:', error);
        appointment.attendees = [];
        appointment.invitees = [];
        appointment.visible_to_users = [];
      }
    }
    
    res.json({
      success: true,
      data: appointments
    });
  } catch (error) {
    console.error('Randevular getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevular getirilemedi'
    });
  }
};

const checkConflict = async (req, res) => {
  try {
    const { date, startTime, endTime, excludeId } = req.query;
    const userId = req.user.id; 

    if (!date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Tarih, başlangıç ve bitiş saati gereklidir'
      });
    }

    const conflicts = await checkGlobalAppointmentConflict(date, startTime, endTime, excludeId, null); // userId=null ile TÜM randevuları kontrol et
    
    res.json({
      success: true,
      hasConflict: conflicts.length > 0,
      conflicts: conflicts.map(conflict => ({
        id: conflict.id,
        title: conflict.title,
        startTime: conflict.start_time,
        endTime: conflict.end_time
      }))
    });
  } catch (error) {
    console.error('Çakışma kontrolü hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Çakışma kontrolü yapılamadı'
    });
  }
};

const createRepeatedAppointments = async ({
  originalAppointment,
  repeat,
  title,
  description,
  startTime,
  endTime,
  color,
  location,
  userId,
  selectedContacts,
  visibleToUsers,
  visibleToAll,
  notificationEmail,
  notificationSMS
}) => {
  const originalDate = new Date(originalAppointment.date);
  
  const maxRepeats = repeat === 'HAFTALIK' ? 12 : 6; 
  
  const inviteesJson = selectedContacts && selectedContacts.length > 0 
    ? JSON.stringify(selectedContacts.map(contact => ({
        name: contact.name,
        email: contact.email || null,
        phone: contact.phone1 || contact.phone || null
      })))
    : JSON.stringify([]);

  const visibleUsersJson = visibleToUsers && visibleToUsers.length > 0
    ? JSON.stringify(visibleToUsers.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email
      })))
    : JSON.stringify([]);
  
  const appointmentValues = [];
  
  for (let i = 1; i <= maxRepeats; i++) {
    let nextDate;
    
    if (repeat === 'HAFTALIK') {
      const originalTime = originalDate.getTime();
      const weekInMilliseconds = 7 * 24 * 60 * 60 * 1000; // 7 gün
      nextDate = new Date(originalTime + (i * weekInMilliseconds));
      
      if (nextDate.getDay() !== originalDate.getDay()) {
        const dayDifference = originalDate.getDay() - nextDate.getDay();
        nextDate.setDate(nextDate.getDate() + dayDifference);
      }
    } else if (repeat === 'AYLIK') {
      nextDate = new Date(originalDate);
      nextDate.setMonth(originalDate.getMonth() + i);
      
      if (nextDate.getDate() !== originalDate.getDate()) {
        nextDate.setDate(0); 
      }
    }
    
    const nextDateStr = formatDateForDB(nextDate);
    
    appointmentValues.push([
      userId,
      title,
      nextDateStr,
      startTime,
      endTime,
      originalAppointment.created_by_name || null,
      originalAppointment.created_by_email || null,
      originalAppointment.attendee_name || null,
      originalAppointment.attendee_email || null,
      originalAppointment.attendee_phone || null,
      description,
      color,
      location,
      notificationEmail || false,
      notificationSMS || false,
      null, // reminder_value
      null, // reminder_unit
      null, // google_event_id
      'SYSTEM', // source
      'SCHEDULED', // status
      inviteesJson,
      visibleUsersJson,
      visibleToAll || false,
      repeat || 'TEKRARLANMAZ'
    ]);
  }
  
  try {
    const placeholders = appointmentValues.map(() => 
      '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
    ).join(', ');
    
    const batchInsertQuery = `
      INSERT INTO appointments (
        user_id, title, date, start_time, end_time,
        created_by_name, created_by_email,
        attendee_name, attendee_email, attendee_phone,
        description, color, location,
        notification_email, notification_sms,
        reminder_value, reminder_unit,
        google_event_id, source,
        status,
        invitees, visible_to_users,
        visible_to_all, repeat_type,
        created_at, updated_at
      ) VALUES ${placeholders}
    `;
    
    const flatParams = appointmentValues.flat();
    
    const [result] = await db.execute(batchInsertQuery, flatParams);
    
    console.log(`✅ ${maxRepeats} tekrarlanan randevu tek sorguda oluşturuldu`);
    console.log('Batch INSERT sonucu:', {
      affectedRows: result.affectedRows,
      insertId: result.insertId
    });
    
    try {
      const io = getIO();
      if (io) {
        io.to(`user-${userId}`).emit('appointments-batch-created', {
          count: maxRepeats,
          type: repeat,
          message: `${maxRepeats} tekrarlanan randevu oluşturuldu`
        });

        if (visibleToUsers && visibleToUsers.length > 0) {
          visibleToUsers.forEach(visibleUser => {
            if (visibleUser.id && visibleUser.id !== userId) {
              io.to(`user-${visibleUser.id}`).emit('appointments-batch-created', {
                count: maxRepeats,
                type: repeat,
                message: `Size görünür ${maxRepeats} tekrarlanan randevu oluşturuldu`
              });
            }
          });
        }

        if (visibleToAll) {
          io.emit('appointments-batch-created', {
            count: maxRepeats,
            type: repeat,
            message: `Herkese görünür ${maxRepeats} tekrarlanan randevu oluşturuldu`
          });
        }
      }
    } catch (socketError) {
      console.error('Socket.IO event gönderme hatası:', socketError);
    }
    
    return { success: true, count: maxRepeats };
    
  } catch (error) {
    console.error('Batch INSERT hatası:', error);
    throw error;
  }
};

const createAppointment = async (req, res) => {
  try {
    const userId = req.user.id;
    const userName = req.user.name;
    const userEmail = req.user.email;
    const { 
      title, 
      date, 
      startTime, 
      endTime,
      description, 
      color,
      google_event_id,
      notificationEmail,
      notificationSMS,
      selectedContacts,
      visibleToUsers,
      visibleToAll,
      location,
      reminderDateTime,
      reminderEnabled,
      repeat
    } = req.body;
    

    
    const status = 'SCHEDULED'; 
    
    console.log('Çıkarılan veriler:');
    console.log('title:', title);
    console.log('date:', date);
    console.log('startTime:', startTime);
    console.log('endTime:', endTime);
    console.log('notificationEmail:', notificationEmail);
    console.log('notificationSMS:', notificationSMS);
    console.log('selectedContacts:', selectedContacts);
    console.log('visibleToUsers:', visibleToUsers);
    console.log('location:', location);

    const attendeeName = null;
    const attendeeEmail = null;
    const attendeePhone = null;

    console.log('Çakışma kontrolü yapılıyor...');
    const globalConflicts = await checkGlobalAppointmentConflict(date, startTime, endTime, null, null); 
    console.log('Çakışma kontrolü sonucu:', globalConflicts);
    
    if (globalConflicts.length > 0) {
      console.log('GLOBAL ÇAKIŞMA TESPİT EDİLDİ!');
      return res.status(409).json({
        success: false,
        message: 'Bu saatte zaten başka bir randevu bulunmaktadır. Lütfen farklı bir saat seçiniz.',
        conflicts: globalConflicts.map(conflict => ({
          id: conflict.id,
          title: conflict.title,
          startTime: conflict.start_time,
          endTime: conflict.end_time,
          conflictType: 'global'
        }))
      });
    }
    
    console.log('Çakışma yok, randevu oluşturuluyor...');

    console.log('Kaydedilecek tarih:', date);

    const query = `
      INSERT INTO appointments (
        user_id, title, date, start_time, end_time,
        created_by_name, created_by_email,
        attendee_name, attendee_email, attendee_phone,
        description, color, location,
        notification_email, notification_sms,
        reminder_value, reminder_unit,
        google_event_id, source,
        status,
        invitees, visible_to_users,
        visible_to_all, repeat_type,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    
    const inviteesJson = selectedContacts && selectedContacts.length > 0 
      ? JSON.stringify(selectedContacts.map(contact => ({
          name: contact.name,
          email: contact.email || null,
          phone: contact.phone1 || contact.phone || null
        })))
      : JSON.stringify([]);
    
    const visibleUsersJson = visibleToUsers && visibleToUsers.length > 0
      ? JSON.stringify(visibleToUsers.map(user => ({
          id: user.id,
          name: user.name,
          email: user.email
        })))
      : JSON.stringify([]);
    
    const queryParams = [
      userId, title, date, startTime, endTime, 
      userName, userEmail, 
      attendeeName, attendeeEmail, attendeePhone,
      description, color, location,
      notificationEmail || false, notificationSMS || false,
      null, null, 
      google_event_id || null, 
      'SYSTEM', 
      status || 'SCHEDULED',
      inviteesJson, visibleUsersJson, 
      visibleToAll || false,
      repeat || 'TEKRARLANMAZ' 
    ];
    
    console.log('Veritabanına kaydetme sorgusu:', query);
    console.log('Sorgu parametreleri:', queryParams);
    
    const [result] = await db.execute(query, queryParams);
    console.log('Veritabanı kayıt sonucu:', result);
    
    const appointmentId = result.insertId;
    
    console.log('Görünürlük ayarları kaydedildi - visible_to_all:', visibleToAll, 'visible_to_users count:', visibleToUsers?.length || 0);

    const [newAppointment] = await db.execute(`
      SELECT 
        a.*,
        creator.name as creator_name,
        creator.email as creator_email
      FROM appointments a
      LEFT JOIN users creator ON a.user_id = creator.id
      WHERE a.id = ?
    `, [appointmentId]);

    console.log('Katılımcı bilgileri JSON olarak ana tabloda kaydedildi:', attendeeName);

    if (reminderEnabled && reminderDateTime) {
      try {
        console.log('📅 Hatırlatma zamanlanıyor:', {
          appointmentId,
          reminderDateTime,
          reminderEnabled,
          appointmentDate: date,
          appointmentTime: startTime
        });
        
        const reminderTime = new Date(reminderDateTime);
        const reminderTimeForDB = reminderTime.toISOString().slice(0, 19).replace('T', ' ');
        
        console.log('⏰ Hatırlatma zamanı:', reminderDateTime);
        console.log('⏰ DB formatı:', reminderTimeForDB);
        
        const currentTime = new Date();
        
        console.log('⏰ Geçmiş zaman kontrolü:', {
          currentTime: currentTime.toISOString(),
          reminderTime: reminderTime.toISOString()
        });
        
        if (reminderTime <= currentTime) {
          console.log(`⚠️ Hatırlatma zamanı geçmişte, zamanlanmadı. Şu anki zaman: ${currentTime.toLocaleString()}, Hatırlatma zamanı: ${reminderTime.toLocaleString()}`);
        } else {
          const [reminderResult] = await db.execute(
            `INSERT INTO appointment_reminders (appointment_id, reminder_time, status, created_at, updated_at) 
             VALUES (?, ?, 'scheduled', NOW(), NOW())`,
            [appointmentId, reminderTimeForDB]
          );
          
          if (reminderResult.insertId) {
            console.log('✅ Hatırlatma başarıyla zamanlandı:', {
              reminderId: reminderResult.insertId,
              appointmentId,
              originalReminderDateTime: reminderDateTime,
              adjustedReminderTime: reminderTimeForDB
            });
          } else {
            console.log('⚠️ Hatırlatma zamanlanamadı');
          }
        }
      } catch (reminderError) {
        console.error('Hatırlatma kaydı oluşturma hatası:', reminderError);
      }
    } else if (reminderEnabled && !reminderDateTime) {
      console.log('⚠️ Hatırlatma etkin ama reminderDateTime yok');
    } else {
      console.log('ℹ️ Hatırlatma etkin değil, zamanlanmadı');
    }

    try {
      const user = req.user;
      await logActivity(
        userId,
        user.name,
        user.email,
        'CREATE',
        'appointments',
        appointmentId,
        `Yeni randevu oluşturuldu: ${title}`,
        null,
        {
          title,
          date,
          startTime,
          endTime,
          selectedContacts: selectedContacts || [],
          description,
          location
        },
        req.ip,
        req.get('User-Agent')
      );
      console.log('Randevu oluşturma aktivitesi kaydedildi');
    } catch (activityError) {
      console.error('Aktivite kaydetme hatası:', activityError);
    }

    console.log('Randevu başarıyla oluşturuldu, yanıt gönderiliyor...');
    console.log('Oluşturulan randevu:', newAppointment[0]);
    
    let createdAppointments = [newAppointment[0]];
    
    if (repeat && repeat !== 'TEKRARLANMAZ') {
      try {
        const repeatResult = await createRepeatedAppointments({
          originalAppointment: newAppointment[0],
          repeat,
          title,
          description,
          startTime,
          endTime,
          color,
          location,
          userId,
          selectedContacts,
          visibleToUsers,
          visibleToAll,
          notificationEmail,
          notificationSMS
        });
        
        if (repeatResult && repeatResult.success) {
          console.log(`${repeatResult.count} tekrarlanan randevu oluşturuldu`);
        }
      } catch (repeatError) {
        console.error('Tekrarlanan randevuları oluşturma hatası:', repeatError);
      }
    } else {
      console.log('Tekrarlanan randevu oluşturulmayacak - repeat:', repeat);
    }

    try {
      const io = getIO();
      if (io) {
        io.to(`user-${userId}`).emit('appointment-created', {
          appointment: newAppointment[0],
          message: 'Yeni randevu eklendi'
        });
        console.log(`Socket.IO appointment-created event kullanıcı ${userId} odasına gönderildi`);

        if (visibleToUsers && visibleToUsers.length > 0) {
          visibleToUsers.forEach(visibleUser => {
            if (visibleUser.id && visibleUser.id !== userId) {
              io.to(`user-${visibleUser.id}`).emit('appointment-created', {
                appointment: newAppointment[0],
                message: 'Size görünür yeni randevu eklendi'
              });
              console.log(`Socket.IO appointment-created event görünür kullanıcı ${visibleUser.id} odasına gönderildi`);
            }
          });
        }

        if (visibleToAll) {
          io.emit('appointment-created', {
            appointment: newAppointment[0],
            message: 'Herkese görünür yeni randevu eklendi'
          });
          console.log('Socket.IO appointment-created event tüm kullanıcılara gönderildi');
        }
      }
    } catch (socketError) {
      console.error('Socket.IO event gönderme hatası:', socketError);
    }

    res.status(201).json({
      success: true,
      data: newAppointment[0],
      createdAppointments: createdAppointments,
      message: `Randevu başarıyla oluşturuldu${createdAppointments.length > 1 ? ` (${createdAppointments.length - 1} tekrarlanan randevu dahil)` : ''}`
    });
    
    console.log('Başarılı yanıt gönderildi, bildirimler arka planda gönderiliyor...');

    const sendNotificationsAsync = async () => {
      const appointmentData = {
        title,
        date,
        startTime,
        endTime,
        description,
        location
      };

      const notificationPromises = [];

      if (selectedContacts && selectedContacts.length > 0) {
        console.log('Davetli kişilere bildirim gönderiliyor:', selectedContacts);
        
        for (const contact of selectedContacts) {
          // E-posta bildirimi
          if (notificationEmail && contact.email) {
            notificationPromises.push(
              emailService.sendAppointmentNotification(
                appointmentData,
                contact.email,
                'created'
              ).then(() => {
                console.log('Davetli kişiye e-posta gönderildi:', contact.email);
              }).catch(emailError => {
                console.error('Davetli kişiye e-posta gönderme hatası:', emailError);
              })
            );
          }
          
          if (notificationSMS && contact.phone) {
            const smsMessage = `Randevu Daveti: ${title}\nTarih: ${date}\nSaat: ${startTime} - ${endTime}\nKonum: ${location || 'Belirtilmemiş'}`;
            notificationPromises.push(
              smsService.sendSMS(contact.phone, smsMessage).then(smsResult => {
                console.log('Davetli SMS gönderim sonucu:', smsResult);
                if (smsResult.success) {
                  console.log('Davetli kişiye SMS başarıyla gönderildi:', contact.phone);
                } else {
                  console.error('Davetli SMS gönderim başarısız:', smsResult.error);
                }
              }).catch(smsError => {
                console.error('Davetli kişiye SMS gönderme hatası:', smsError);
              })
            );
          }
        }
      }

      if (visibleToUsers && visibleToUsers.length > 0) {
        console.log('Görünürlük kullanıcılarına bildirim gönderiliyor:', visibleToUsers);
        
        for (const user of visibleToUsers) {
          notificationPromises.push(
            notificationsController.createNotification(
              user.id,
              'Yeni Randevu',
              `${title} - ${date} ${startTime}`,
              'appointment_created',
              appointmentId,
              'appointments'
            ).then(() => {
              console.log('Kullanıcıya uygulama içi bildirim gönderildi:', user.id);
            }).catch(notificationError => {
              console.error('Uygulama içi bildirim gönderme hatası:', notificationError);
            })
          );
          
          if (notificationEmail && user.email) {
            notificationPromises.push(
              emailService.sendAppointmentNotification(
                appointmentData,
                user.email,
                'created'
              ).then(() => {
                console.log('Kullanıcıya e-posta gönderildi:', user.email);
              }).catch(emailError => {
                console.error('Kullanıcıya e-posta gönderme hatası:', emailError);
              })
            );
          }
          
          if (notificationSMS && user.phone) {
            const smsMessage = `Yeni Randevu: ${title}\nTarih: ${date}\nSaat: ${startTime} - ${endTime}\nKonum: ${location || 'Belirtilmemiş'}`;
            notificationPromises.push(
              smsService.sendSMS(user.phone, smsMessage).then(smsResult => {
                console.log('Kullanıcı SMS gönderim sonucu:', smsResult);
                if (smsResult.success) {
                  console.log('Kullanıcıya SMS başarıyla gönderildi:', user.phone);
                } else {
                  console.error('Kullanıcı SMS gönderim başarısız:', smsResult.error);
                }
              }).catch(smsError => {
                console.error('Kullanıcıya SMS gönderme hatası:', smsError);
              })
            );
          }
        }
      }

      if (visibleToAll) {
        console.log('Tüm kullanıcılara bildirim gönderiliyor...');
        try {
          const [allUsers] = await db.execute('SELECT id, email, phone FROM users WHERE id != ?', [userId]);
          
          for (const user of allUsers) {
            notificationPromises.push(
              notificationsController.createNotification(
                user.id,
                'Yeni Randevu',
                `${title} - ${date} ${startTime}`,
                'appointment_created',
                appointmentId,
                'appointments'
              ).then(() => {
                console.log('Tüm kullanıcıya uygulama içi bildirim gönderildi:', user.id);
              }).catch(notificationError => {
                console.error('Tüm kullanıcıya uygulama içi bildirim gönderme hatası:', notificationError);
              })
            );
            
            if (notificationEmail && user.email) {
              notificationPromises.push(
                emailService.sendAppointmentNotification(
                  appointmentData,
                  user.email,
                  'created'
                ).then(() => {
                  console.log('Tüm kullanıcıya e-posta gönderildi:', user.email);
                }).catch(emailError => {
                  console.error('Tüm kullanıcıya e-posta gönderme hatası:', emailError);
                })
              );
            }
            
            if (notificationSMS && user.phone) {
              const smsMessage = `Yeni Randevu: ${title}\nTarih: ${date}\nSaat: ${startTime} - ${endTime}\nKonum: ${location || 'Belirtilmemiş'}`;
              notificationPromises.push(
                smsService.sendSMS(user.phone, smsMessage).then(smsResult => {
                  console.log('SMS gönderim sonucu:', smsResult);
                  if (smsResult.success) {
                    console.log('Tüm kullanıcıya SMS başarıyla gönderildi:', user.phone);
                  } else {
                    console.error('SMS gönderim başarısız:', smsResult.error);
                  }
                }).catch(smsError => {
                  console.error('Tüm kullanıcıya SMS gönderme hatası:', smsError);
                })
              );
            }
          }
        } catch (error) {
          console.error('Tüm kullanıcıları getirme hatası:', error);
        }
      }

      if (notificationPromises.length > 0) {
        try {
          await Promise.allSettled(notificationPromises);
          console.log('Tüm bildirimler gönderildi (başarılı/başarısız)');
        } catch (error) {
          console.error('Bildirim gönderme genel hatası:', error);
        }
      }
    };

    sendNotificationsAsync().catch(error => {
      console.error('Arka plan bildirim gönderme hatası:', error);
    });
  } catch (error) {
    console.error('=== RANDEVU OLUŞTURMA HATASI ===');
    console.error('Hata detayı:', error);
    console.error('Hata stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Randevu oluşturulamadı',
      error: error.message
    });
  }
};

const updateAppointment = async (req, res) => {
  try {
    const userId = req.user.id;
    const appointmentId = req.params.id;
    
    console.log('=== BACKEND UPDATE APPOINTMENT ===');
    console.log('appointmentId:', appointmentId);
    console.log('userId:', userId);
    console.log('req.body:', JSON.stringify(req.body, null, 2));
    const { 
      title, 
      date, 
      start_time,
      end_time,
      startTime, // Backward compatibility
      endTime,   // Backward compatibility 
      attendee, 
      description, 
      color,
      google_event_id,
      status,
      visible_to_all,
      visibleToUsers,
      visible_to_users,
      reminder_enabled,
      reminder_datetime,
      reminderEnabled,
      reminderDateTime,
      repeat_type,
      notification_email,
      notification_sms,
      reminder_value,
      reminder_unit,
      invitees,
      attendees,
      location,
      isAllDay,
      isPrivate
    } = req.body;

    const normalizedStartTime = start_time || startTime;
    const normalizedEndTime = end_time || endTime;



    const [appointmentCheck] = await db.execute(
      'SELECT * FROM appointments WHERE id = ?',
      [appointmentId]
    );

    if (appointmentCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Randevu bulunamadı'
      });
    }

    const existingAppointment = appointmentCheck;
    const user = req.user;




    let attendeeName = null;
    let attendeeEmail = null;
    let attendeePhone = null;
    
    if (attendee) {
      if (typeof attendee === 'string') {
        const [attendeeResult] = await db.execute(
          'SELECT name, email, phone FROM users WHERE name = ?',
          [attendee]
        );
        if (attendeeResult.length > 0) {
          attendeeName = attendeeResult[0].name;
          attendeeEmail = attendeeResult[0].email;
          attendeePhone = attendeeResult[0].phone;
        } else {
          attendeeName = attendee;
        }
      } else if (typeof attendee === 'object') {
        attendeeName = attendee.name;
        attendeeEmail = attendee.email;
        attendeePhone = attendee.phone;
      }
    }

    console.log('Güncellenecek tarih:', date);

    const safeStartTime = normalizedStartTime || null;
    const safeEndTime = normalizedEndTime || null;
    
    const appointmentOwnerId = existingAppointment[0].user_id;
    

    
    const conflicts = await checkGlobalAppointmentConflict(date, safeStartTime, safeEndTime, appointmentId, null); // userId=null ile TÜM randevuları kontrol et
    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Bu saatte zaten başka bir randevu bulunmaktadır. Lütfen farklı bir saat seçiniz.',
        conflicts: conflicts.map(conflict => ({
          id: conflict.id,
          title: conflict.title,
          startTime: conflict.start_time,
          endTime: conflict.end_time,
          conflictType: 'user'
        }))
      });
    }

    const visibleToAllValue = visible_to_all || false;
    const visibleUsersValue = visibleToUsers || visible_to_users || null;
    const visibleUsersJson = visibleUsersValue ? JSON.stringify(visibleUsersValue) : null;

    const inviteesJson = invitees && invitees.length > 0 
      ? JSON.stringify(invitees.map(contact => ({
          name: contact.name,
          email: contact.email || null,
          phone: contact.phone1 || contact.phone || null
        })))
      : JSON.stringify([]);

    const attendeesJson = attendees && attendees.length > 0
      ? JSON.stringify(attendees.map(attendee => ({
          name: attendee.name,
          email: attendee.email || null,
          phone: attendee.phone || null
        })))
      : JSON.stringify([]);

    const query = `
      UPDATE appointments 
      SET title = ?, date = ?, start_time = ?, end_time = ?, 
          attendee_name = ?, attendee_email = ?, attendee_phone = ?,
          description = ?, color = ?, google_event_id = ?,
          status = ?, visible_to_all = ?, visible_to_users = ?,
          repeat_type = ?, notification_email = ?, notification_sms = ?,
          reminder_value = ?, reminder_unit = ?, location = ?,
          invitees = ?, attendees = ?, updated_at = NOW()
      WHERE id = ?
    `;
    
    console.log('SQL Query:', query);
    console.log('SQL Parameters:', [
      title, date, normalizedStartTime, normalizedEndTime, 
      attendeeName, attendeeEmail, attendeePhone,
      description, color, google_event_id || null,
      status || 'SCHEDULED',
      visibleToAllValue,
      visibleUsersJson,
      repeat_type,
      notification_email || false,
      notification_sms || false,
      reminder_value,
      reminder_unit,
      location,
      inviteesJson,
      attendeesJson,
      appointmentId
    ]);

    const updateResult = await db.execute(query, [
      title, date, normalizedStartTime, normalizedEndTime, 
      attendeeName, attendeeEmail, attendeePhone,
      description, color, google_event_id || null,
      status || 'SCHEDULED',
      visibleToAllValue,
      visibleUsersJson,
      repeat_type,
      notification_email || false,
      notification_sms || false,
      reminder_value,
      reminder_unit,
      location,
      inviteesJson,
      attendeesJson,
      appointmentId
    ]);
    
    console.log('Update Result:', updateResult);
    console.log('Affected Rows:', updateResult.affectedRows);

    const oldStatus = existingAppointment[0].status;
    const newStatus = status || 'SCHEDULED';
    
    if (oldStatus !== newStatus) {
      console.log(`Status değişikliği algılandı: ${oldStatus} -> ${newStatus}`);
      
      if (newStatus === 'CANCELLED') {
        try {
          await reminderService.cancelReminder(appointmentId);
          console.log('Randevu iptal edildi, hatırlatmalar iptal edildi');
        } catch (reminderError) {
          console.error('Hatırlatma iptal hatası:', reminderError);
        }
      }
      
      try {
        const appointmentData = {
          date,
          startTime,
          endTime,
          location,
          description,
          attendee,
          oldDate: existingAppointment[0].date,
          oldStartTime: existingAppointment[0].start_time,
          oldEndTime: existingAppointment[0].end_time
        };

        await sendStatusChangeNotification(
          appointmentId,
          title,
          oldStatus,
          newStatus,
          notification_email || false,
          notification_sms || false,
          attendeeEmail,
          attendeePhone,
          invitees,
          visibleToUsers,
          appointmentData
        );
      } catch (notificationError) {
        console.error('Status değişikliği bildirimi gönderilirken hata:', notificationError);
      }
    }

    try {
      const user = req.user;
      await logActivity(
        userId,
        user.name,
        user.email,
        'UPDATE',
        'appointments',
        appointmentId,
        `Randevu güncellendi: ${title}`,
        {
          title: existingAppointment[0].title,
          date: existingAppointment[0].date,
          start_time: existingAppointment[0].start_time,
          end_time: existingAppointment[0].end_time,
          description: existingAppointment[0].description
        },
        {
          title,
          date,
          startTime,
          endTime,
          attendee,
          description
        },
        req.ip,
        req.get('User-Agent')
      );
      console.log('Randevu güncelleme aktivitesi kaydedildi');
    } catch (activityError) {
      console.error('Aktivite kaydetme hatası:', activityError);
    }

    const [updatedAppointment] = await db.execute(`
      SELECT 
        a.*,
        creator.name as creator_name,
        creator.email as creator_email
      FROM appointments a
      LEFT JOIN users creator ON a.user_id = creator.id
      WHERE a.id = ?
    `, [appointmentId]);

    if (reminder_enabled && reminder_datetime) {
      try {
        await db.execute(
          'DELETE FROM appointment_reminders WHERE appointment_id = ?',
          [appointmentId]
        );
        
        const reminderDate = new Date(reminder_datetime);
        const currentTime = new Date();
        
        if (reminderDate > currentTime) {
          await db.execute(
            'INSERT INTO appointment_reminders (appointment_id, reminder_datetime, status) VALUES (?, ?, ?)',
            [appointmentId, reminder_datetime, 'pending']
          );
          console.log(`✅ Hatırlatıcı güncellendi: ${reminder_datetime}`);
        } else {
          console.log(`⚠️ Geçmiş tarihli hatırlatıcı eklenmedi. Şu anki zaman: ${currentTime.toLocaleString()}, Hatırlatma zamanı: ${reminderDate.toLocaleString()}`);
        }
      } catch (reminderError) {
        console.error('Hatırlatıcı güncelleme hatası:', reminderError);
      }
    } else if (reminder_enabled === false) {
      try {
        await db.execute(
          'DELETE FROM appointment_reminders WHERE appointment_id = ?',
          [appointmentId]
        );
        console.log('Hatırlatıcılar silindi');
      } catch (reminderError) {
        console.error('Hatırlatıcı silme hatası:', reminderError);
      }
    }

    try {
      const io = getIO();
      if (io) {
        const appointment = updatedAppointment[0];
        
        io.to(`user-${userId}`).emit('appointment-updated', {
          appointment: appointment,
          message: 'Randevu güncellendi'
        });
        console.log(`Socket.IO appointment-updated event kullanıcı ${userId} odasına gönderildi`);

        if (appointment.visible_to_users) {
          try {
            const visibleUsers = JSON.parse(appointment.visible_to_users);
            if (Array.isArray(visibleUsers)) {
              visibleUsers.forEach(visibleUser => {
                if (visibleUser.id && visibleUser.id !== userId) {
                  io.to(`user-${visibleUser.id}`).emit('appointment-updated', {
                    appointment: appointment,
                    message: 'Size görünür randevu güncellendi'
                  });
                  console.log(`Socket.IO appointment-updated event görünür kullanıcı ${visibleUser.id} odasına gönderildi`);
                }
              });
            }
          } catch (parseError) {
            console.error('visible_to_users parse hatası:', parseError);
          }
        }

        if (appointment.visible_to_all) {
          io.emit('appointment-updated', {
            appointment: appointment,
            message: 'Herkese görünür randevu güncellendi'
          });
          console.log('Socket.IO appointment-updated event tüm kullanıcılara gönderildi');
        }
      }
    } catch (socketError) {
      console.error('Socket.IO event gönderme hatası:', socketError);
    }

    if (reminderEnabled && reminderDateTime) {
      try {
        console.log('📅 Hatırlatma zamanlanıyor:', {
          appointmentId,
          reminderDateTime,
          reminderEnabled,
          appointmentDate: date,
          appointmentTime: normalizedStartTime
        });
        
        await db.execute(
          'DELETE FROM appointment_reminders WHERE appointment_id = ?',
          [appointmentId]
        );
        
        const reminderTime = new Date(reminderDateTime);
        const reminderTimeForDB = reminderTime.toISOString().slice(0, 19).replace('T', ' ');
        
        console.log('⏰ Hatırlatma zamanı:', reminderDateTime);
        console.log('⏰ DB formatı:', reminderTimeForDB);
        
        const currentTime = new Date();
        
        console.log('⏰ Geçmiş zaman kontrolü:', {
          currentTime: currentTime.toISOString(),
          reminderTime: reminderTime.toISOString()
        });
        
        if (reminderTime <= currentTime) {
          console.log(`⚠️ Hatırlatma zamanı geçmişte, zamanlanmadı. Şu anki zaman: ${currentTime.toLocaleString()}, Hatırlatma zamanı: ${reminderTime.toLocaleString()}`);
        } else {
          const [reminderResult] = await db.execute(
            `INSERT INTO appointment_reminders (appointment_id, reminder_time, status, created_at, updated_at) 
             VALUES (?, ?, 'scheduled', NOW(), NOW())`,
            [appointmentId, reminderTimeForDB]
          );
          
          if (reminderResult.insertId) {
            console.log('✅ Hatırlatma başarıyla zamanlandı:', {
              reminderId: reminderResult.insertId,
              appointmentId,
              originalReminderDateTime: reminderDateTime,
              adjustedReminderTime: reminderTimeForDB
            });
          } else {
            console.log('⚠️ Hatırlatma zamanlanamadı');
          }
        }
      } catch (reminderError) {
        console.error('❌ Hatırlatma kaydetme hatası:', reminderError);
      }
    } else if (reminderEnabled && !reminderDateTime) {
      console.log('⚠️ reminderEnabled true ama reminderDateTime yok');
    } else if (!reminderEnabled) {
      console.log('ℹ️ Hatırlatma etkin değil, hatırlatma kaydedilmedi');
      try {
        await db.execute(
          'DELETE FROM appointment_reminders WHERE appointment_id = ?',
          [appointmentId]
        );
        console.log('🗑️ Mevcut hatırlatmalar silindi');
      } catch (deleteError) {
        console.error('❌ Hatırlatma silme hatası:', deleteError);
      }
    }

    console.log('=== RESPONSE GÖNDERILIYOR ===');
    console.log('updatedAppointment:', updatedAppointment);
    console.log('updatedAppointment[0]:', updatedAppointment[0]);
    
    res.json({
      success: true,
      data: updatedAppointment[0],
      message: 'Randevu başarıyla güncellendi'
    });
  } catch (error) {
    console.error('Randevu güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevu güncellenemedi'
    });
  }
};

const deleteAppointment = async (req, res) => {
  try {
    const userId = req.user.id;
    const appointmentId = req.params.id;

    const [appointmentCheck] = await db.execute(
      'SELECT * FROM appointments WHERE id = ?',
      [appointmentId]
    );

    if (appointmentCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Randevu bulunamadı'
      });
    }

    const existingAppointment = appointmentCheck;
    const user = req.user;
    const appointment = existingAppointment[0];

    const googleEventId = appointment.google_event_id;
    console.log('🔍 Silinecek randevunun Google Event ID:', googleEventId);


    try {
      const user = req.user;
      await logActivity(
        userId,
        user.name,
        user.email,
        'DELETE',
        'appointments',
        appointmentId,
        `Randevu silindi: ${existingAppointment[0].title}`,
        {
          title: existingAppointment[0].title,
          date: existingAppointment[0].date,
          start_time: existingAppointment[0].start_time,
          end_time: existingAppointment[0].end_time,
          description: existingAppointment[0].description
        },
        null,
        req.ip,
        req.get('User-Agent')
      );
      console.log('Randevu silme aktivitesi kaydedildi');
    } catch (activityError) {
      console.error('Aktivite kaydetme hatası:', activityError);
    }

    try {
      await reminderService.cancelReminder(appointmentId);
      console.log('Randevu hatırlatmaları iptal edildi');
    } catch (reminderError) {
      console.error('Hatırlatma iptal hatası:', reminderError);
    }

    await db.execute('DELETE FROM appointments WHERE id = ?', [appointmentId]);

    try {
      const io = getIO();
      if (io) {
        const appointment = existingAppointment[0];
        
        io.to(`user-${userId}`).emit('appointment-deleted', {
          appointmentId: appointmentId,
          appointment: appointment,
          message: 'Randevu silindi'
        });
        console.log(`Socket.IO appointment-deleted event kullanıcı ${userId} odasına gönderildi`);

        if (appointment.visible_to_users) {
          try {
            const visibleUsers = JSON.parse(appointment.visible_to_users);
            if (Array.isArray(visibleUsers)) {
              visibleUsers.forEach(visibleUser => {
                if (visibleUser.id && visibleUser.id !== userId) {
                  io.to(`user-${visibleUser.id}`).emit('appointment-deleted', {
                    appointmentId: appointmentId,
                    appointment: appointment,
                    message: 'Size görünür randevu silindi'
                  });
                  console.log(`Socket.IO appointment-deleted event görünür kullanıcı ${visibleUser.id} odasına gönderildi`);
                }
              });
            }
          } catch (parseError) {
            console.error('visible_to_users parse hatası:', parseError);
          }
        }

        if (appointment.visible_to_all) {
          io.emit('appointment-deleted', {
            appointmentId: appointmentId,
            appointment: appointment,
            message: 'Herkese görünür randevu silindi'
          });
          console.log('Socket.IO appointment-deleted event tüm kullanıcılara gönderildi');
        }
      }
    } catch (socketError) {
      console.error('Socket.IO event gönderme hatası:', socketError);
    }

    res.json({
      success: true,
      message: 'Randevu başarıyla silindi',
      googleEventId: googleEventId 
    });
  } catch (error) {
    console.error('Randevu silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevu silinemedi'
    });
  }
};

const getAppointmentsByDateRange = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = req.user;
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: 'Başlangıç ve bitiş tarihleri gerekli'
      });
    }

    const canViewAll = user.role === 'admin' || 
                      user.role === 'başkan' || 
                      user.department === 'BAŞKAN';

    console.log('🔴 getAppointmentsByDateRange DEBUG - Tarih aralığı:', start, 'ile', end);
    console.log('🔴 getAppointmentsByDateRange DEBUG - User ID:', userId);
    console.log('🔴 getAppointmentsByDateRange DEBUG - Can view all:', canViewAll);
    
    let query, queryParams;
    
    if (canViewAll) {
      query = `
        SELECT DISTINCT
          a.*,
          creator.name as creator_name,
          creator.email as creator_email
        FROM appointments a
        LEFT JOIN users creator ON a.user_id = creator.id
        WHERE a.status NOT IN ('COMPLETED', 'CANCELLED') AND DATE(a.date) BETWEEN ? AND ?
        ORDER BY a.date, a.start_time
      `;
      queryParams = [start, end];
    } else {
      query = `
        SELECT DISTINCT
          a.*,
          creator.name as creator_name,
          creator.email as creator_email
        FROM appointments a
        LEFT JOIN users creator ON a.user_id = creator.id
        WHERE a.status NOT IN ('COMPLETED', 'CANCELLED') AND (
          a.user_id = ? OR 
          a.visible_to_all = TRUE OR
          (
            a.visible_to_users IS NOT NULL AND 
            (
              JSON_SEARCH(a.visible_to_users, 'one', ?) IS NOT NULL OR
              JSON_SEARCH(a.visible_to_users, 'one', CAST(? AS CHAR)) IS NOT NULL
            )
          )
        ) AND DATE(a.date) BETWEEN ? AND ?
        ORDER BY a.date, a.start_time
      `;
      queryParams = [userId, userId.toString(), userId, start, end];
    }
    
    const [appointments] = await db.execute(query, queryParams);
    
    for (let appointment of appointments) {
      try {
        const safeJsonParse = (jsonString) => {
          if (!jsonString || jsonString === null || jsonString === '') {
            return [];
          }
          try {
            return JSON.parse(jsonString);
          } catch {
            return [];
          }
        };
        
        appointment.attendees = safeJsonParse(appointment.attendees);
        appointment.invitees = safeJsonParse(appointment.invitees);
        appointment.visible_to_users = safeJsonParse(appointment.visible_to_users);
      } catch (error) {
        console.error('JSON parse hatası (date range):', error);
        appointment.attendees = [];
        appointment.invitees = [];
        appointment.visible_to_users = [];
      }
    }
    
    res.json({
      success: true,
      data: appointments
    });
  } catch (error) {
    console.error('Tarih aralığındaki randevular getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevular getirilemedi'
    });
  }
};

const getInviteePreviousAppointments = async (req, res) => {
  try {
    const { inviteeEmails, currentDate, currentTime, page = 1, limit = 5 } = req.body;
    
    console.log('=== ÖNCEKI RANDEVULAR İSTEĞİ ===');
    console.log('inviteeEmails:', inviteeEmails);
    console.log('currentDate:', currentDate);
    console.log('currentTime:', currentTime);
    console.log('page:', page, 'limit:', limit);
    
    if (!inviteeEmails || !Array.isArray(inviteeEmails) || inviteeEmails.length === 0) {
      return res.status(400).json({ error: 'Davetli e-postaları gerekli' });
    }

    const offset = (page - 1) * parseInt(limit);
    
    const emailConditions = inviteeEmails.map(() => 'JSON_SEARCH(a.invitees, "one", ?, NULL, "$[*].email") IS NOT NULL').join(' OR ');
    
    const query = `
      SELECT DISTINCT
        a.id,
        a.title,
        a.description,
        a.date,
        a.start_time,
        a.end_time,
        a.location,
        a.status,
        a.color,
        a.created_at,
        a.updated_at,
        a.invitees,
        creator.name as creator_name,
        creator.email as creator_email
      FROM appointments a
      LEFT JOIN users creator ON a.user_id = creator.id
      WHERE (a.date < ? OR (a.date = ? AND a.start_time < ?))
        AND (${emailConditions})
      ORDER BY a.date DESC, a.start_time DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT a.id) as total
      FROM appointments a
      WHERE (a.date < ? OR (a.date = ? AND a.start_time < ?))
        AND (${emailConditions})
    `;

    console.log('Executing query:', query);
    console.log('Parameters:', [currentDate, currentDate, currentTime || '23:59', ...inviteeEmails, limit.toString(), offset.toString()]);

    const [appointments] = await db.execute(query, [currentDate, currentDate, currentTime || '23:59', ...inviteeEmails, limit.toString(), offset.toString()]);
    const [countResult] = await db.execute(countQuery, [currentDate, currentDate, currentTime || '23:59', ...inviteeEmails]);
    
    console.log('Found appointments:', appointments.length);
    console.log('Total count:', countResult[0]?.total || 0);

    const formattedAppointments = appointments.map(appointment => {
      let invitees = [];
      try {
        if (appointment.invitees) {
          invitees = typeof appointment.invitees === 'string' 
            ? JSON.parse(appointment.invitees) 
            : appointment.invitees;
        }
      } catch (error) {
        console.error('JSON parse hatası (invitees):', error);
        invitees = [];
      }
      
      const appointmentDate = new Date(appointment.date);
      const now = new Date();
      const diffTime = now - appointmentDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let timeAgo = '';
      if (diffDays === 1) {
        timeAgo = '1 gün önce';
      } else if (diffDays < 7) {
        timeAgo = `${diffDays} gün önce`;
      } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        timeAgo = `${weeks} hafta önce`;
      } else if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        timeAgo = `${months} ay önce`;
      } else {
        const years = Math.floor(diffDays / 365);
        timeAgo = `${years} yıl önce`;
      }
      
      return {
        id: appointment.id,
        title: appointment.title,
        description: appointment.description,
        date: appointment.date,
        start_time: appointment.start_time,
        end_time: appointment.end_time,
        location: appointment.location,
        status: appointment.status || 'pending',
        color: appointment.color,
        creator_name: appointment.creator_name,
        creator_email: appointment.creator_email,
        created_at: appointment.created_at,
        updated_at: appointment.updated_at,
        time_ago: timeAgo,
        invitees: invitees.filter(inv => inv.email && inv.name)
      };
    });

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    console.log(`Found ${total} previous appointments for invitees:`, inviteeEmails);

    res.json({
      appointments: formattedAppointments,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Önceki randevuları getirme hatası:', error);
    res.status(500).json({ error: 'Önceki randevuları getirirken hata oluştu' });
  }
};

// ID'ye göre randevu getir
const getAppointmentById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Randevu ID gerekli'
      });
    }

    const user = req.user;
    
    const canViewAll = user.role === 'admin' || 
                      user.role === 'başkan' || 
                      user.department === 'BAŞKAN';
    
    let query, queryParams;
    
    if (canViewAll) {
      query = `
        SELECT DISTINCT
          a.*,
          creator.name as creator_name,
          creator.email as creator_email,
          COALESCE(creator.name, a.created_by_name, 'Bilinmiyor') as created_by_name,
          COALESCE(creator.email, a.created_by_email) as created_by_email
        FROM appointments a
        LEFT JOIN users creator ON a.user_id = creator.id
        WHERE a.id = ?
      `;
      queryParams = [id];
    } else {
      query = `
        SELECT DISTINCT
          a.*,
          creator.name as creator_name,
          creator.email as creator_email,
          COALESCE(creator.name, a.created_by_name, 'Bilinmiyor') as created_by_name,
          COALESCE(creator.email, a.created_by_email) as created_by_email
        FROM appointments a
        LEFT JOIN users creator ON a.user_id = creator.id
        WHERE a.id = ? AND (
          a.user_id = ? OR 
          a.visible_to_all = TRUE OR
          (
            a.visible_to_users IS NOT NULL AND 
            (
              JSON_SEARCH(a.visible_to_users, 'one', ?) IS NOT NULL OR
              JSON_SEARCH(a.visible_to_users, 'one', CAST(? AS CHAR)) IS NOT NULL
            )
          )
        )
      `;
      queryParams = [id, userId, userId.toString(), userId];
    }
    
    const [appointments] = await db.execute(query, queryParams);
    
    if (!appointments || appointments.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Randevu bulunamadı'
      });
    }

    const safeJsonParse = (jsonData) => {
      if (typeof jsonData === 'object' && jsonData !== null) {
        return Array.isArray(jsonData) ? jsonData : [jsonData];
      }
      if (typeof jsonData === 'string') {
        if (!jsonData || jsonData === null || jsonData === '') {
          return [];
        }
        try {
          return JSON.parse(jsonData);
        } catch {
          return [];
        }
      }
      return [];
    };

    const appointmentData = appointments[0];
    
    let invitees = [];
    let attendees = [];
    let visibleUsers = [];
    
    try {
      if (appointmentData.id === 11) { // Sizin randevunuzun ID'si
        console.log('=== BACKEND INVITEES DEBUG (Appointment ID: 11) ===');
        console.log('PARSE ÖNCESI:');
        console.log('Raw invitees from DB:', appointmentData.invitees);
        console.log('Type invitees:', typeof appointmentData.invitees);
        console.log('Raw attendees from DB:', appointmentData.attendees);
        console.log('Type attendees:', typeof appointmentData.attendees);
        console.log('Raw attendee_name:', appointmentData.attendee_name);
        console.log('Raw attendee_email:', appointmentData.attendee_email);
      }

      attendees = safeJsonParse(appointmentData.attendees);
      invitees = safeJsonParse(appointmentData.invitees);
      visibleUsers = safeJsonParse(appointmentData.visible_to_users);
      
      if (appointmentData.id === 11) { // Sizin randevunuzun ID'si
        console.log('PARSE SONRASI:');
        console.log('Parsed invitees:', invitees);
        console.log('Is Array:', Array.isArray(invitees));
        console.log('Length:', invitees ? invitees.length : 'null');
        if (invitees && invitees.length > 0) {
          console.log('First invitee:', invitees[0]);
        }
        console.log('Parsed attendees:', attendees);
        console.log('===================================================');
      }
    } catch (error) {
      console.error('JSON parse hatası (getAppointmentById):', error);
    }

    const [reminders] = await db.execute(
      'SELECT id, reminder_time, status, sent_at, created_at FROM appointment_reminders WHERE appointment_id = ? ORDER BY reminder_time DESC LIMIT 1',
      [id]
    );

    console.log('=== BACKEND RANDEVU DETAYLARI DEBUG ===');
    console.log('Veritabanından gelen randevu:', appointmentData);
    console.log('Davetliler:', invitees);
    console.log('Katılımcılar:', attendees);
    console.log('Hatırlatma bilgileri:', reminders);
    console.log('=========================================');

    const appointment = {
      ...appointmentData,
      invitees: invitees,
      attendees: attendees,
      visible_to_users: visibleUsers,
      reminder_info: reminders.length > 0 ? reminders[0] : null,
      reminderDateTime: reminders.length > 0 ? reminders[0].reminder_time : null,
      reminderBefore: reminders.length > 0
    };
    
    res.json({
      success: true,
      data: appointment
    });
  } catch (error) {
    console.error('Randevu getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevu getirilemedi'
    });
  }
};

const resendReminder = async (req, res) => {
  try {
    const userId = req.user.id;
    const appointmentId = req.params.id;
    const { reminderDateTime } = req.body; // Manuel saat girişi

    const [existingAppointment] = await db.execute(
      'SELECT * FROM appointments WHERE id = ? AND user_id = ?',
      [appointmentId, userId]
    );

    if (existingAppointment.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu randevuya erişim yetkiniz yok'
      });
    }

    const [reminders] = await db.execute(
      'SELECT * FROM appointment_reminders WHERE appointment_id = ? ORDER BY reminder_time DESC LIMIT 1',
      [appointmentId]
    );

    if (reminders.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bu randevu için hatırlatma bulunamadı'
      });
    }

    const reminder = reminders[0];

    if (reminder.status === 'scheduled') {
      return res.status(400).json({
        success: false,
        message: 'Hatırlatma henüz gönderilmedi. Zamanı değiştirmek için diğer seçeneği kullanın.'
      });
    }

    let reminderTime;
    
    if (reminderDateTime) {
      reminderTime = reminderDateTime;
      
      if (new Date(reminderTime) <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Hatırlatma zamanı gelecekte olmalıdır'
        });
      }
    } else {
      reminderTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    const [result] = await db.execute(
      `INSERT INTO appointment_reminders (appointment_id, reminder_time, status, created_at, updated_at) 
       VALUES (?, ?, 'scheduled', NOW(), NOW())`,
      [appointmentId, reminderTime]
    );

    if (!reminderDateTime) {
      const reminderService = require('../services/reminderService');
      const newReminder = {
        id: result.insertId,
        appointment_id: appointmentId,
        reminder_time: reminderTime,
        ...existingAppointment[0]
      };

      await reminderService.processReminder(newReminder);
    }

    res.json({
      success: true,
      message: reminderDateTime 
        ? 'Hatırlatma başarıyla zamanlandı' 
        : 'Hatırlatma başarıyla yeniden gönderildi'
    });

  } catch (error) {
    console.error('Hatırlatma yeniden gönderme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Hatırlatma yeniden gönderilemedi',
      error: error.message
    });
  }
};

const updateReminderTime = async (req, res) => {
  try {
    const userId = req.user.id;
    const appointmentId = req.params.id;
    const { reminderValue, reminderUnit } = req.body;

    const [existingAppointment] = await db.execute(
      'SELECT * FROM appointments WHERE id = ? AND user_id = ?',
      [appointmentId, userId]
    );

    if (existingAppointment.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu randevuya erişim yetkiniz yok'
      });
    }

    const appointment = existingAppointment[0];

    await db.execute(
      'UPDATE appointment_reminders SET status = "cancelled", updated_at = NOW() WHERE appointment_id = ? AND status = "scheduled"',
      [appointmentId]
    );

    const reminderService = require('../services/reminderService');
    const success = await reminderService.scheduleReminder(
      appointmentId,
      reminderValue,
      reminderUnit
    );

    if (success && success.success) {
      await db.execute(
        'UPDATE appointments SET reminder_value = ?, reminder_unit = ?, updated_at = NOW() WHERE id = ?',
        [reminderValue, reminderUnit, appointmentId]
      );

      res.json({
        success: true,
        message: success.message || 'Hatırlatma zamanı başarıyla güncellendi'
      });
    } else {
      res.status(400).json({
        success: false,
        message: success && success.message ? success.message : 'Hatırlatma zamanlanamadı. Geçerli bir gelecek zaman seçiniz.'
      });
    }

  } catch (error) {
    console.error('Hatırlatma zamanı güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Hatırlatma zamanı güncellenemedi',
      error: error.message
    });
  }
};

const getAppointmentStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = 'HAFTALIK' } = req.query; // HAFTALIK, AYLIK veya YILLIK
    
    const today = new Date();
    let stats = [];
    let colors = ['#A7F3D0', '#6EE7B7', '#34D399', '#10B981', '#059669', '#047857', '#065F46'];
    
    if (period === 'YILLIK') {
      const monthNames = ['OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA'];
      colors = ['#A7F3D0', '#6EE7B7', '#34D399', '#10B981', '#059669', '#047857', '#065F46', '#A7F3D0', '#6EE7B7', '#34D399', '#10B981', '#059669'];
      
      for (let i = 11; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const nextMonth = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
        
        const [result] = await db.execute(
          `SELECT COUNT(*) as count FROM appointments 
           WHERE DATE(date) >= ? AND DATE(date) < ?`,
          [formatDateForDB(date), formatDateForDB(nextMonth)]
        );
        
        stats.push({
          day: monthNames[date.getMonth()],
          value: result[0].count,
          color: colors[11 - i]
        });
      }
    } else if (period === 'AYLIK') {
      const weekNames = ['1. HAFTA', '2. HAFTA', '3. HAFTA', '4. HAFTA'];
      colors = ['#A7F3D0', '#6EE7B7', '#34D399', '#10B981'];
      
      for (let week = 0; week < 4; week++) {
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - (30 - (week * 7)));
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        
        const [result] = await db.execute(
          `SELECT COUNT(*) as count FROM appointments 
           WHERE DATE(date) >= ? AND DATE(date) <= ?`,
          [formatDateForDB(startDate), formatDateForDB(endDate)]
        );
        
        stats.push({
          day: weekNames[week],
          value: result[0].count,
          color: colors[week]
        });
      }
    } else {
      const dayNames = ['PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CMT', 'PZR'];
      
      const currentDay = today.getDay();
      const mondayOffset = currentDay === 0 ? 6 : currentDay - 1; // Pazar = 0, Pazartesi = 1
      const monday = new Date(today);
      monday.setDate(today.getDate() - mondayOffset);
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        
        const [result] = await db.execute(
          `SELECT COUNT(*) as count FROM appointments 
           WHERE DATE(date) = ?`,
          [formatDateForDB(date)]
        );
        
        stats.push({
          day: dayNames[i],
          value: result[0].count,
          color: colors[i]
        });
      }
    }
    
    const [totalResult] = await db.execute(
      'SELECT COUNT(*) as total FROM appointments'
    );
    
    res.json({
      success: true,
      data: {
        dailyStats: stats,
        total: totalResult[0].total,
        period: period
      }
    });
    
  } catch (error) {
    console.error('Randevu istatistikleri getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevu istatistikleri getirilemedi',
      error: error.message
    });
  }
};

const sendStatusChangeNotification = async (
  appointmentId,
  title,
  oldStatus,
  newStatus,
  emailNotificationEnabled,
  smsNotificationEnabled,
  attendeeEmail,
  attendeePhone,
  invitees,
  visibleToUsers,
  appointmentData = null
) => {
  try {
    console.log('Status değişikliği bildirimi gönderiliyor:', {
      appointmentId,
      title,
      oldStatus,
      newStatus,
      emailNotificationEnabled,
      smsNotificationEnabled
    });

    const statusTranslations = {
      'SCHEDULED': 'Planlandı',
      'CONFIRMED': 'Onaylandı',
      'COMPLETED': 'Tamamlandı',
      'CANCELLED': 'İptal Edildi',
      'RESCHEDULED': 'Yeniden Planlandı'
    };

    const oldStatusText = statusTranslations[oldStatus] || oldStatus;
    const newStatusText = statusTranslations[newStatus] || newStatus;

    let notificationMessage = '';
    if (newStatus === 'RESCHEDULED') {
      notificationMessage = `"${title}" randevunuz yeniden planlandı.`;
    } else if (newStatus === 'CANCELLED') {
      notificationMessage = `"${title}" randevunuz iptal edildi.`;
    } else if (newStatus === 'CONFIRMED') {
      notificationMessage = `"${title}" randevunuz onaylandı.`;
    } else if (newStatus === 'COMPLETED') {
      notificationMessage = `"${title}" randevunuz tamamlandı.`;
    } else {
      notificationMessage = `"${title}" randevunuzun durumu "${oldStatusText}" den "${newStatusText}" olarak değiştirildi.`;
    }

    if (emailNotificationEnabled) {
      const emailRecipients = [];
      
      if (attendeeEmail) {
        emailRecipients.push(attendeeEmail);
      }
      
      if (invitees && Array.isArray(invitees)) {
        invitees.forEach(invitee => {
          if (invitee.email && !emailRecipients.includes(invitee.email)) {
            emailRecipients.push(invitee.email);
          }
        });
      }
      
      if (visibleToUsers && Array.isArray(visibleToUsers)) {
        visibleToUsers.forEach(user => {
          if (user.email && !emailRecipients.includes(user.email)) {
            emailRecipients.push(user.email);
          }
        });
      }

      for (const email of emailRecipients) {
        try {
          let emailSubject = 'Randevu Durumu Değişikliği';
          let emailHtml = '';

          if (newStatus === 'CANCELLED' && appointmentData) {
            emailSubject = 'Randevu İptal Edildi - SULTANGAZİ Belediyesi';
            emailHtml = emailService.generateAppointmentCancelledEmail({
              ...appointmentData,
              title,
              cancellationReason: appointmentData.cancellationReason || 'Belirtilmemiş'
            });
          } else if (newStatus === 'RESCHEDULED' && appointmentData) {
            emailSubject = 'Randevu Yeniden Planlandı - SULTANGAZİ Belediyesi';
            emailHtml = emailService.generateAppointmentRescheduledEmail({
              ...appointmentData,
              title,
              rescheduleReason: appointmentData.rescheduleReason || 'Belirtilmemiş'
            });
          } else if (newStatus === 'CONFIRMED' && appointmentData) {
            emailSubject = 'Randevu Onaylandı - SULTANGAZİ Belediyesi';
            emailHtml = emailService.generateAppointmentConfirmedEmail({
              ...appointmentData,
              title
            });
          } else if (newStatus === 'COMPLETED' && appointmentData) {
            emailSubject = 'Randevu Tamamlandı - SULTANGAZİ Belediyesi';
            emailHtml = emailService.generateAppointmentCompletedEmail({
              ...appointmentData,
              title
            });
          } else if (appointmentData) {
            emailSubject = 'Randevu Güncellendi - SULTANGAZİ Belediyesi';
            emailHtml = emailService.generateAppointmentUpdatedEmail({
              ...appointmentData,
              title,
              updateReason: `Durum "${oldStatusText}" den "${newStatusText}" olarak değiştirildi`
            });
          } else {
            emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #3C02AA;">Randevu Durumu Değişikliği</h2>
              <p>${notificationMessage}</p>
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Randevu:</strong> ${title}</p>
                <p><strong>Eski Durum:</strong> ${oldStatusText}</p>
                <p><strong>Yeni Durum:</strong> ${newStatusText}</p>
              </div>
              <p style="color: #666; font-size: 12px;">Bu otomatik bir bildirimdir.</p>
            </div>
            `;
          }

          await emailService.sendEmail(
            email,
            emailSubject,
            emailHtml,
            notificationMessage
          );
          console.log(`Status değişikliği e-posta bildirimi gönderildi: ${email}`);
        } catch (emailError) {
          console.error(`E-posta gönderme hatası (${email}):`, emailError);
        }
      }
    }

    if (smsNotificationEnabled) {
      const smsRecipients = [];
      
      if (attendeePhone) {
        smsRecipients.push(attendeePhone);
      }
      
      if (invitees && Array.isArray(invitees)) {
        invitees.forEach(invitee => {
          if (invitee.phone && !smsRecipients.includes(invitee.phone)) {
            smsRecipients.push(invitee.phone);
          }
        });
      }
      
      if (visibleToUsers && Array.isArray(visibleToUsers)) {
        visibleToUsers.forEach(user => {
          if (user.phone && !smsRecipients.includes(user.phone)) {
            smsRecipients.push(user.phone);
          }
        });
      }

      for (const phone of smsRecipients) {
        try {
          await smsService.sendSMS(phone, notificationMessage);
          console.log(`Status değişikliği SMS bildirimi gönderildi: ${phone}`);
        } catch (smsError) {
          console.error(`SMS gönderme hatası (${phone}):`, smsError);
        }
      }
    }

    console.log('Status değişikliği bildirimleri başarıyla gönderildi');
  } catch (error) {
    console.error('Status değişikliği bildirimi gönderme hatası:', error);
    throw error;
  }
};

module.exports = {
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
};