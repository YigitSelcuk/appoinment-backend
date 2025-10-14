const db = require('../config/database');
const { logActivity } = require('./activitiesController');
const { createNotification } = require('./notificationsController');

// Talep istatistiklerini getir
const getRequestStats = async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    
    // Devam eden talepler (DÜŞÜK, NORMAL, ACİL, ÇOK ACİL, KRİTİK)
    const [devamEdenResult] = await db.execute(
      `SELECT COUNT(*) as count FROM requests 
       WHERE durum IN ('DÜŞÜK', 'NORMAL', 'ACİL', 'ÇOK ACİL', 'KRİTİK')`
    );
    
    // Tamamlanan talepler
    const [tamamlananResult] = await db.execute(
      `SELECT COUNT(*) as count FROM requests 
       WHERE durum = 'TAMAMLANDI'`
    );
    
    // Açık talepler (son 30 gün içinde oluşturulan)
    const [acikResult] = await db.execute(
      `SELECT COUNT(*) as count FROM requests 
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );
    
    // Toplam talepler
    const [toplamResult] = await db.execute(
      `SELECT COUNT(*) as count FROM requests`
    );
    
    const stats = {
      devam_eden: devamEdenResult[0].count,
      tamamlanan: tamamlananResult[0].count,
      acik: acikResult[0].count,
      toplam: toplamResult[0].count
    };
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('Talep istatistikleri alınırken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Talep istatistikleri alınırken hata oluştu',
      error: error.message
    });
  }
};

// Tüm talepleri getir (sayfalama ile) - Kullanıcının kendi talepleri
const getRequests = async (req, res) => {
  try {
    // Debug için user bilgisini kontrol et
    console.log('User info:', req.user);
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 14;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    // User ID'yi kontrol et
    const userId = req.user?.id || 1; // Fallback olarak 1 kullan
    console.log('Using userId:', userId);

    // Önce requests tablosunun var olup olmadığını kontrol et
    try {
      await db.execute('SELECT 1 FROM requests LIMIT 1');
    } catch (error) {
      console.log('Requests tablosu bulunamadı:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Requests tablosu bulunamadı. Lütfen veritabanını kontrol edin.',
        error: error.message
      });
    }

    // Kullanıcının rol ve müdürlük bilgilerini al
    const [userInfo] = await db.execute(
      'SELECT role, department FROM users WHERE id = ?', 
      [userId]
    );
    
    if (userInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    const { role, department } = userInfo[0];
    
    // Filtreleme mantığı
    let whereClause = '';
    let countParams = [];
    let queryParams = [];
    
    if (role === 'admin' || role === 'başkan' || department === 'BAŞKAN') {
      // Admin, Başkan rolü veya BAŞKAN department'ındaki kullanıcılar tüm talepleri görebilir
      whereClause = 'WHERE 1=1';
    } else {
      // Diğer kullanıcılar sadece kendi müdürlüklerine ait talepleri görebilir
      whereClause = 'WHERE r.ilgili_mudurluk = ?';
      countParams.push(department);
      queryParams.push(department);
    }

    // Arama varsa
    if (search) {
      whereClause += ` AND (
        r.ad LIKE ? OR 
        r.soyad LIKE ? OR 
        r.tc_no LIKE ? OR 
        r.telefon LIKE ? OR 
        r.talep_basligi LIKE ? OR
        r.ilce LIKE ? OR
        r.mahalle LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      for (let i = 0; i < 7; i++) {
        countParams.push(searchTerm);
        queryParams.push(searchTerm);
      }
    }

    console.log('Count params:', countParams);

    // Toplam kayıt sayısını al
    const countQuery = `SELECT COUNT(*) as total FROM requests r ${whereClause}`;
    
    const [countResult] = await db.execute(countQuery, countParams);
    const totalRecords = countResult[0].total;
    const totalPages = Math.ceil(totalRecords / limit);

    console.log('Query params before LIMIT/OFFSET:', queryParams);

    // Talepleri getir - LIMIT ve OFFSET'i doğrudan SQL'de kullan
    const query = `
      SELECT 
        r.*,
        u.name as created_by_user_name,
        u.email as created_by_user_email
      FROM requests r
      LEFT JOIN users u ON r.user_id = u.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;
    
    console.log('Final query params:', queryParams);
    console.log('Final query:', query);

    const [requests] = await db.execute(query, queryParams);

    // Tarihleri formatla
    const formattedRequests = requests.map(request => ({
      ...request,
      created_at: request.created_at.toISOString(),
      updated_at: request.updated_at.toISOString(),
      // Display için ayrı bir field ekle
      created_at_display: new Date(request.created_at).toLocaleString('tr-TR'),
      updated_at_display: new Date(request.updated_at).toLocaleString('tr-TR')
    }));



    res.json({
      success: true,
      data: formattedRequests,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords: totalRecords,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      userInfo: {
        role,
        department,
        isAdmin: role === 'admin',
        isBaskan: role === 'başkan',
        isBaskanDepartment: department === 'BAŞKAN'
      }
    });

  } catch (error) {
    console.error('Talepler getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Talepler getirilirken hata oluştu',
      error: error.message
    });
  }
};

// Yeni talep oluştur
const createRequest = async (req, res) => {
  try {
    const {
      tcNo,
      ad,
      soyad,
      ilce,
      mahalle,
      adres,
      telefon,
      talepDurumu,
      talepTuru,
      ilgiliMudurluk,
      talepBasligi,
      aciklama,
      durum
    } = req.body;



    // Zorunlu alanları kontrol et
    if (!ad || !soyad) {
      return res.status(400).json({
        success: false,
        message: 'Ad ve soyad alanları zorunludur'
      });
    }

    // TC Kimlik No varsa kontrol et
    if (tcNo && tcNo.length !== 11) {
      return res.status(400).json({
        success: false,
        message: 'TC Kimlik No 11 haneli olmalıdır'
      });
    }

    const query = `
      INSERT INTO requests (
        user_id, tc_no, ad, soyad, ilce, mahalle, adres, telefon,
        talep_durumu, talep_turu, ilgili_mudurluk, talep_basligi, aciklama, durum,
        created_by_name, created_by_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      req.user.id || null,
      tcNo || null,
      ad || null,
      soyad || null,
      ilce || null,
      mahalle || null,
      adres || null,
      telefon || null,
      talepDurumu || 'SEÇİNİZ',
      talepTuru || 'ARIZA TALEBİNİN GİDERİLMESİ',
      ilgiliMudurluk || 'BİLGİ İŞLEM MÜDÜRLÜĞÜ',
      talepBasligi || null,
      aciklama || null,
      durum || 'DÜŞÜK',
      req.user.name || req.user.email || 'Bilinmeyen Kullanıcı',
      req.user.email || 'admin@admin.com'
    ];



    const [result] = await db.execute(query, values);

    // Aktivite kaydı
    await logActivity(
      req.user.id,
      req.user.name || req.user.email,
      req.user.email,
      'CREATE',
      'requests',
      result.insertId,
      `Yeni talep oluşturuldu: ${ad} ${soyad} - ${talepBasligi}`,
      null,
      { ad, soyad, talepBasligi, durum, ilgiliMudurluk },
      req.ip,
      req.get('User-Agent')
    );

    // İlgili müdürlük kullanıcılarına bildirim gönder
    try {
      const [departmentUsers] = await db.execute(
        'SELECT id, name, email FROM users WHERE department = ? AND id != ?',
        [ilgiliMudurluk || 'BİLGİ İŞLEM MÜDÜRLÜĞÜ', req.user.id]
      );

      // Her kullanıcıya bildirim gönder
      for (const user of departmentUsers) {
        await createNotification(
          user.id,
          'Yeni Talep',
          `${req.user.name  || 'Bilinmeyen Kullanıcı'} tarafından yeni bir talep oluşturuldu: ${talepBasligi || 'Başlık belirtilmemiş'}`,
          'request',
          result.insertId,
          'requests'
        );
      }

      console.log(`${departmentUsers.length} kullanıcıya bildirim gönderildi`);
    } catch (notificationError) {
      console.error('Bildirim gönderilirken hata:', notificationError);
      // Bildirim hatası talep oluşturma işlemini etkilemesin
    }

    res.status(201).json({
      success: true,
      message: 'Talep başarıyla oluşturuldu',
      data: {
        id: result.insertId,
        ad,
        soyad,
        created_at: new Date().toLocaleString('tr-TR'),
        created_by: req.user.name
      }
    });

  } catch (error) {
    console.error('Talep oluşturulurken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Talep oluşturulurken hata oluştu',
      error: error.message
    });
  }
};

