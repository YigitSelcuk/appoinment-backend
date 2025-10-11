const { promisePool } = require('../config/database');
const { promisePool: db } = require('../config/database');
const path = require('path');
const fs = require('fs');
const { logActivity } = require('./activitiesController');
const { createNotification } = require('./notificationsController');

// Tüm CV'leri getir (sayfalama ve filtreleme ile)
const getCVs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const position = req.query.position || '';
    const user_id = req.user.id;

    // Toplam kayıt sayısını al (tüm CV'ler)
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM cvs 
      WHERE 1=1
    `;
    let countParams = [];

    if (search) {
      countQuery += ` AND (adi LIKE ? OR soyadi LIKE ? OR email LIKE ? OR meslek LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status) {
      countQuery += ` AND durum = ?`;
      countParams.push(status);
    }

    if (position) {
      countQuery += ` AND meslek LIKE ?`;
      countParams.push(`%${position}%`);
    }

    const [countResult] = await promisePool.execute(countQuery, countParams);
    const totalRecords = countResult[0].total;
    const totalPages = Math.ceil(totalRecords / limit);

    // Ana sorgu (tüm CV'ler) - Users tablosu ile join
    let query = `
      SELECT 
        c.id,
        c.tc_kimlik_no,
        c.ilce,
        c.mahalle,
        c.adres,
        c.talep_edilen_is,
        c.profil_resmi,
        c.kayit_tarihi,
        c.adi,
        c.soyadi,
        c.meslek,
        c.referans,
        c.email,
        c.telefon,
        c.durum,
        c.cv_dosyasi,
        c.notlar,
        c.created_at,
        c.updated_at,
        c.user_id,
        u.name as user_name
      FROM cvs c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE 1=1
    `;
    let queryParams = [];

    if (search) {
      query += ` AND (c.adi LIKE ? OR c.soyadi LIKE ? OR c.email LIKE ? OR c.meslek LIKE ?)`;
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status) {
      query += ` AND c.durum = ?`;
      queryParams.push(status);
    }

    if (position) {
      query += ` AND c.meslek LIKE ?`;
      queryParams.push(`%${position}%`);
    }

    query += ` ORDER BY c.kayit_tarihi DESC LIMIT ${limit} OFFSET ${offset}`;
    // limit ve offset parametrelerini direkt query'ye ekliyoruz

    const [cvs] = await promisePool.execute(query, queryParams);

    res.json({
      success: true,
      data: cvs,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalRecords: totalRecords,
        limit: limit
      }
    });
  } catch (error) {
    console.error('CV getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'CV verileri getirilirken bir hata oluştu.',
      error: error.message
    });
  }
};

// CV detayını getir
const getCVById = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const [cvs] = await promisePool.execute(
      `SELECT c.*, u.name as user_name 
       FROM cvs c 
       LEFT JOIN users u ON c.user_id = u.id 
       WHERE c.id = ?`,
      [id]
    );

    if (cvs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'CV bulunamadı.'
      });
    }

    // Aktivite kaydı oluştur
    await logActivity(
      req.user.id,
      req.user.name || req.user.username || 'Bilinmeyen Kullanıcı',
      req.user.email || '',
      'READ',
      'cvs',
      id,
      `CV görüntülendi: ${cvs[0].adi} ${cvs[0].soyadi} - ${cvs[0].meslek}`,
      null,
      null,
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent')
    );

    res.json({
      success: true,
      data: cvs[0]
    });
  } catch (error) {
    console.error('CV detay getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'CV detayı getirilirken bir hata oluştu.',
      error: error.message
    });
  }
};

