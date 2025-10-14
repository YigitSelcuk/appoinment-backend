// Merkezi veritabanı bağlantısı
const { createAsyncConnection, promisePool } = require('../config/database');

// Tüm kişileri getir
const getContacts = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    
    // Sayfalama parametreleri
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 14;
    const offset = (page - 1) * limit;
    
    // Arama parametresi
    const { search } = req.query;
    
    // Tüm kullanıcıların kişilerini getir (user_id filtresi kaldırıldı)
    let whereClause = 'WHERE 1=1';
    let queryParams = [];
    
    if (search) {
      whereClause += ' AND (name LIKE ? OR surname LIKE ? OR phone1 LIKE ? OR phone2 LIKE ? OR category LIKE ? OR title LIKE ? OR district LIKE ?)';
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    // Toplam sayı sorgusu
    const countQuery = `SELECT COUNT(*) as total FROM contacts ${whereClause}`;
    const [countResult] = await promisePool.execute(countQuery, queryParams);
    const total = countResult[0].total;
    
    // Basit sorgu - LIMIT ve OFFSET'i doğrudan SQL'e ekle
    const dataQuery = `
      SELECT id, tc_no, name, surname, phone1, phone2, email, category, title, district, address, notes, avatar, gender, created_at, updated_at
      FROM contacts 
      ${whereClause}
      ORDER BY name ASC, surname ASC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;
    
    const [rows] = await promisePool.execute(dataQuery, queryParams);
    
    // Avatar URL'lerini tam URL'ye çevir
    const processedRows = rows.map(contact => ({
      ...contact,
      avatar: contact.avatar && !contact.avatar.startsWith('http') 
        ? `${process.env.BACKEND_URL || 'http://localhost:5000'}${contact.avatar}`
        : contact.avatar
    }));
    
    res.json({
      success: true,
      data: processedRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Kişiler getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kişiler getirilirken hata oluştu'
    });
  }
};

// Tek kişi getir
const getContact = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const contactId = req.params.id;
    
    // Tüm kullanıcıların kişilerini görebilmesi için user_id filtresi kaldırıldı
    const [rows] = await promisePool.execute(
      'SELECT * FROM contacts WHERE id = ?',
      [contactId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kişi bulunamadı'
      });
    }
    
    // Avatar URL'ini tam URL'ye çevir
    const contact = {
      ...rows[0],
      avatar: rows[0].avatar && !rows[0].avatar.startsWith('http') 
        ? `${process.env.BACKEND_URL || 'http://localhost:5000'}${rows[0].avatar}`
        : rows[0].avatar
    };
    
    res.json({
      success: true,
      data: contact
    });
    
  } catch (error) {
    console.error('Kişi getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kişi getirilirken hata oluştu'
    });
  }
};

// Yeni kişi ekle
const createContact = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { name, surname, phone1, phone2, email, category, title, district, tc_no, gender } = req.body;
    
    // Zorunlu alanları kontrol et
    if (!name || !surname || !phone1) {
      return res.status(400).json({
        success: false,
        message: 'Ad, soyad ve telefon alanları zorunludur'
      });
    }
    
    console.log('Gelen veri:', { name, surname, phone1, phone2, email, category, title, district, tc_no, gender });
    console.log('Yüklenen dosya:', req.file);
    
    // Avatar yolu (eğer dosya yüklendiyse)
    const avatarPath = req.file ? `${process.env.BACKEND_URL || 'http://localhost:5000'}/uploads/avatars/${req.file.filename}` : null;
    
    // Tüm alanları kontrol et ve null/undefined değerleri düzelt
    const insertData = {
      user_id: userId,
      tc_no: tc_no || null,
      name: name || '',
      surname: surname || '',
      phone1: phone1 || '',
      phone2: phone2 || null,
      email: email || null,
      category: category || 'GENEL',
      title: title || null,
      district: district || null,
      address: null, // Şimdilik null
      notes: null,   // Şimdilik null
      avatar: avatarPath,  // Yüklenen resim yolu
      gender: gender || 'ERKEK'
    };
    
    console.log('Veritabanına gönderilecek veri:', insertData);
    
    const [result] = await promisePool.execute(
      `INSERT INTO contacts (user_id, tc_no, name, surname, phone1, phone2, email, category, title, district, address, notes, avatar, gender)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        insertData.user_id,
        insertData.tc_no,
        insertData.name,
        insertData.surname,
        insertData.phone1,
        insertData.phone2,
        insertData.email,
        insertData.category,
        insertData.title,
        insertData.district,
        insertData.address,
        insertData.notes,
        insertData.avatar,
        insertData.gender
      ]
    );
    
    // Eklenen kişiyi getir
    const [newContact] = await promisePool.execute(
      'SELECT * FROM contacts WHERE id = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      success: true,
      message: 'Kişi başarıyla eklendi',
      data: newContact[0]
    });
    
  } catch (error) {
    console.error('Kişi eklenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kişi eklenirken hata oluştu'
    });
  }
};