// Talep güncelle
const updateRequest = async (req, res) => {
  try {
    const { id } = req.params;
    

    const {
      tcNo,
      ad,
      soyad,
      ilce,
      mahalle,
      adres,
      telefon,
      talepDurumu,
      talepTuru,
      ilgiliMudurluk,
      talepBasligi,
      aciklama,
      durum
    } = req.body;

    // Talebin var olup olmadığını kontrol et
    // Admin kullanıcıları tüm talepleri güncelleyebilir, normal kullanıcılar sadece kendi taleplerini
    let checkQuery, checkParams;
    if (req.user.role === 'admin') {
      checkQuery = 'SELECT * FROM requests WHERE id = ?';
      checkParams = [id];
    } else {
      checkQuery = 'SELECT * FROM requests WHERE id = ? AND user_id = ?';
      checkParams = [id, req.user.id];
    }
    
    const [existing] = await db.execute(checkQuery, checkParams);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Talep bulunamadı'
      });
    }

    const oldRecord = existing[0];

    const query = `
      UPDATE requests SET
        tc_no = ?, ad = ?, soyad = ?, ilce = ?, mahalle = ?, adres = ?, telefon = ?,
        talep_durumu = ?, talep_turu = ?, ilgili_mudurluk = ?, talep_basligi = ?, aciklama = ?, durum = ?
      WHERE id = ? AND user_id = ?
    `;

    const values = [
      tcNo || null,
      ad,
      soyad,
      ilce || null,
      mahalle || null,
      adres || null,
      telefon || null,
      talepDurumu || 'SEÇİNİZ',
      talepTuru || 'ARIZA TALEBİNİN GİDERİLMESİ',
      ilgiliMudurluk || 'BİLGİ İŞLEM MÜDÜRLÜĞÜ',
      talepBasligi || null,
      aciklama || null,
      durum || 'DÜŞÜK',
      id,
      req.user.id
    ];

    await db.execute(query, values);

    // Değişiklikleri tespit et
    const changes = [];
    if (oldRecord.durum !== durum) changes.push(`Durum: ${oldRecord.durum} → ${durum}`);
    if (oldRecord.ad !== ad) changes.push(`Ad: ${oldRecord.ad} → ${ad}`);
    if (oldRecord.soyad !== soyad) changes.push(`Soyad: ${oldRecord.soyad} → ${soyad}`);
    if (oldRecord.talep_basligi !== talepBasligi) changes.push(`Başlık: ${oldRecord.talep_basligi} → ${talepBasligi}`);

    // Aktivite kaydı
    await logActivity(
      req.user.id,
      req.user.name || req.user.email,
      req.user.email,
      'UPDATE',
      'requests',
      id,
      `Talep güncellendi: ${ad} ${soyad} - ${changes.join(', ')}`,
      {
        ad: oldRecord.ad,
        soyad: oldRecord.soyad,
        durum: oldRecord.durum,
        talep_basligi: oldRecord.talep_basligi
      },
      { ad, soyad, durum, talepBasligi },
      req.ip,
      req.get('User-Agent')
    );

    // İlgili müdürlük kullanıcılarına bildirim gönder (güncelleme için)
    try {
      const [departmentUsers] = await db.execute(
        'SELECT id, name, email FROM users WHERE department = ? AND id != ?',
        [ilgiliMudurluk || 'BİLGİ İŞLEM MÜDÜRLÜĞÜ', req.user.id]
      );

      // Her kullanıcıya bildirim gönder
      for (const user of departmentUsers) {
        await createNotification(
          user.id,
          'Talep Güncellendi',
          `${req.user.name || 'Bilinmeyen Kullanıcı'} tarafından bir talep güncellendi: ${talepBasligi || 'Başlık belirtilmemiş'}${changes.length > 0 ? ' - ' + changes.join(', ') : ''}`,
          'request_updated',
          id,
          'requests'
        );
      }

      console.log(`${departmentUsers.length} kullanıcıya güncelleme bildirimi gönderildi`);
    } catch (notificationError) {
      console.error('Güncelleme bildirimi gönderilirken hata:', notificationError);
      // Bildirim hatası talep güncelleme işlemini etkilemesin
    }

    res.json({
      success: true,
      message: 'Talep başarıyla güncellendi'
    });

  } catch (error) {
    console.error('Talep güncellenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Talep güncellenirken hata oluştu',
      error: error.message
    });
  }
};