// Yeni CV ekle
const createCV = async (req, res) => {
  try {
    console.log('=== CV EKLEME İSTEĞİ ===');
  console.log('req.body:', req.body);
  console.log('req.files:', req.files);
  console.log('req.user:', req.user);
  console.log('req.headers["content-type"]:', req.headers['content-type']);
  
  // FormData alanlarını kontrol et
  console.log('FormData alanları:');
  for (const [key, value] of Object.entries(req.body)) {
    console.log(`${key}: ${value}`);
  }
    
    const {
      tc_kimlik_no,
      kayit_tarihi,
      adi,
      soyadi,
      ilce,
      mahalle,
      adres,
      talep_edilen_is,
      meslek,
      telefon,
      email,
      referans,
      durum,
      notlar,
      existing_profil_resmi,
      contact_avatar
    } = req.body;
    const user_id = req.user.id;
    
    // CV dosyaları - birden fazla dosya JSON array olarak saklanacak
    let cv_dosyasi = null;
    if (req.files && req.files['cv_dosyasi'] && req.files['cv_dosyasi'].length > 0) {
      // Tüm dosyaları JSON array olarak kaydet
      const dosyaListesi = req.files['cv_dosyasi'].map(f => f.filename);
      cv_dosyasi = JSON.stringify(dosyaListesi);
      
      // Tüm dosya isimlerini loglayalım
      console.log('Yüklenen CV dosyaları JSON:', cv_dosyasi);
    }
    
    // Profil resmi: contact avatar, varolan dosya adı veya yeni yüklenen dosya
    let profil_resmi = null;
    if (contact_avatar) {
      profil_resmi = contact_avatar;
    } else if (existing_profil_resmi) {
      profil_resmi = existing_profil_resmi;
    } else if (req.files && req.files['profil_resmi'] && req.files['profil_resmi'][0]) {
      profil_resmi = req.files['profil_resmi'][0].filename;
    }
    
    console.log('Profil resmi bilgisi:', {
      contact_avatar,
      existing_profil_resmi,
      uploaded_file: req.files && req.files['profil_resmi'] ? req.files['profil_resmi'][0].filename : null,
      final_profil_resmi: profil_resmi
    });

    console.log('Çıkarılan veriler:');
    console.log('adi:', adi);
    console.log('soyadi:', soyadi);
    console.log('meslek:', meslek);
    console.log('kayit_tarihi:', kayit_tarihi);
    console.log('durum:', durum);

    // Zorunlu alanları kontrol et
    if (!adi || !soyadi || !meslek || !kayit_tarihi) {
      console.log('HATA: Zorunlu alanlar eksik!');
      console.log('adi boş mu?', !adi);
      console.log('soyadi boş mu?', !soyadi);
      console.log('meslek boş mu?', !meslek);
      console.log('kayit_tarihi boş mu?', !kayit_tarihi);
      return res.status(400).json({
        success: false,
        message: 'Adı, soyadı, meslek ve kayıt tarihi zorunludur.'
      });
    }

    const [result] = await promisePool.execute(
      `INSERT INTO cvs (
        user_id, tc_kimlik_no, kayit_tarihi, adi, soyadi, ilce, mahalle, adres,
        talep_edilen_is, meslek, telefon, email, referans, durum, cv_dosyasi, profil_resmi, notlar
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id, tc_kimlik_no || null, kayit_tarihi, adi, soyadi, ilce || null, mahalle || null, adres || null,
        talep_edilen_is || null, meslek, telefon || null, email || null, referans || null, durum || 'İŞ ARIYOR',
        cv_dosyasi, profil_resmi, notlar || null
      ]
    );

    // Oluşturulan CV'yi getir
    const [newCV] = await promisePool.execute(
      'SELECT * FROM cvs WHERE id = ?',
      [result.insertId]
    );

    // Aktivite kaydı oluştur
    await logActivity(
      req.user.id,
      req.user.name || req.user.username || 'Bilinmeyen Kullanıcı',
      req.user.email || '',
      'CREATE',
      'cvs',
      result.insertId,
      `Yeni CV eklendi: ${adi} ${soyadi} - ${meslek}`,
      null,
      JSON.stringify(newCV[0]),
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent')
    );

    // Bildirim oluştur
    try {
      await createNotification(
        user_id,
        'Yeni CV Eklendi',
        `${adi} ${soyadi} adlı kişinin CV'si başarıyla eklendi. Meslek: ${meslek}`,
        'cv_added',
        result.insertId,
        'cvs'
      );
      console.log('CV ekleme bildirimi oluşturuldu');
    } catch (notificationError) {
      console.error('Bildirim oluşturma hatası:', notificationError);
      // Bildirim hatası CV ekleme işlemini etkilemez
    }

    res.status(201).json({
      success: true,
      message: 'CV başarıyla eklendi.',
      data: newCV[0]
    });
  } catch (error) {
    console.error('CV ekleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'CV eklenirken bir hata oluştu.',
      error: error.message
    });
  }
};

