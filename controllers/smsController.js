const { promisePool: db } = require('../config/database');
const smsService = require('../services/smsService');

exports.getSMSConfig = async (req, res) => {
  try {
    console.log('📋 SMS konfigürasyon bilgileri isteniyor...');
    
    const config = smsService.getConfig();
    
    res.json({
      success: true,
      message: 'SMS konfigürasyonu başarıyla alındı',
      data: {
        provider: 'banaozel',
        status: 'active',
        config: config
      }
    });
    
  } catch (error) {
    console.error('❌ SMS konfigürasyon hatası:', error);
    res.status(500).json({
      success: false,
      message: 'SMS konfigürasyonu getirilemedi',
      error: error.message
    });
  }
};

exports.sendSMS = async (req, res) => {
  try {
    const { phone, phoneNumber, message } = req.body;
    const targetPhone = phone || phoneNumber;

    console.log('📨 Tekli SMS gönderim isteği:', { 
      targetPhone, 
      messageLength: message?.length,
      userId: req.user?.id
    });

    if (!targetPhone || !message) {
      console.error('❌ Eksik parametreler:', { 
        phone: !!targetPhone, 
        message: !!message 
      });
      return res.status(400).json({
        success: false,
        message: 'Telefon numarası ve mesaj içeriği gereklidir'
      });
    }

    let messageId = null;
    try {
      const insertQuery = `
          INSERT INTO sms_logs (phone_number, message, list_name, sending_title, contact_name, contact_category, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())
        `;
        const [dbResult] = await db.query(insertQuery, [
          targetPhone, 
          message,
          'Tekli SMS',
          'SMS Gönderimi',
          '',
          '',
        ]);
      messageId = dbResult.insertId;
      console.log('💾 SMS geçmişe kaydedildi:', { messageId, targetPhone });
    } catch (dbError) {
      console.log('⚠️ Veritabanı kayıt hatası (devam ediliyor):', dbError.message);
    }

    const smsResult = await smsService.sendSMS(targetPhone, message);
    
    console.log('📡 SMS gönderim sonucu:', {
      success: smsResult.success,
      phone: smsResult.phone,
      error: smsResult.error || 'yok'
    });

    if (messageId) {
      try {
        const status = smsResult.success ? 'sent' : 'failed';
        const updateQuery = `
            UPDATE sms_logs 
            SET status = ?, sent_at = NOW(), error_message = ?
            WHERE id = ?
          `;
        await db.query(updateQuery, [
          status, 
          smsResult.error || null, 
          messageId
        ]);
      } catch (updateError) {
        console.log('⚠️ Durum güncelleme hatası:', updateError.message);
      }
    }

    if (smsResult.success) {
      console.log('✅ SMS başarıyla gönderildi');
      res.json({
        success: true,
        message: 'SMS başarıyla gönderildi',
        data: {
          phone: smsResult.phone,
          message: message,
          status: 'sent',
          messageId: messageId
        }
      });
    } else {
      console.error('❌ SMS gönderim başarısız:', smsResult.error);
      res.status(400).json({
        success: false,
        message: smsResult.error || 'SMS gönderilemedi',
        data: {
          phone: smsResult.phone,
          message: message,
          status: 'failed',
          messageId: messageId
        }
      });
    }

  } catch (error) {
    console.error('💥 SMS Controller genel hatası:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'SMS gönderilemedi - sistem hatası',
      error: error.message
    });
  }
};

exports.sendBulkSMS = async (req, res) => {
  try {
    const { phones, message } = req.body;

    console.log('📨 Toplu SMS gönderim isteği:', { 
      phoneCount: phones?.length, 
      messageLength: message?.length,
      userId: req.user?.id
    });

    if (!phones || !Array.isArray(phones) || phones.length === 0 || !message) {
      return res.status(400).json({
        success: false,
        message: 'Telefon numaraları listesi ve mesaj içeriği gereklidir'
      });
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const phone of phones) {
      try {
        console.log(`📱 SMS gönderiliyor: ${phone}`);
        
        let messageId = null;
        try {
          const insertQuery = `
              INSERT INTO sms_logs (phone_number, message, list_name, sending_title, contact_name, contact_category, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())
            `;
            const [dbResult] = await db.query(insertQuery, [
              phone, 
              message,
              'Toplu SMS',
              'Toplu SMS Gönderimi',
              '',
              '',
            ]);
          messageId = dbResult.insertId;
        } catch (dbError) {
          console.log(`⚠️ ${phone} için veritabanı kayıt hatası:`, dbError.message);
        }

        const smsResult = await smsService.sendSMS(phone, message);
        
        if (messageId) {
          try {
            const status = smsResult.success ? 'sent' : 'failed';
            const updateQuery = `
                UPDATE sms_logs 
                SET status = ?, sent_at = NOW(), error_message = ?
                WHERE id = ?
              `;
            await db.query(updateQuery, [
              status, 
              smsResult.error || null, 
              messageId
            ]);
          } catch (updateError) {
            console.log(`⚠️ ${phone} için durum güncelleme hatası:`, updateError.message);
          }
        }

        results.push({
          phone: phone,
          status: smsResult.success ? 'sent' : 'failed',
          success: smsResult.success,
          error: smsResult.error || null,
          messageId: messageId
        });

        if (smsResult.success) {
          successCount++;
          console.log(`✅ ${phone}: başarılı`);
        } else {
          failureCount++;
          console.log(`❌ ${phone}: ${smsResult.error}`);
        }

        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`💥 ${phone} için SMS hatası:`, error.message);
        failureCount++;
        results.push({
          phone: phone,
          status: 'failed',
          success: false,
          error: error.message,
          messageId: null
        });
      }
    }

    console.log(`📊 Toplu SMS tamamlandı: ${successCount} başarılı, ${failureCount} başarısız`);

    res.json({
      success: true,
      message: `Toplu SMS tamamlandı: ${successCount} başarılı, ${failureCount} başarısız`,
      data: {
        results: results,
        stats: {
          total: phones.length,
          success: successCount,
          failed: failureCount,
          successRate: Math.round((successCount / phones.length) * 100)
        }
      }
    });

  } catch (error) {
    console.error('💥 Toplu SMS Controller genel hatası:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Toplu SMS gönderilemedi - sistem hatası',
      error: error.message
    });
  }
};