// Talep sil
const deleteRequest = async (req, res) => {
  try {
    const { id } = req.params;

    // Talebin var olup olmadığını ve kullanıcıya ait olup olmadığını kontrol et
    const checkQuery = 'SELECT * FROM requests WHERE id = ? AND user_id = ?';
    const [existing] = await db.execute(checkQuery, [id, req.user.id]);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Talep bulunamadı'
      });
    }

    const deletedRecord = existing[0];

    const query = 'DELETE FROM requests WHERE id = ? AND user_id = ?';
    await db.execute(query, [id, req.user.id]);

    // Aktivite kaydı
    await logActivity(
      req.user.id,
      req.user.name || req.user.email,
      req.user.email,
      'DELETE',
      'requests',
      id,
      `Talep silindi: ${deletedRecord.ad} ${deletedRecord.soyad} - ${deletedRecord.talep_basligi}`,
      {
        ad: deletedRecord.ad,
        soyad: deletedRecord.soyad,
        talep_basligi: deletedRecord.talep_basligi,
        durum: deletedRecord.durum
      },
      null,
      req.ip,
      req.get('User-Agent')
    );

    // İlgili müdürlük kullanıcılarına bildirim gönder (silme için)
    try {
      const [departmentUsers] = await db.execute(
        'SELECT id, name, email FROM users WHERE department = ? AND id != ?',
        [deletedRecord.ilgili_mudurluk || 'BİLGİ İŞLEM MÜDÜRLÜĞÜ', req.user.id]
      );

      // Her kullanıcıya bildirim gönder
      for (const user of departmentUsers) {
        await createNotification(
          user.id,
          'Talep Silindi',
          `${req.user.name || 'Bilinmeyen Kullanıcı'} tarafından bir talep silindi: ${deletedRecord.talep_basligi || 'Başlık belirtilmemiş'} (${deletedRecord.ad} ${deletedRecord.soyad})`,
          'request_deleted',
          id,
          'requests'
        );
      }

      console.log(`${departmentUsers.length} kullanıcıya silme bildirimi gönderildi`);
    } catch (notificationError) {
      console.error('Silme bildirimi gönderilirken hata:', notificationError);
      // Bildirim hatası talep silme işlemini etkilemesin
    }

    res.json({
      success: true,
      message: 'Talep başarıyla silindi'
    });

  } catch (error) {
    console.error('Talep silinirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Talep silinirken hata oluştu',
      error: error.message
    });
  }
};