// Kişi güncelle
const updateContact = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const contactId = req.params.id;
    const { name, surname, phone1, phone2, email, category, title, district, address, notes, tc_no, gender } = req.body;
    
    // Zorunlu alanları kontrol et
    if (!name || !surname || !phone1) {
      return res.status(400).json({
        success: false,
        message: 'Ad, soyad ve telefon alanları zorunludur'
      });
    }
    
    // Kişinin varlığını kontrol et (user_id filtresi kaldırıldı)
    const [existingContact] = await promisePool.execute(
      'SELECT id FROM contacts WHERE id = ?',
      [contactId]
    );
    
    if (existingContact.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kişi bulunamadı'
      });
    }
    
    await promisePool.execute(
      `UPDATE contacts 
       SET tc_no = ?, name = ?, surname = ?, phone1 = ?, phone2 = ?, email = ?, category = ?, title = ?, district = ?, address = ?, notes = ?, gender = ?
       WHERE id = ?`,
      [tc_no || null, name, surname, phone1, phone2 || null, email || null, category || 'GENEL', title || null, district || null, address || null, notes || null, gender || 'ERKEK', contactId]
    );
    
    // Güncellenmiş kişiyi getir
    const [updatedContact] = await promisePool.execute(
      'SELECT * FROM contacts WHERE id = ?',
      [contactId]
    );
    
    res.json({
      success: true,
      message: 'Kişi başarıyla güncellendi',
      data: updatedContact[0]
    });
    
  } catch (error) {
    console.error('Kişi güncellenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kişi güncellenirken hata oluştu'
    });
  }
};

// Kişi sil
const deleteContact = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const contactId = req.params.id;
    
    // Kişinin varlığını kontrol et (user_id filtresi kaldırıldı)
    const [existingContact] = await promisePool.execute(
      'SELECT id FROM contacts WHERE id = ?',
      [contactId]
    );
    
    if (existingContact.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kişi bulunamadı'
      });
    }
    
    await promisePool.execute(
      'DELETE FROM contacts WHERE id = ?',
      [contactId]
    );
    
    res.json({
      success: true,
      message: 'Kişi başarıyla silindi'
    });
    
  } catch (error) {
    console.error('Kişi silinirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kişi silinirken hata oluştu'
    });
  }
};

// Toplu kişi silme
const deleteMultipleContacts = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { contactIds } = req.body;
    
    // contactIds array kontrolü
    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Silinecek kişi ID\'leri gereklidir'
      });
    }
    
    // Kişilerin varlığını kontrol et
    const placeholders = contactIds.map(() => '?').join(',');
    const [existingContacts] = await promisePool.execute(
      `SELECT id, name, surname FROM contacts WHERE id IN (${placeholders})`,
      contactIds
    );
    
    if (existingContacts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Silinecek kişi bulunamadı'
      });
    }
    
    // Toplu silme işlemi
    await promisePool.execute(
      `DELETE FROM contacts WHERE id IN (${placeholders})`,
      contactIds
    );
    
    res.json({
      success: true,
      message: `${existingContacts.length} kişi başarıyla silindi`,
      deletedCount: existingContacts.length,
      deletedContacts: existingContacts
    });
    
  } catch (error) {
    console.error('Toplu kişi silinirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kişiler silinirken hata oluştu'
    });
  }
};