exports.getSMSHistory = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, phone } = req.query;
    const offset = (page - 1) * limit;

    console.log('📋 SMS geçmişi isteniyor:', { page, limit, status, phone });

    let whereClause = 'WHERE 1=1';
    const queryParams = [];

    if (status) {
      whereClause += ' AND status = ?';
      queryParams.push(status);
    }

    if (phone) {
       whereClause += ' AND phone_number LIKE ?';
       queryParams.push(`%${phone}%`);
     }

     const countQuery = `SELECT COUNT(*) as total FROM sms_logs ${whereClause}`;
     const [countResult] = await db.query(countQuery, queryParams);
     const total = countResult[0].total;

     const historyQuery = `
       SELECT id, phone_number, message, list_name, sending_title, contact_name, contact_category, status, error_message, created_at, sent_at
       FROM sms_logs 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?
     `;
    
    queryParams.push(parseInt(limit), parseInt(offset));
    const [historyResult] = await db.query(historyQuery, queryParams);

    res.json({
      success: true,
      message: 'SMS geçmişi başarıyla alındı',
      data: {
        history: historyResult,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ SMS geçmişi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'SMS geçmişi getirilemedi',
      error: error.message
    });
  }
};

exports.getSMSStats = async (req, res) => {
  try {
    console.log('📊 SMS istatistikleri isteniyor...');

     const todayQuery = `
       SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM sms_logs 
       WHERE DATE(created_at) = CURDATE()
     `;
    
    const [todayResult] = await db.query(todayQuery);
    const todayStats = todayResult[0];

     const monthQuery = `
       SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM sms_logs 
       WHERE YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())
     `;
    
    const [monthResult] = await db.query(monthQuery);
    const monthStats = monthResult[0];

     const totalQuery = `
       SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM sms_logs
     `;
    
    const [totalResult] = await db.query(totalQuery);
    const totalStats = totalResult[0];

    res.json({
      success: true,
      message: 'SMS istatistikleri başarıyla alındı',
      data: {
        today: {
          total: parseInt(todayStats.total),
          sent: parseInt(todayStats.sent),
          failed: parseInt(todayStats.failed),
          pending: parseInt(todayStats.pending),
          successRate: todayStats.total > 0 ? Math.round((todayStats.sent / todayStats.total) * 100) : 0
        },
        thisMonth: {
          total: parseInt(monthStats.total),
          sent: parseInt(monthStats.sent),
          failed: parseInt(monthStats.failed),
          pending: parseInt(monthStats.pending),
          successRate: monthStats.total > 0 ? Math.round((monthStats.sent / monthStats.total) * 100) : 0
        },
        allTime: {
          total: parseInt(totalStats.total),
          sent: parseInt(totalStats.sent),
          failed: parseInt(totalStats.failed),
          pending: parseInt(totalStats.pending),
          successRate: totalStats.total > 0 ? Math.round((totalStats.sent / totalStats.total) * 100) : 0
        }
      }
    });

  } catch (error) {
    console.error('❌ SMS istatistikleri hatası:', error);
    res.status(500).json({
      success: false,
      message: 'SMS istatistikleri getirilemedi',
      error: error.message
    });
  }
};

exports.testSMS = async (req, res) => {
  try {
    const { phone = '5551234567', message = 'Test mesajı - Bana Özel SMS Sistemi' } = req.body;

    console.log('🧪 SMS test ediliyor:', { phone, messageLength: message.length });

    const smsResult = await smsService.sendSMS(phone, message);
    
    console.log('🧪 Test SMS sonucu:', smsResult);

    res.json({
      success: smsResult.success,
      message: smsResult.success ? 'Test SMS başarıyla gönderildi' : 'Test SMS gönderilemedi',
      data: {
        phone: smsResult.phone,
        message: message,
        result: smsResult,
        config: smsService.getConfig()
      }
    });

  } catch (error) {
    console.error('❌ SMS test hatası:', error);
    res.status(500).json({
      success: false,
      message: 'SMS test edilemedi',
      error: error.message
    });
  }
};