// Tek talep getir
const getRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        r.*,
        u.name as created_by_user_name,
        u.email as created_by_user_email
      FROM requests r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.id = ? AND r.user_id = ?
    `;

    const [requests] = await db.execute(query, [id, req.user.id]);

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Talep bulunamadı'
      });
    }

    const request = requests[0];
    
    // Tarihleri formatla
    const originalCreatedAt = request.created_at;
    const originalUpdatedAt = request.updated_at;
    
    request.created_at = originalCreatedAt.toISOString();
    request.updated_at = originalUpdatedAt.toISOString();
    request.created_at_display = new Date(originalCreatedAt).toLocaleString('tr-TR');
    request.updated_at_display = new Date(originalUpdatedAt).toLocaleString('tr-TR');



    res.json({
      success: true,
      data: request
    });

  } catch (error) {
    console.error('Talep getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Talep getirilirken hata oluştu',
      error: error.message
    });
  }
};

// TC Kimlik No kontrolü
const checkTCExists = async (req, res) => {
  try {
    const { tcNo } = req.params;

    if (!tcNo || tcNo.length !== 11) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz TC Kimlik No'
      });
    }

    const query = 'SELECT id, ad, soyad FROM requests WHERE tc_no = ? AND user_id = ?';
    const [requests] = await db.execute(query, [tcNo, req.user.id]);

    if (requests.length > 0) {
      const request = requests[0];
      return res.json({
        success: true,
        exists: true,
        message: `Bu TC Kimlik No ile kayıtlı talep var: ${request.ad} ${request.soyad}`,
        request: request
      });
    }

    res.json({
      success: true,
      exists: false,
      message: 'TC Kimlik No kullanılabilir'
    });

  } catch (error) {
    console.error('TC kontrolü hatası:', error);
    res.status(500).json({
      success: false,
      message: 'TC kontrolü yapılırken hata oluştu',
      error: error.message
    });
  }
};

// Müdürlük bazlı talepleri getir (müdürlükteki kişilerin görebileceği talepler)
const getDepartmentRequests = async (req, res) => {
  try {
    console.log('getDepartmentRequests çağrıldı');
    console.log('req.user:', req.user);
    
    // Basit bir sorgu ile tüm talepleri getir
    const query = `
      SELECT 
        id,
        ad,
        soyad,
        tc_no,
        telefon,
        talep_basligi,
        durum,
        ilgili_mudurluk,
        created_at,
        updated_at
      FROM requests 
      ORDER BY created_at DESC
      LIMIT 50
    `;
    
    console.log('SQL sorgusu çalıştırılıyor:', query);
    const [requests] = await db.execute(query);
    console.log('Bulunan talep sayısı:', requests.length);
    
    // Basit response döndür
    const response = {
      success: true,
      data: requests,
      total: requests.length,
      message: 'Talepler başarıyla getirildi'
    };
    
    console.log('Response gönderiliyor:', response);
    res.json(response);

  } catch (error) {
    console.error('getDepartmentRequests hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Talepler getirilirken hata oluştu',
      error: error.message
    });
  }
};

// Talep durumunu güncelle
const updateRequestStatus = async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const { durum, comments } = req.body;
    const userId = req.user?.id || 1;
    const userName = req.user?.name || 'Admin User';

    // Kullanıcının rol ve müdürlük bilgisini al
    const [userResult] = await db.execute('SELECT role, department FROM users WHERE id = ?', [userId]);
    
    if (userResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    const { role: userRole, department: userDepartment } = userResult[0];

    // Mevcut talebi kontrol et
    let existingRequests;
    
    // Başkan rolü, admin rolü veya BAŞKAN department'ındaki kullanıcılar tüm talepleri görebilir ve güncelleyebilir
    if (userRole === 'başkan' || userRole === 'admin' || userDepartment === 'BAŞKAN') {
      [existingRequests] = await db.execute(
        'SELECT * FROM requests WHERE id = ?',
        [requestId]
      );
    } else {
      // Diğer kullanıcılar sadece kendi müdürlüklerinin taleplerini güncelleyebilir
      [existingRequests] = await db.execute(
        'SELECT * FROM requests WHERE id = ? AND ilgili_mudurluk = ?',
        [requestId, userDepartment]
      );
    }

    if (existingRequests.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Talep bulunamadı veya yetkiniz yok'
      });
    }

    const oldRequest = existingRequests[0];
    const oldStatus = oldRequest.durum;

    // Durumu güncelle
    await db.execute(
      'UPDATE requests SET durum = ? WHERE id = ?',
      [durum, requestId]
    );

    // Status history kaydet
    await db.execute(
      `INSERT INTO request_status_history 
       (request_id, old_status, new_status, updated_by_user_id, updated_by_name, updated_by_department, comments) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [requestId, oldStatus, durum, userId, userName, userDepartment, comments || null]
    );

    // Aktivite kaydet
    await logActivity(
      userId,
      userName,
      req.user?.email || 'admin@test.com',
      'UPDATE',
      'requests',
      requestId,
      `Talep durumu güncellendi: ${oldRequest.talep_basligi} - ${oldStatus} → ${durum}`,
      { durum: oldStatus },
      { durum },
      req.ip,
      req.get('User-Agent')
    );

    // İlgili müdürlük kullanıcılarına bildirim gönder (durum değişikliği için)
    try {
      const [departmentUsers] = await db.execute(
        'SELECT id, name, email FROM users WHERE department = ? AND id != ?',
        [oldRequest.ilgili_mudurluk || 'BİLGİ İŞLEM MÜDÜRLÜĞÜ', userId]
      );

      // Talep sahibine de bildirim gönder (eğer farklı müdürlükteyse)
      if (oldRequest.user_id && oldRequest.user_id !== userId) {
        const [requestOwner] = await db.execute(
          'SELECT id, name, email FROM users WHERE id = ?',
          [oldRequest.user_id]
        );
        
        if (requestOwner.length > 0) {
          await createNotification(
            requestOwner[0].id,
            'Talep Durumu Güncellendi',
            `Talebinizin durumu güncellendi: ${oldRequest.talep_basligi || 'Başlık belirtilmemiş'} - ${oldStatus} → ${durum}`,
            'request_status_updated',
            requestId,
            'requests'
          );
        }
      }

      // Her müdürlük kullanıcısına bildirim gönder
      for (const user of departmentUsers) {
        await createNotification(
          user.id,
          'Talep Durumu Güncellendi',
          `${userName} tarafından talep durumu güncellendi: ${oldRequest.talep_basligi || 'Başlık belirtilmemiş'} - ${oldStatus} → ${durum}`,
          'request_status_updated',
          requestId,
          'requests'
        );
      }

      console.log(`${departmentUsers.length} kullanıcıya durum değişikliği bildirimi gönderildi`);
    } catch (notificationError) {
      console.error('Durum değişikliği bildirimi gönderilirken hata:', notificationError);
      // Bildirim hatası durum güncelleme işlemini etkilemesin
    }

    res.json({
      success: true,
      message: 'Talep durumu başarıyla güncellendi',
      old_status: oldStatus,
      new_status: durum
    });

  } catch (error) {
    console.error('Talep durumu güncellenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Talep durumu güncellenirken hata oluştu',
      error: error.message
    });
  }
};