// Kategorileri getir (contacts için)
const getCategories = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    
    // Tüm kullanıcıların kategorilerini getir
    const [rows] = await promisePool.execute(
      'SELECT DISTINCT category FROM contacts ORDER BY category'
    );
    
    const categories = rows.map(row => row.category);
    
    res.json({
      success: true,
      data: categories
    });
    
  } catch (error) {
    console.error('Kategoriler getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kategoriler getirilirken hata oluştu'
    });
  }
};

// Kategori listesini getir (categories sayfası için)
const getCategoriesWithStats = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    
    // Sayfalama parametreleri
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 14;
    const offset = (page - 1) * limit;
    
    // Arama parametresi
    const search = req.query.search || '';
    
    console.log('Kategori isteği - userId:', userId, 'page:', page, 'limit:', limit, 'offset:', offset, 'search:', search);
    
    // Arama koşulunu hazırla - Tüm kullanıcıların kategorilerini getir
    let whereCondition = '';
    let queryParams = [];
    
    if (search) {
      whereCondition = 'WHERE (c.name LIKE ? OR c.alt_kategori LIKE ? OR c.description LIKE ?)';
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }
    
    // Categories tablosundan kategorileri ve kişi sayılarını getir (alt kategoriye göre) - Tüm kullanıcılardan
    const [rows] = await promisePool.execute(
      `SELECT 
         c.id,
         c.name,
         c.alt_kategori,
         c.description,
         COALESCE(contact_counts.kisiSayisi, 0) as kisiSayisi
       FROM categories c
       LEFT JOIN (
         SELECT category, COUNT(*) as kisiSayisi
         FROM contacts 
         GROUP BY category
       ) contact_counts ON c.alt_kategori = contact_counts.category
       ${whereCondition}
       ORDER BY c.id
       LIMIT ${limit} OFFSET ${offset}`,
      queryParams
    );
    
    console.log('Kategoriler getirildi:', rows.length);
    console.log('İlk kategori örneği:', JSON.stringify(rows[0], null, 2));
    console.log('Alt kategori değeri backend:', rows[0]?.alt_kategori);
    
    // Toplam kategori sayısını getir - Tüm kullanıcıların kategorilerinden
    let countQuery = 'SELECT COUNT(*) as total FROM categories';
    let countParams = [];
    
    if (search) {
      countQuery += ' WHERE (name LIKE ? OR alt_kategori LIKE ? OR description LIKE ?)';
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern, searchPattern);
    }
    
    const [countResult] = await promisePool.execute(countQuery, countParams);
    
    const total = countResult[0].total;
    console.log('Toplam kategori sayısı:', total);
    
    // Sıra numarası ekle
    const categoriesWithSira = rows.map((category, index) => ({
      id: category.id,
      sira: index + 1 + offset,
      name: category.name,
      alt_kategori: category.alt_kategori || '',
      contact_count: category.kisiSayisi,
      description: category.description || ''
    }));
    
    res.json({
      success: true,
      data: categoriesWithSira,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Kategori istatistikleri getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kategori istatistikleri getirilirken hata oluştu: ' + error.message
    });
  }
};

// Dropdown için tüm kategorileri getir
const getAllCategoriesForDropdown = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    
    // Kategorileri al - Tüm kullanıcılardan
    const [rows] = await promisePool.execute(
      'SELECT id, name, alt_kategori FROM categories ORDER BY name'
    );
    
    res.json({
      success: true,
      data: rows
    });
    
  } catch (error) {
    console.error('Kategoriler getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kategoriler getirilirken hata oluştu'
    });
  }
};