// CV güncelle
const updateCV = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tc_kimlik_no,
      kayit_tarihi,
      adi,
      soyadi,
      ilce,
      mahalle,
      adres,
      talep_edilen_is,
      meslek,
      telefon,
      email,
      referans,
      durum,
      notlar
    } = req.body;
    const user_id = req.user.id;
    
    // CV dosyaları - birden fazla dosya JSON array olarak saklanacak
    let cv_dosyasi = null;
    if (req.files && req.files['cv_dosyasi'] && req.files['cv_dosyasi'].length > 0) {
      // Tüm dosyaları JSON array olarak kaydet
      const dosyaListesi = req.files['cv_dosyasi'].map(f => f.filename);
      cv_dosyasi = JSON.stringify(dosyaListesi);
    }
    
    const profil_resmi = req.files && req.files['profil_resmi'] && req.files['profil_resmi'][0] ? req.files['profil_resmi'][0].filename : null;

    // CV'nin varlığını ve sahipliğini kontrol et
    const [existingCV] = await promisePool.execute(
      'SELECT * FROM cvs WHERE id = ? AND user_id = ?',
      [id, user_id]
    );

    if (existingCV.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'CV bulunamadı.'
      });
    }

    // Güncelleme sorgusu
    let updateQuery = `
      UPDATE cvs SET 
        tc_kimlik_no = ?, kayit_tarihi = ?, adi = ?, soyadi = ?, ilce = ?, mahalle = ?, adres = ?,
        talep_edilen_is = ?, meslek = ?, telefon = ?, email = ?, referans = ?, durum = ?, notlar = ?, updated_at = CURRENT_TIMESTAMP
    `;
    let updateParams = [
      tc_kimlik_no || existingCV[0].tc_kimlik_no,
      kayit_tarihi || existingCV[0].kayit_tarihi,
      adi || existingCV[0].adi,
      soyadi || existingCV[0].soyadi,
      ilce || existingCV[0].ilce,
      mahalle || existingCV[0].mahalle,
      adres || existingCV[0].adres,
      talep_edilen_is || existingCV[0].talep_edilen_is,
      meslek || existingCV[0].meslek,
      telefon || existingCV[0].telefon,
      email || existingCV[0].email,
      referans || existingCV[0].referans,
      durum || existingCV[0].durum,
      notlar || existingCV[0].notlar
    ];

    if (cv_dosyasi) {
      updateQuery += ', cv_dosyasi = ?';
      updateParams.push(cv_dosyasi);
    }

    if (profil_resmi) {
      updateQuery += ', profil_resmi = ?';
      updateParams.push(profil_resmi);
    }

    updateQuery += ' WHERE id = ? AND user_id = ?';
    updateParams.push(id, user_id);

    await promisePool.execute(updateQuery, updateParams);

    // Güncellenmiş CV'yi getir
    const [updatedCV] = await promisePool.execute(
      'SELECT * FROM cvs WHERE id = ?',
      [id]
    );

    // Aktivite kaydı oluştur
    await logActivity(
      req.user.id,
      req.user.name || req.user.username || 'Bilinmeyen Kullanıcı',
      req.user.email || '',
      'UPDATE',
      'cvs',
      id,
      `CV güncellendi: ${updatedCV[0].adi} ${updatedCV[0].soyadi} - ${updatedCV[0].meslek}`,
      JSON.stringify(existingCV[0]),
      JSON.stringify(updatedCV[0]),
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent')
    );

    res.json({
      success: true,
      message: 'CV başarıyla güncellendi.',
      data: updatedCV[0]
    });
  } catch (error) {
    console.error('CV güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'CV güncellenirken bir hata oluştu.',
      error: error.message
    });
  }
};

// CV sil
const deleteCV = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    // CV'nin varlığını ve sahipliğini kontrol et
    const [existingCV] = await promisePool.execute(
      'SELECT * FROM cvs WHERE id = ? AND user_id = ?',
      [id, user_id]
    );

    if (existingCV.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'CV bulunamadı.'
      });
    }

    // CV'yi sil
    await promisePool.execute(
      'DELETE FROM cvs WHERE id = ? AND user_id = ?',
      [id, user_id]
    );

    // Aktivite kaydı oluştur
    await logActivity(
      req.user.id,
      req.user.name || req.user.username || 'Bilinmeyen Kullanıcı',
      req.user.email || '',
      'DELETE',
      'cvs',
      id,
      `CV silindi: ${existingCV[0].adi} ${existingCV[0].soyadi} - ${existingCV[0].meslek}`,
      JSON.stringify(existingCV[0]),
      null,
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent')
    );

    res.json({
      success: true,
      message: 'CV başarıyla silindi.'
    });
  } catch (error) {
    console.error('CV silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'CV silinirken bir hata oluştu.',
      error: error.message
    });
  }
};

// Durum listesini getir
const getStatuses = async (req, res) => {
  try {
    const statuses = [
      'İŞ ARIYOR',
      'YÖNLENDİRİLDİ',
      'İŞE YERLEŞTİRİLDİ',
      'BEKLEMEDE',
      'İŞ BULUNDU'
    ];

    res.json({
      success: true,
      data: statuses
    });
  } catch (error) {
    console.error('Durum listesi getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Durum listesi getirilirken bir hata oluştu.',
      error: error.message
    });
  }
};