// Talep durum geçmişini getir
const getRequestStatusHistory = async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    
    // Status history'yi getir
    const [history] = await db.execute(
      `SELECT 
        rsh.*,
        u.name as updated_by_user_name,
        u.email as updated_by_user_email
      FROM request_status_history rsh
      LEFT JOIN users u ON rsh.updated_by_user_id = u.id
      WHERE rsh.request_id = ?
      ORDER BY rsh.created_at ASC`,
      [requestId]
    );

    // Tarihleri formatla
    const formattedHistory = history.map(item => ({
      ...item,
      created_at: item.created_at.toISOString(),
      created_at_display: new Date(item.created_at).toLocaleString('tr-TR')
    }));

    res.json({
      success: true,
      data: formattedHistory
    });

  } catch (error) {
    console.error('Talep geçmişi getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Talep geçmişi getirilirken hata oluştu',
      error: error.message
    });
  }
};

const deleteMultipleRequests = async (req, res) => {
  try {
    const { requestIds } = req.body;

    if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Geçerli talep ID\'leri gerekli'
      });
    }

    // Tüm taleplerin var olup olmadığını ve kullanıcıya ait olup olmadığını kontrol et
    const placeholders = requestIds.map(() => '?').join(',');
    const checkQuery = `SELECT * FROM requests WHERE id IN (${placeholders}) AND user_id = ?`;
    const [existing] = await db.execute(checkQuery, [...requestIds, req.user.id]);

    if (existing.length !== requestIds.length) {
      return res.status(404).json({
        success: false,
        message: 'Bazı talepler bulunamadı veya size ait değil'
      });
    }

    // Toplu silme işlemi
    const deleteQuery = `DELETE FROM requests WHERE id IN (${placeholders}) AND user_id = ?`;
    await db.execute(deleteQuery, [...requestIds, req.user.id]);

    // Her silinen talep için aktivite kaydı
    for (const record of existing) {
      await logActivity(
        req.user.id,
        req.user.name || req.user.email,
        req.user.email,
        'DELETE',
        'requests',
        record.id,
        `Talep silindi: ${record.ad} ${record.soyad} - ${record.talep_basligi}`,
        {
          ad: record.ad,
          soyad: record.soyad,
          talep_basligi: record.talep_basligi,
          durum: record.durum
        },
        null,
        req.ip,
        req.get('User-Agent')
      );
    }

    res.json({
      success: true,
      message: `${requestIds.length} talep başarıyla silindi`,
      deletedCount: requestIds.length
    });

  } catch (error) {
    console.error('Toplu talep silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Talepler silinirken bir hata oluştu'
    });
  }
};

module.exports = {
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
};