// Kategori ekle
const createCategory = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { name, alt_kategori, description } = req.body;
    
    // Zorunlu alanları kontrol et
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Kategori adı zorunludur'
      });
    }
    
    const [result] = await promisePool.execute(
      `INSERT INTO categories (user_id, name, alt_kategori, description)
       VALUES (?, ?, ?, ?)`,
      [userId, name, alt_kategori || '', description || '']
    );
    
    // Eklenen kategoriyi getir
    const [newCategory] = await promisePool.execute(
      'SELECT * FROM categories WHERE id = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      success: true,
      message: 'Kategori başarıyla eklendi',
      data: newCategory[0]
    });
    
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Bu kategori adı zaten mevcut'
      });
    }
    console.error('Kategori eklenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kategori eklenirken hata oluştu'
    });
  }
};

// Kategori güncelle
const updateCategory = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const categoryId = req.params.id;
    const { name, alt_kategori, description } = req.body;
    
    // Zorunlu alanları kontrol et
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Kategori adı zorunludur'
      });
    }
    
    // Kategorinin varlığını ve sahibini kontrol et
    const [existingCategory] = await promisePool.execute(
      'SELECT id FROM categories WHERE id = ? AND user_id = ?',
      [categoryId, userId]
    );
    
    if (existingCategory.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kategori bulunamadı'
      });
    }
    
    await promisePool.execute(
      `UPDATE categories 
       SET name = ?, alt_kategori = ?, description = ?
       WHERE id = ? AND user_id = ?`,
      [name, alt_kategori || '', description || '', categoryId, userId]
    );
    
    // Güncellenmiş kategoriyi getir
    const [updatedCategory] = await promisePool.execute(
      'SELECT * FROM categories WHERE id = ?',
      [categoryId]
    );
    
    res.json({
      success: true,
      message: 'Kategori başarıyla güncellendi',
      data: updatedCategory[0]
    });
    
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Bu kategori adı zaten mevcut'
      });
    }
    console.error('Kategori güncellenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kategori güncellenirken hata oluştu'
    });
  }
};

// Kategori sil
const deleteCategory = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const categoryId = req.params.id;
    const { targetCategoryId } = req.body || {};
    
    // Kategorinin varlığını ve sahibini kontrol et
    const [existingCategory] = await promisePool.execute(
      'SELECT name, alt_kategori FROM categories WHERE id = ? AND user_id = ?',
      [categoryId, userId]
    );
    
    if (existingCategory.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kategori bulunamadı'
      });
    }
    
    const altKategoriName = existingCategory[0].alt_kategori;
    
    // Bu kategorideki kişi sayısını kontrol et
    const [contactCount] = await promisePool.execute(
      'SELECT COUNT(*) as count FROM contacts WHERE user_id = ? AND category = ?',
      [userId, altKategoriName]
    );
    
    let targetCategoryName = 'Kategori Yok';
    let moveMessage = 'Bu kategorideki kişiler "Kategori Yok" kategorisine taşındı.';
    
    // Eğer kişi varsa ve hedef kategori belirtilmişse
    if (contactCount[0].count > 0 && targetCategoryId) {
      // Hedef kategorinin varlığını kontrol et
      const [targetCategory] = await promisePool.execute(
        'SELECT alt_kategori FROM categories WHERE id = ? AND user_id = ?',
        [targetCategoryId, userId]
      );
      
      if (targetCategory.length > 0) {
        targetCategoryName = targetCategory[0].alt_kategori;
        moveMessage = `Bu kategorideki ${contactCount[0].count} kişi "${targetCategoryName}" kategorisine taşındı.`;
      }
    }
    
    // Kişileri hedef kategoriye taşı
    if (contactCount[0].count > 0) {
      await promisePool.execute(
        'UPDATE contacts SET category = ? WHERE user_id = ? AND category = ?',
        [targetCategoryName, userId, altKategoriName]
      );
    }
    
    // Kategoriyi sil
    await promisePool.execute(
      'DELETE FROM categories WHERE id = ? AND user_id = ?',
      [categoryId, userId]
    );
    
    res.json({
      success: true,
      message: `Kategori başarıyla silindi. ${moveMessage}`,
      movedContactsCount: contactCount[0].count
    });
    
  } catch (error) {
    console.error('Kategori silinirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kategori silinirken hata oluştu'
    });
  }
};