// CV dosyası indir
const downloadCVFile = async (req, res) => {
  try {
    const { filename } = req.params;
    const user_id = req.user.id;

    // Dosya adından CV'yi bul - JSON array içinde arama yap
    const [cvs] = await promisePool.execute(
      'SELECT * FROM cvs WHERE JSON_CONTAINS(cv_dosyasi, JSON_QUOTE(?)) OR cv_dosyasi = ?',
      [filename, filename]
    );

    if (cvs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'CV dosyası bulunamadı.'
      });
    }

    // Dosya yolunu oluştur
    const filePath = path.join(__dirname, '../uploads/cvs', filename);

    // Dosyanın varlığını kontrol et
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Dosya bulunamadı.'
      });
    }

    // Aktivite kaydı oluştur
    await logActivity(
      req.user.id,
      req.user.name || req.user.username || 'Bilinmeyen Kullanıcı',
      req.user.email || '',
      'READ',
      'cvs',
      cvs[0].id,
      `CV dosyası indirildi: ${cvs[0].adi} ${cvs[0].soyadi} - ${filename}`,
      null,
      null,
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent')
    );

    // Dosyayı indir
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Dosya indirme hatası:', err);
        res.status(500).json({
          success: false,
          message: 'Dosya indirilemedi.'
        });
      }
    });
  } catch (error) {
    console.error('CV dosyası indirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'CV dosyası indirilirken bir hata oluştu.',
      error: error.message
    });
  }
};

// Profil resmi görüntüle
const getProfileImage = async (req, res) => {
  try {
    const { filename } = req.params;
    const user_id = req.user.id;

    console.log('Profil resmi isteniyor:', filename);

    // Önce CV'lerde ara (tüm CV'lere erişim)
    const [cvs] = await promisePool.execute(
      'SELECT * FROM cvs WHERE profil_resmi = ?',
      [filename]
    );

    let filePath;
    let activityMessage;
    let recordId;

    if (cvs.length > 0) {
      // CV profil resmi bulundu
      filePath = path.join(__dirname, '../uploads/cvs', filename);
      activityMessage = `CV profil resmi görüntülendi: ${cvs[0].adi} ${cvs[0].soyadi} - ${filename}`;
      recordId = cvs[0].id;
    } else {
      // CV'de bulunamadı, contact avatar'ı olabilir
      // Avatar dosyaları için kontrol et
      if (filename.startsWith('avatar_')) {
        filePath = path.join(__dirname, '../uploads/avatars', filename);
        activityMessage = `Contact avatar görüntülendi: ${filename}`;
        recordId = null;
      } else {
        return res.status(404).json({
          success: false,
          message: 'Profil resmi bulunamadı veya erişim yetkiniz yok.'
        });
      }
    }

    // Dosyanın varlığını kontrol et
    if (!fs.existsSync(filePath)) {
      console.log('Dosya bulunamadı:', filePath);
      return res.status(404).json({
        success: false,
        message: 'Profil resmi dosyası bulunamadı.'
      });
    }

    // Aktivite kaydı oluştur
    await logActivity(
      req.user.id,
      req.user.name || req.user.username || 'Bilinmeyen Kullanıcı',
      req.user.email || '',
      'READ',
      recordId ? 'cvs' : 'contacts',
      recordId,
      activityMessage,
      null,
      null,
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent')
    );

    console.log('Dosya gönderiliyor:', filePath);
    // Resmi gönder
    res.sendFile(filePath);
  } catch (error) {
    console.error('Profil resmi görüntüleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Profil resmi görüntülenirken bir hata oluştu.',
      error: error.message
    });
  }
};

const updateCVStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { durum } = req.body;

    console.log('updateCVStatus çağrıldı:', { id, durum, body: req.body });

    if (!durum) {
      return res.status(400).json({
        success: false,
        message: 'Durum bilgisi gereklidir.'
      });
    }

    const validStatuses = ['İŞ ARIYOR', 'YÖNLENDİRİLDİ', 'İŞE YERLEŞTİRİLDİ', 'BEKLEMEDE', 'İŞ BULUNDU'];
  
    console.log('Durum kontrolü:', { durum, validStatuses, isValid: validStatuses.includes(durum) });

    if (!validStatuses.includes(durum)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz durum değeri.'
      });
    }

    console.log('SQL sorgusu çalıştırılıyor:', { durum, id });

    const [result] = await db.execute(
      'UPDATE cvs SET durum = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [durum, id]
    );

    console.log('SQL sonucu:', result);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'CV bulunamadı.'
      });
    }

    console.log('CV durumu başarıyla güncellendi:', { id, durum });

    res.json({
      success: true,
      message: 'CV durumu başarıyla güncellendi.'
    });

  } catch (error) {
    console.error('CV durum güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'CV durumu güncellenirken bir hata oluştu.',
      error: error.message
    });
  }
};

module.exports = {
  getCVs,
  getCVById,
  createCV,
  updateCV,
  deleteCV,
  getStatuses,
  downloadCVFile,
  getProfileImage,
  updateCVStatus
};