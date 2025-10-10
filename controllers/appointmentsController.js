const db = require('../config/database');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');
const reminderService = require('../services/reminderService');
const notificationsController = require('./notificationsController');
const { logActivity } = require('./activitiesController');
const { getIO } = require('../utils/socket');

// Randevu çakışması kontrolü
const checkAppointmentConflict = async (userId, date, startTime, endTime, excludeId = null) => {
  try {
    // Frontend'den gelen tarih string'ini doğrudan kullan (DATE tipinde karşılaştırma için)
    
    let query = `
      SELECT id, title, start_time, end_time, user_id, attendee_name, status
      FROM appointments 
      WHERE user_id = ?
      AND DATE(date) = ?
      AND NOT (end_time <= ? OR start_time >= ?)
      AND status NOT IN ('COMPLETED', 'CANCELLED')
    `;
    
    // İki randevu çakışmıyor ancak ve ancak:
    // 1. Birincisi ikincisinden önce bitiyorsa (end_time <= startTime) VEYA
    // 2. Birincisi ikincisinden sonra başlıyorsa (start_time >= endTime)
    // Bu durumların tersi çakışma demektir, bu yüzden NOT kullanıyoruz
    
    const params = [userId, date, startTime, endTime];

    // Güncelleme işleminde mevcut randevuyu hariç tut
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

// Tüm kullanıcılar için çakışma kontrolü (genel çakışma)
const checkGlobalAppointmentConflict = async (date, startTime, endTime, excludeId = null, userId = null) => {
  try {
    // Çakışma kontrolü başlıyor
    
    // Eğer startTime veya endTime yoksa çakışma kontrolünü atla
    if (!startTime || !endTime) {
      console.log('StartTime veya endTime boş, çakışma kontrolü atlanıyor');
      return [];
    }
    
    // Frontend'den gelen tarih string'ini doğrudan kullan
    
    // Çakışma kontrolü: İki randevu çakışmaz eğer:
    // 1. Yeni randevunun bitişi mevcut randevunun başlangıcından önce VEYA
    // 2. Yeni randevunun başlangıcı mevcut randevunun bitişinden sonra
    // Bu durumların tersi çakışma demektir, bu yüzden NOT kullanıyoruz
    // Ayrıca tamamlanan ve iptal edilen randevularla çakışma kontrolü yapılmaz
    let query = `
      SELECT id, title, date, start_time, end_time, user_id, attendee_name, status
      FROM appointments 
      WHERE DATE(date) = ?
      AND NOT (end_time <= ? OR start_time >= ?)
      AND status NOT IN ('COMPLETED', 'CANCELLED')
    `;
    
    const params = [date, startTime, endTime];

    // Eğer userId verilmişse, sadece o kullanıcının randevularını kontrol et
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    // Güncelleme işleminde mevcut randevuyu hariç tut
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

// Tüm randevuları getir
const getAppointments = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = req.user;
    
    // BAŞKAN departmanı, admin veya başkan rolündeki kullanıcılar tüm randevuları görebilir
    const canViewAll = user.role === 'admin' || 
                      user.role === 'başkan' || 
                      user.department === 'BAŞKAN';
    
    let query, queryParams;
    
    if (canViewAll) {
      // Tüm randevuları görebilir (COMPLETED olanlar hariç)
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
        WHERE a.status != 'COMPLETED'
        ORDER BY a.date, a.start_time
      `;
      queryParams = [];
    } else {
      // Normal kullanıcı - sadece kendi randevularını veya görünür olanları görebilir (COMPLETED olanlar hariç)
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
          a.status != 'COMPLETED' AND (
            a.user_id = ? OR 
            a.visible_to_all = TRUE OR
            (
              JSON_CONTAINS(JSON_EXTRACT(a.visible_to_users, '$[*].id'), CAST(? AS JSON)) = 1 OR
              JSON_CONTAINS(JSON_EXTRACT(a.visible_to_users, '$[*].id'), JSON_QUOTE(?)) = 1
            )
          )
        ORDER BY a.date, a.start_time
      `;
      queryParams = [userId, userId, userId.toString()];
    }
    
    const [appointments] = await db.execute(query, queryParams);
    
    // JSON verilerini parse et
    for (let appointment of appointments) {
      try {
        // Güvenli JSON parse için yardımcı fonksiyon
        // Debug için invitees logla (PARSE ÖNCESI)
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
          // Eğer zaten object/array ise direkt döndür
          if (typeof jsonData === 'object' && jsonData !== null) {
            return Array.isArray(jsonData) ? jsonData : [jsonData];
          }
          
          // String ise parse et
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
        
        // Debug için invitees logla (PARSE SONRASI)
        if (appointment.id === 11) { // Sizin randevunuzun ID'si
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

// Randevu çakışması kontrolü endpoint'i
const checkConflict = async (req, res) => {
  try {
    const { date, startTime, endTime, excludeId } = req.query;
    const userId = req.user.id; // Kullanıcı ID'sini al

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

// Yeni randevu oluştur
const createAppointment = async (req, res) => {
  try {
    console.log('=== RANDEVU OLUŞTURMA İSTEĞİ ===');
    console.log('req.body:', JSON.stringify(req.body, null, 2));
    console.log('req.user:', req.user);
    console.log('visibleToUsers from req.body:', req.body.visibleToUsers);
    console.log('visibleToAll from req.body:', req.body.visibleToAll);
    
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
      reminderDateTime
    } = req.body;
    

    
    // Default değerler - artık frontend'den gelmiyor
    const status = 'SCHEDULED'; // Her zaman planlandı olarak başla
    
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

    // Artık attendee alanı yok - katılımcılar selectedContacts ile gelir
    const attendeeName = null;
    const attendeeEmail = null;
    const attendeePhone = null;

    // Global çakışma kontrolü - TÜM randevuları kontrol et (başkaların randevularıyla da çakışmaması için)
    console.log('Çakışma kontrolü yapılıyor...');
    const globalConflicts = await checkGlobalAppointmentConflict(date, startTime, endTime, null, null); // userId=null ile TÜM randevuları kontrol et
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

    // Tarihi doğrudan kullan (DATE tipinde kaydetmek için)
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
        visible_to_all,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    
    // JSON verilerini hazırla
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
      userName, userEmail, // created_by_name, created_by_email
      attendeeName, attendeeEmail, attendeePhone,
      description, color, location,
      notificationEmail || false, notificationSMS || false,
      null, null, // reminder_value ve reminder_unit artık kullanılmıyor
      google_event_id || null, // Google Calendar event ID
      'SYSTEM', // source - kendi sistemimizden eklenen randevular
      status || 'SCHEDULED',
      inviteesJson, visibleUsersJson, // attendees sütunu yok, sadece invitees ve visible_to_users
      visibleToAll || false
    ];
    
    console.log('Veritabanına kaydetme sorgusu:', query);
    console.log('Sorgu parametreleri:', queryParams);
    
    const [result] = await db.execute(query, queryParams);
    console.log('Veritabanı kayıt sonucu:', result);
    
    const appointmentId = result.insertId;
    
    // Görünürlük ayarları artık JSON olarak ana tabloda tutuluyor
    console.log('Görünürlük ayarları kaydedildi - visible_to_all:', visibleToAll, 'visible_to_users count:', visibleToUsers?.length || 0);

    // Yeni oluşturulan randevuyu getir
    const [newAppointment] = await db.execute(`
      SELECT 
        a.*,
        creator.name as creator_name,
        creator.email as creator_email
      FROM appointments a
      LEFT JOIN users creator ON a.user_id = creator.id
      WHERE a.id = ?
    `, [appointmentId]);

    // Bildirim gönderme işlemleri
    const appointmentData = {
      title,
      date,
      startTime,
      endTime,
      description,
      location
    };

    // Artık tek tablo sisteminde attendeeId yok, sadece attendeeName var
    // Bildirimler için attendeeName'i kullanabiliriz ama şimdilik devre dışı bırakıyoruz
    // TODO: Gerekirse attendee bildirimlerini daha sonra ekleyebiliriz

    // Artık attendees bilgileri JSON olarak ana tabloda tutuluyor
    console.log('Katılımcı bilgileri JSON olarak ana tabloda kaydedildi:', attendeeName);

    // Bildirim gönder (davetli kişilere)
    if (selectedContacts && selectedContacts.length > 0) {
      console.log('Davetli kişilere bildirim gönderiliyor:', selectedContacts);
      
      for (const contact of selectedContacts) {
        // E-posta bildirimi
        if (notificationEmail && contact.email) {
          try {
            await emailService.sendAppointmentNotification(
              appointmentData,
              contact.email,
              'created'
            );
            console.log('Davetli kişiye e-posta gönderildi:', contact.email);
          } catch (emailError) {
            console.error('Davetli kişiye e-posta gönderme hatası:', emailError);
          }
        }
        
        // SMS bildirimi
        if (notificationSMS && contact.phone) {
          try {
            const smsMessage = `Randevu Daveti: ${title}\nTarih: ${date}\nSaat: ${startTime} - ${endTime}\nKonum: ${location || 'Belirtilmemiş'}`;
            console.log('Davetli kişiye SMS gönderiliyor:', contact.phone, smsMessage);
            const smsResult = await smsService.sendSMS(contact.phone, smsMessage);
            console.log('Davetli SMS gönderim sonucu:', smsResult);
            if (smsResult.success) {
              console.log('Davetli kişiye SMS başarıyla gönderildi:', contact.phone);
            } else {
              console.error('Davetli SMS gönderim başarısız:', smsResult.error);
            }
          } catch (smsError) {
            console.error('Davetli kişiye SMS gönderme hatası:', smsError);
          }
        }
      }
    }

    // Görünürlük kullanıcılarına bildirim gönder (visibleToUsers)
    if (visibleToUsers && visibleToUsers.length > 0) {
      console.log('Görünürlük kullanıcılarına bildirim gönderiliyor:', visibleToUsers);
      
      for (const user of visibleToUsers) {
        // Uygulama içi bildirim gönder
        try {
          await notificationsController.createNotification(
              user.id,
              'Yeni Randevu',
              `${title} - ${date} ${startTime}`,
              'appointment_created',
              appointmentId,
              'appointments'
            );
          console.log('Kullanıcıya uygulama içi bildirim gönderildi:', user.id);
        } catch (notificationError) {
          console.error('Uygulama içi bildirim gönderme hatası:', notificationError);
        }
        
        // E-posta bildirimi
        if (notificationEmail && user.email) {
          try {
            const appointmentData = {
              title,
              date,
              startTime,
              endTime,
              description,
              location
            };
            await emailService.sendAppointmentNotification(
              appointmentData,
              user.email,
              'created'
            );
            console.log('Kullanıcıya e-posta gönderildi:', user.email);
          } catch (emailError) {
            console.error('Kullanıcıya e-posta gönderme hatası:', emailError);
          }
        }
        
        // SMS bildirimi
        if (notificationSMS && user.phone) {
          try {
            const smsMessage = `Yeni Randevu: ${title}\nTarih: ${date}\nSaat: ${startTime} - ${endTime}\nKonum: ${location || 'Belirtilmemiş'}`;
            console.log('Kullanıcıya SMS gönderiliyor:', user.phone, smsMessage);
            const smsResult = await smsService.sendSMS(user.phone, smsMessage);
            console.log('Kullanıcı SMS gönderim sonucu:', smsResult);
            if (smsResult.success) {
              console.log('Kullanıcıya SMS başarıyla gönderildi:', user.phone);
            } else {
              console.error('Kullanıcı SMS gönderim başarısız:', smsResult.error);
            }
          } catch (smsError) {
            console.error('Kullanıcıya SMS gönderme hatası:', smsError);
          }
        }
      }
    }

    // Tüm kullanıcılara gönder seçeneği
    if (visibleToAll) {
      console.log('Tüm kullanıcılara bildirim gönderiliyor...');
      try {
        const [allUsers] = await db.execute('SELECT id, email, phone FROM users WHERE id != ?', [userId]);
        
        for (const user of allUsers) {
          // Uygulama içi bildirim gönder
          try {
            await notificationsController.createNotification(
              user.id,
              'Yeni Randevu',
              `${title} - ${date} ${startTime}`,
              'appointment_created',
              appointmentId,
              'appointments'
            );
            console.log('Tüm kullanıcıya uygulama içi bildirim gönderildi:', user.id);
          } catch (notificationError) {
            console.error('Tüm kullanıcıya uygulama içi bildirim gönderme hatası:', notificationError);
          }
          
          // E-posta bildirimi
          if (notificationEmail && user.email) {
            try {
              const appointmentData = {
                title,
                date,
                startTime,
                endTime,
                description,
                location
              };
              await emailService.sendAppointmentNotification(
                appointmentData,
                user.email,
                'created'
              );
              console.log('Tüm kullanıcıya e-posta gönderildi:', user.email);
            } catch (emailError) {
              console.error('Tüm kullanıcıya e-posta gönderme hatası:', emailError);
            }
          }
          
          // SMS bildirimi
          if (notificationSMS && user.phone) {
            try {
              const smsMessage = `Yeni Randevu: ${title}\nTarih: ${date}\nSaat: ${startTime} - ${endTime}\nKonum: ${location || 'Belirtilmemiş'}`;
              console.log('SMS gönderiliyor:', user.phone, smsMessage);
              const smsResult = await smsService.sendSMS(user.phone, smsMessage);
              console.log('SMS gönderim sonucu:', smsResult);
              if (smsResult.success) {
                console.log('Tüm kullanıcıya SMS başarıyla gönderildi:', user.phone);
              } else {
                console.error('SMS gönderim başarısız:', smsResult.error);
              }
            } catch (smsError) {
              console.error('Tüm kullanıcıya SMS gönderme hatası:', smsError);
            }
          }
        }
      } catch (error) {
        console.error('Tüm kullanıcıları getirme hatası:', error);
      }
    }

    // Hatırlatma kaydı oluştur (eğer reminderDateTime varsa)
    if (reminderDateTime) {
      try {
        console.log('📅 Hatırlatma zamanlanıyor:', {
          appointmentId,
          reminderDateTime,
          appointmentDate: date,
          appointmentTime: startTime
        });
        
        // Geçmiş zaman kontrolü
        if (new Date(reminderDateTime) <= new Date()) {
          console.log('⚠️ Hatırlatma zamanı geçmişte, zamanlanmadı');
        } else {
          // Doğrudan reminderDateTime ile hatırlatma kaydı oluştur
          const [reminderResult] = await db.execute(
            `INSERT INTO appointment_reminders (appointment_id, reminder_time, status, created_at, updated_at) 
             VALUES (?, ?, 'scheduled', NOW(), NOW())`,
            [appointmentId, reminderDateTime]
          );
          
          if (reminderResult.insertId) {
            console.log('✅ Hatırlatma başarıyla zamanlandı');
          } else {
            console.log('⚠️ Hatırlatma zamanlanamadı');
          }
        }
      } catch (reminderError) {
        console.error('Hatırlatma kaydı oluşturma hatası:', reminderError);
      }
    }

    // Aktivite kaydı oluştur
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
    
    // Socket.IO ile real-time güncelleme gönder
    try {
      const io = getIO();
      if (io) {
        io.emit('appointment-created', {
          appointment: newAppointment[0],
          message: 'Yeni randevu eklendi'
        });
        console.log('Socket.IO appointment-created event gönderildi');
      }
    } catch (socketError) {
      console.error('Socket.IO event gönderme hatası:', socketError);
    }

    res.status(201).json({
      success: true,
      data: newAppointment[0],
      message: 'Randevu başarıyla oluşturuldu'
    });
    
    console.log('Başarılı yanıt gönderildi.');
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

// Randevu güncelle
const updateAppointment = async (req, res) => {
  try {
    const userId = req.user.id;
    const appointmentId = req.params.id;
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
      reminder_datetime
    } = req.body;

    // Frontend'den gelen field name'leri normalize et
    const normalizedStartTime = start_time || startTime;
    const normalizedEndTime = end_time || endTime;

    // Önce randevunun var olup olmadığını kontrol et
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

    // Yetki sistemi kaldırıldı - görünürlük varsa düzenleme yapılabilir



    // Katılımcı bilgilerini hazırla
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

    // Tarihi doğrudan kullan (DATE tipinde kaydetmek için)
    console.log('Güncellenecek tarih:', date);

    // Çakışma kontrolü (mevcut randevuyu hariç tut) - Sadece aynı kullanıcının randevularını kontrol et
    // Undefined değerleri kontrol et
    const safeStartTime = normalizedStartTime || null;
    const safeEndTime = normalizedEndTime || null;
    
    // Randevu sahibinin ID'sini al (güncellenen randevunun sahibi)
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

    // Görünürlük ayarlarını hazırla
    const visibleToAllValue = visible_to_all || false;
    const visibleUsersValue = visibleToUsers || visible_to_users || null;
    const visibleUsersJson = visibleUsersValue ? JSON.stringify(visibleUsersValue) : null;

    const query = `
      UPDATE appointments 
      SET title = ?, date = ?, start_time = ?, end_time = ?, 
          attendee_name = ?, attendee_email = ?, attendee_phone = ?,
          description = ?, color = ?, google_event_id = ?,
          status = ?, visible_to_all = ?, visible_to_users = ?, updated_at = NOW()
      WHERE id = ?
    `;
    
    await db.execute(query, [
      title, date, normalizedStartTime, normalizedEndTime, 
      attendeeName, attendeeEmail, attendeePhone,
      description, color, google_event_id,
      status || 'SCHEDULED',
      visibleToAllValue,
      visibleUsersJson,
      appointmentId
    ]);

    // Aktivite kaydı oluştur
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

    // Güncellenmiş randevuyu getir
    const [updatedAppointment] = await db.execute(`
      SELECT 
        a.*,
        creator.name as creator_name,
        creator.email as creator_email
      FROM appointments a
      LEFT JOIN users creator ON a.user_id = creator.id
      WHERE a.id = ?
    `, [appointmentId]);

    // Hatırlatıcı güncelleme
    if (reminder_enabled && reminder_datetime) {
      try {
        // Önce mevcut hatırlatıcıları sil
        await db.execute(
          'DELETE FROM appointment_reminders WHERE appointment_id = ?',
          [appointmentId]
        );
        
        // Yeni hatırlatıcı ekle (geçmiş tarih kontrolü)
        const reminderDate = new Date(reminder_datetime);
        const now = new Date();
        
        if (reminderDate > now) {
          await db.execute(
            'INSERT INTO appointment_reminders (appointment_id, reminder_datetime, status) VALUES (?, ?, ?)',
            [appointmentId, reminder_datetime, 'pending']
          );
          console.log('Hatırlatıcı güncellendi:', reminder_datetime);
        } else {
          console.log('Geçmiş tarihli hatırlatıcı eklenmedi:', reminder_datetime);
        }
      } catch (reminderError) {
        console.error('Hatırlatıcı güncelleme hatası:', reminderError);
      }
    } else if (reminder_enabled === false) {
      // Hatırlatıcı devre dışı bırakıldıysa mevcut hatırlatıcıları sil
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

    // Socket.IO ile real-time güncelleme gönder
    try {
      const io = getIO();
      if (io) {
        io.emit('appointment-updated', {
          appointment: updatedAppointment[0],
          message: 'Randevu güncellendi'
        });
        console.log('Socket.IO appointment-updated event gönderildi');
      }
    } catch (socketError) {
      console.error('Socket.IO event gönderme hatası:', socketError);
    }

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

// Randevu sil
const deleteAppointment = async (req, res) => {
  try {
    const userId = req.user.id;
    const appointmentId = req.params.id;

    // Önce randevunun var olup olmadığını kontrol et
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

    // Yetki sistemi kaldırıldı - görünürlük varsa silme yapılabilir

    // Aktivite kaydı oluştur (silmeden önce)
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

    await db.execute('DELETE FROM appointments WHERE id = ?', [appointmentId]);

    // Socket.IO ile real-time güncelleme gönder
    try {
      const io = getIO();
      if (io) {
        io.emit('appointment-deleted', {
          appointmentId: appointmentId,
          appointment: existingAppointment[0],
          message: 'Randevu silindi'
        });
        console.log('Socket.IO appointment-deleted event gönderildi');
      }
    } catch (socketError) {
      console.error('Socket.IO event gönderme hatası:', socketError);
    }

    res.json({
      success: true,
      message: 'Randevu başarıyla silindi'
    });
  } catch (error) {
    console.error('Randevu silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Randevu silinemedi'
    });
  }
};

// Tarih aralığındaki randevuları getir
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

    // Tarihleri doğrudan kullan (DATE tipinde karşılaştırma için)
    console.log('Tarih aralığı:', start, 'ile', end);

    // BAŞKAN departmanı, admin veya başkan rolündeki kullanıcılar tüm randevuları görebilir
    const canViewAll = user.role === 'admin' || 
                      user.role === 'başkan' || 
                      user.department === 'BAŞKAN';
    
    let query, queryParams;
    
    if (canViewAll) {
      // Tüm randevuları görebilir (COMPLETED olanlar hariç)
      query = `
        SELECT DISTINCT
          a.*,
          creator.name as creator_name,
          creator.email as creator_email
        FROM appointments a
        LEFT JOIN users creator ON a.user_id = creator.id
        WHERE a.status != 'COMPLETED' AND DATE(a.date) BETWEEN ? AND ?
        ORDER BY a.date, a.start_time
      `;
      queryParams = [start, end];
    } else {
      // Normal kullanıcı - sadece kendi randevularını veya görünür olanları görebilir (COMPLETED olanlar hariç)
      query = `
        SELECT DISTINCT
          a.*,
          creator.name as creator_name,
          creator.email as creator_email
        FROM appointments a
        LEFT JOIN users creator ON a.user_id = creator.id
        WHERE a.status != 'COMPLETED' AND (
          a.user_id = ? OR 
          a.visible_to_all = TRUE OR
          (
            JSON_CONTAINS(JSON_EXTRACT(a.visible_to_users, '$[*].id'), CAST(? AS JSON)) = 1 OR
            JSON_CONTAINS(JSON_EXTRACT(a.visible_to_users, '$[*].id'), JSON_QUOTE(?)) = 1
          )
        ) AND DATE(a.date) BETWEEN ? AND ?
        ORDER BY a.date, a.start_time
      `;
      queryParams = [userId, userId, userId.toString(), start, end];
    }
    
    const [appointments] = await db.execute(query, queryParams);
    
    // JSON verilerini parse et
    for (let appointment of appointments) {
      try {
        // Güvenli JSON parse için yardımcı fonksiyon
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

// Kişilerin önceki randevularını getir
const getInviteePreviousAppointments = async (req, res) => {
  try {
    const { inviteeEmails, currentDate, page = 1, limit = 5 } = req.body;
    
    console.log('=== ÖNCEKI RANDEVULAR İSTEĞİ ===');
    console.log('inviteeEmails:', inviteeEmails);
    console.log('currentDate:', currentDate);
    console.log('page:', page, 'limit:', limit);
    
    if (!inviteeEmails || !Array.isArray(inviteeEmails) || inviteeEmails.length === 0) {
      return res.status(400).json({ error: 'Davetli e-postaları gerekli' });
    }

    const offset = (page - 1) * parseInt(limit);
    
    // JSON_CONTAINS kullanarak invitees alanında e-posta arama
    const emailConditions = inviteeEmails.map(() => 'JSON_SEARCH(a.invitees, "one", ?, NULL, "$[*].email") IS NOT NULL').join(' OR ');
    
    // Ana sorgu - önceki randevuları getir (JSON invitees alanından)
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
      WHERE a.date < ? 
        AND (${emailConditions})
      ORDER BY a.date DESC, a.start_time DESC
      LIMIT ? OFFSET ?
    `;

    // Toplam sayı sorgusu
    const countQuery = `
      SELECT COUNT(DISTINCT a.id) as total
      FROM appointments a
      WHERE a.date < ? 
        AND (${emailConditions})
    `;

    console.log('Executing query:', query);
    console.log('Parameters:', [currentDate, ...inviteeEmails, limit.toString(), offset.toString()]);

    const [appointments] = await db.execute(query, [currentDate, ...inviteeEmails, limit.toString(), offset.toString()]);
    const [countResult] = await db.execute(countQuery, [currentDate, ...inviteeEmails]);
    
    console.log('Found appointments:', appointments.length);
    console.log('Total count:', countResult[0]?.total || 0);

    // Davetli bilgilerini formatla ve ek bilgiler ekle
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
      
      // Tarih formatını iyileştir
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
    
    // BAŞKAN departmanı, admin veya başkan rolündeki kullanıcılar tüm randevuları görebilir
    const canViewAll = user.role === 'admin' || 
                      user.role === 'başkan' || 
                      user.department === 'BAŞKAN';
    
    let query, queryParams;
    
    if (canViewAll) {
      // Tüm randevuları görebilir
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
      // Normal kullanıcı - sadece kendi randevularını veya görünür olanları görebilir
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
            JSON_CONTAINS(JSON_EXTRACT(a.visible_to_users, '$[*].id'), CAST(? AS JSON)) = 1 OR
            JSON_CONTAINS(JSON_EXTRACT(a.visible_to_users, '$[*].id'), JSON_QUOTE(?)) = 1
          )
        )
      `;
      queryParams = [id, userId, userId, userId.toString()];
    }
    
    const [appointments] = await db.execute(query, queryParams);
    
    if (!appointments || appointments.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Randevu bulunamadı'
      });
    }

    // Güvenli JSON parse için yardımcı fonksiyon
    const safeJsonParse = (jsonData) => {
      // Eğer zaten object/array ise direkt döndür
      if (typeof jsonData === 'object' && jsonData !== null) {
        return Array.isArray(jsonData) ? jsonData : [jsonData];
      }
      // String ise parse et
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

    // İlk (ve tek) randevuyu al
    const appointmentData = appointments[0];
    
    // JSON verilerini parse et
    let invitees = [];
    let attendees = [];
    let visibleUsers = [];
    
    try {
      // Debug için invitees logla (PARSE ÖNCESI)
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
      
      // Debug için invitees logla (PARSE SONRASI)
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

    // Randevu hatırlatma bilgilerini getir
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

// Hatırlatma yeniden gönder (manuel saat ile)
const resendReminder = async (req, res) => {
  try {
    const userId = req.user.id;
    const appointmentId = req.params.id;
    const { reminderDateTime } = req.body; // Manuel saat girişi

    // Randevunun sahibi mi kontrol et
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

    // Mevcut hatırlatma bilgisini getir
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

    // Eğer hatırlatma henüz gönderilmediyse hata döndür
    if (reminder.status === 'scheduled') {
      return res.status(400).json({
        success: false,
        message: 'Hatırlatma henüz gönderilmedi. Zamanı değiştirmek için diğer seçeneği kullanın.'
      });
    }

    let reminderTime;
    
    if (reminderDateTime) {
      // Manuel saat girişi varsa kullan
      reminderTime = reminderDateTime;
      
      // Geçmiş zaman kontrolü
      if (new Date(reminderTime) <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Hatırlatma zamanı gelecekte olmalıdır'
        });
      }
    } else {
      // Manuel saat yoksa hemen gönder
      reminderTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    // Yeni hatırlatma kaydı oluştur
    const [result] = await db.execute(
      `INSERT INTO appointment_reminders (appointment_id, reminder_time, status, created_at, updated_at) 
       VALUES (?, ?, 'scheduled', NOW(), NOW())`,
      [appointmentId, reminderTime]
    );

    // Eğer hemen gönder ise
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

// Hatırlatma zamanını güncelle
const updateReminderTime = async (req, res) => {
  try {
    const userId = req.user.id;
    const appointmentId = req.params.id;
    const { reminderValue, reminderUnit } = req.body;

    // Randevunun sahibi mi kontrol et
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

    // Mevcut henüz gönderilmemiş hatırlatmaları iptal et
    await db.execute(
      'UPDATE appointment_reminders SET status = "cancelled", updated_at = NOW() WHERE appointment_id = ? AND status = "scheduled"',
      [appointmentId]
    );

    // Yeni hatırlatma zamanla
    const reminderService = require('../services/reminderService');
    const success = await reminderService.scheduleReminder(
      appointmentId,
      reminderValue,
      reminderUnit
    );

    if (success) {
      // Randevu tablosundaki hatırlatma bilgilerini de güncelle
      await db.execute(
        'UPDATE appointments SET reminder_value = ?, reminder_unit = ?, updated_at = NOW() WHERE id = ?',
        [reminderValue, reminderUnit, appointmentId]
      );

      res.json({
        success: true,
        message: 'Hatırlatma zamanı başarıyla güncellendi'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Hatırlatma zamanlanamadı. Geçerli bir gelecek zaman seçiniz.'
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

// Randevu istatistikleri getir
const getAppointmentStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Son 7 günün tarihlerini hesapla
    const today = new Date();
    const weekDays = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      weekDays.push({
        date: date.toISOString().split('T')[0],
        dayName: ['PAZ', 'PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CTS'][date.getDay()]
      });
    }
    
    // Her gün için randevu sayısını getir
    const dailyStats = [];
    
    for (const day of weekDays) {
      const [result] = await db.execute(
        `SELECT COUNT(*) as count FROM appointments 
         WHERE user_id = ? AND DATE(date) = ?`,
        [userId, day.date]
      );
      
      dailyStats.push({
        day: day.dayName,
        value: result[0].count,
        color: '#10B981'
      });
    }
    
    // Toplam randevu sayısını getir
    const [totalResult] = await db.execute(
      'SELECT COUNT(*) as total FROM appointments WHERE user_id = ?',
      [userId]
    );
    
    res.json({
      success: true,
      data: {
        dailyStats,
        total: totalResult[0].total
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