// Kişileri kategoriler arası taşı
const moveContactsBetweenCategories = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { fromCategory, toCategory } = req.body;
    
    if (!fromCategory || !toCategory) {
      return res.status(400).json({
        success: false,
        message: 'Kaynak ve hedef kategori gereklidir'
      });
    }
    
    // Kişileri taşı
    const [result] = await promisePool.execute(
      'UPDATE contacts SET category = ? WHERE user_id = ? AND category = ?',
      [toCategory, userId, fromCategory]
    );
    
    res.json({
      success: true,
      message: `${result.affectedRows} kişi başarıyla taşındı`,
      movedCount: result.affectedRows
    });
    
  } catch (error) {
    console.error('Kişi taşıma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kişiler taşınırken hata oluştu'
    });
  }
};

// TC Kimlik No kontrolü
const checkTCExists = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { tc_no } = req.params;
    
    if (!tc_no || tc_no.length !== 11) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz TC Kimlik No'
      });
    }
    
    const [rows] = await promisePool.execute(
      'SELECT * FROM contacts WHERE tc_no = ? AND user_id = ?',
      [tc_no, userId]
    );
    
    if (rows.length > 0) {
      // Avatar URL'ini tam URL'ye çevir
      const contact = {
        ...rows[0],
        avatar: rows[0].avatar && !rows[0].avatar.startsWith('http') 
          ? `${process.env.BACKEND_URL || 'http://localhost:5000'}${rows[0].avatar}`
          : rows[0].avatar
      };
      
      return res.json({
        success: true,
        exists: true,
        contact: contact,
        message: `Bu TC Kimlik No zaten ${rows[0].name} ${rows[0].surname} adlı kişiye ait`
      });
    }
    
    res.json({
      success: true,
      exists: false,
      message: 'TC Kimlik No kullanılabilir'
    });
    
  } catch (error) {
    console.error('TC kontrolü yapılırken hata:', error);
    res.status(500).json({
      success: false,
      message: 'TC kontrolü yapılırken hata oluştu'
    });
  }
};

// Kategorilere göre toplu SMS gönder
const sendBulkSMSByCategories = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { selectedCategories, message, listName, sendingTitle } = req.body;
    
    console.log('Kategorilere göre toplu SMS isteği:', {
      userId,
      selectedCategories,
      message: message?.substring(0, 50) + '...',
      listName,
      sendingTitle
    });
    
    // Gerekli alanları kontrol et
    if (!selectedCategories || !Array.isArray(selectedCategories) || selectedCategories.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'En az bir kategori seçilmelidir.'
      });
    }
    
    if (!message || !listName || !sendingTitle) {
      return res.status(400).json({
        success: false,
        message: 'Mesaj, liste adı ve gönderim başlığı gereklidir.'
      });
    }
    
    // Seçilen kategorilerdeki kişileri getir
    const placeholders = selectedCategories.map(() => '?').join(',');
    const [contacts] = await promisePool.execute(
      `SELECT name, surname, phone1, phone2, category 
       FROM contacts 
       WHERE user_id = ? AND category IN (${placeholders})
       ORDER BY category, name, surname`,
      [userId, ...selectedCategories]
    );
    
    if (contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Seçilen kategorilerde hiç kişi bulunamadı.'
      });
    }
    
    // Telefon numaralarını topla (hem phone1 hem phone2)
    const phoneNumbers = [];
    const contactDetails = [];
    
    contacts.forEach(contact => {
      // İlk telefon numarası (zorunlu)
      if (contact.phone1) {
        phoneNumbers.push(contact.phone1);
        contactDetails.push({
          phone: contact.phone1,
          name: contact.name,
          surname: contact.surname,
          category: contact.category
        });
      }
      
      // İkinci telefon numarası (varsa)
      if (contact.phone2 && contact.phone2.trim() !== '') {
        phoneNumbers.push(contact.phone2);
        contactDetails.push({
          phone: contact.phone2,
          name: contact.name,
          surname: contact.surname,
          category: contact.category
        });
      }
    });
    
    console.log(`Toplam ${phoneNumbers.length} telefon numarasına SMS gönderilecek`);
    console.log(`${contacts.length} kişi, ${selectedCategories.length} kategori`);
    
    // SMS servisini çağır
    const smsService = require('../services/smsService');
    const smsResult = await smsService.sendBulkSMS(phoneNumbers, message);
    
    console.log('SMS gönderim sonucu:', {
      success: smsResult.success,
      sentCount: smsResult.sentCount,
      totalCount: phoneNumbers.length
    });
    
    // SMS loglarını kaydet
    if (smsResult.success && smsResult.phones) {
      try {
        const db = require('../config/database');
        const logPromises = contactDetails.map(contact => {
          // Sadece başarıyla gönderilen numaraları logla
          if (smsResult.phones.includes(contact.phone)) {
            return db.query(`
              INSERT INTO sms_logs (
                phone_number, 
                message, 
                list_name, 
                sending_title, 
                contact_name, 
                contact_category, 
                status, 
                response_data
              ) VALUES (?, ?, ?, ?, ?, ?, 'sent', ?)
            `, [
              contact.phone,
              message,
              listName,
              sendingTitle,
              `${contact.name} ${contact.surname}`,
              contact.category,
              JSON.stringify(smsResult.response)
            ]);
          }
          return Promise.resolve();
        });
        
        await Promise.all(logPromises);
        console.log('SMS logları başarıyla kaydedildi');
      } catch (dbError) {
        console.error('SMS log kaydetme hatası:', dbError);
      }
    }
    
    // Başarısız numaraları da logla
    if (!smsResult.success || smsResult.sentCount < phoneNumbers.length) {
      try {
        const db = require('../config/database');
        const failedPhones = phoneNumbers.filter(phone => 
          !smsResult.phones || !smsResult.phones.includes(phone)
        );
        
        const failedLogPromises = failedPhones.map(phone => {
          const contact = contactDetails.find(c => c.phone === phone);
          return db.query(`
            INSERT INTO sms_logs (
              phone_number, 
              message, 
              list_name, 
              sending_title, 
              contact_name, 
              contact_category, 
              status, 
              error_message
            ) VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)
          `, [
            phone,
            message,
            listName,
            sendingTitle,
            contact ? `${contact.name} ${contact.surname}` : '',
            contact ? contact.category : '',
            smsResult.error || 'SMS gönderilemedi'
          ]);
        });
        
        await Promise.all(failedLogPromises);
        console.log('Başarısız SMS logları kaydedildi');
      } catch (dbError) {
        console.error('Başarısız SMS log kaydetme hatası:', dbError);
      }
    }
    
    // Kategori bazında özet bilgi
    const categorySummary = selectedCategories.map(category => {
      const categoryContacts = contacts.filter(c => c.category === category);
      const categoryPhones = [];
      
      categoryContacts.forEach(contact => {
        if (contact.phone1) categoryPhones.push(contact.phone1);
        if (contact.phone2 && contact.phone2.trim() !== '') categoryPhones.push(contact.phone2);
      });
      
      return {
        category,
        contactCount: categoryContacts.length,
        phoneCount: categoryPhones.length
      };
    });
    
    res.json({
      success: smsResult.success,
      message: smsResult.success 
        ? `${smsResult.sentCount}/${phoneNumbers.length} numaraya SMS başarıyla gönderildi.`
        : 'SMS gönderiminde hata oluştu.',
      data: {
        sentCount: smsResult.sentCount || 0,
        totalPhoneCount: phoneNumbers.length,
        totalContactCount: contacts.length,
        selectedCategoriesCount: selectedCategories.length,
        categorySummary,
        provider: 'Sultangazi Belediyesi',
        response: smsResult.response
      }
    });
    
  } catch (error) {
    console.error('Kategorilere göre toplu SMS gönderme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası oluştu.',
      error: error.message
    });
  }
};

module.exports = {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  deleteMultipleContacts,
  getCategories,
  getCategoriesWithStats,
  getAllCategoriesForDropdown,
  createCategory,
  updateCategory,
  deleteCategory,
  moveContactsBetweenCategories,
  checkTCExists,
  sendBulkSMSByCategories
};