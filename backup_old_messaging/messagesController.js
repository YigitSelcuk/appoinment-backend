const { promisePool: db } = require('../config/database');
const path = require('path');

// Tüm mesajları getir (sayfalama ve filtreleme ile)
exports.getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;

    // Arama
    const { search } = req.query;
    console.log('Backend - Arama parametresi:', search);
    
    let whereConditions = ['user_id = ?'];
    let queryParams = [userId];

    if (search) {
      console.log('Backend - Arama yapılıyor:', search);
      whereConditions.push(`(
        list_name LIKE ? OR 
        title LIKE ? OR 
        status LIKE ? OR 
        content LIKE ? OR
        recipient_count LIKE ? OR
        delivered_count LIKE ? OR
        read_count LIKE ? OR
        DATE_FORMAT(send_date, '%d.%m.%Y') LIKE ? OR
        DATE_FORMAT(send_date, '%d/%m/%Y') LIKE ? OR
        DATE_FORMAT(send_date, '%Y-%m-%d') LIKE ? OR
        TIME_FORMAT(send_time, '%H:%i') LIKE ? OR
        TIME_FORMAT(send_time, '%H.%i') LIKE ? OR
        CONCAT(DATE_FORMAT(send_date, '%d.%m.%Y'), ' ', TIME_FORMAT(send_time, '%H:%i')) LIKE ?
      )`);
      const searchTerm = `%${search}%`;
      queryParams.push(
        searchTerm, // list_name
        searchTerm, // title  
        searchTerm, // status
        searchTerm, // content
        searchTerm, // recipient_count
        searchTerm, // delivered_count
        searchTerm, // read_count
        searchTerm, // send_date (%d.%m.%Y)
        searchTerm, // send_date (%d/%m/%Y)
        searchTerm, // send_date (%Y-%m-%d)
        searchTerm, // send_time (%H:%i)
        searchTerm, // send_time (%H.%i)
        searchTerm  // combined date and time
      );
    }

    const whereClause = whereConditions.join(' AND ');

    // Toplam kayıt sayısı
    const countQuery = `SELECT COUNT(*) as total FROM messages WHERE ${whereClause}`;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    // Mesajları getir - queryParams'ı kopyala ve limit/offset ekle
    const query = `
      SELECT 
        id,
        list_name,
        title,
        content,
        CASE 
          WHEN send_date IS NULL THEN 'SİLİNMEMİŞ'
          ELSE DATE_FORMAT(send_date, '%d.%m.%Y')
        END as send_date,
        CASE 
          WHEN send_time IS NULL THEN ''
          ELSE TIME_FORMAT(send_time, '%H:%i')
        END as send_time,
        recipient_count,
        delivered_count,
        read_count,
        status,
        created_at,
        updated_at
      FROM messages 
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const selectQueryParams = [...queryParams, limit.toString(), offset.toString()];
    
    // Debug için log ekle
    console.log('Query:', query);
    console.log('Parameters:', selectQueryParams);
    console.log('Parameter types:', selectQueryParams.map(p => typeof p));
    
    // Önce basit query ile test et
    try {
      const [testResult] = await db.execute('SELECT COUNT(*) as count FROM messages WHERE user_id = ?', [userId]);
      console.log('Test query result:', testResult);
    } catch (testError) {
      console.log('Test query error:', testError);
    }
    
    const [messages] = await db.execute(query, selectQueryParams);

    // Sayfalama bilgisi
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: messages,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        total: total,
        limit: limit
      }
    });

  } catch (error) {
    console.error('Mesajları getirirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Mesajları getirirken bir hata oluştu',
      error: error.message
    });
  }
};

// Mesaj detayını getir
exports.getMessageById = async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.id;

    const query = `
      SELECT 
        id,
        list_name,
        title,
        content,
        DATE_FORMAT(send_date, '%Y-%m-%d') as send_date,
        TIME_FORMAT(send_time, '%H:%i') as send_time,
        recipient_count,
        delivered_count,
        read_count,
        status,
        created_at,
        updated_at
      FROM messages 
      WHERE id = ? AND user_id = ?
    `;

    const [messages] = await db.execute(query, [messageId, userId]);

    if (messages.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mesaj bulunamadı'
      });
    }

    res.json({
      success: true,
      data: messages[0]
    });

  } catch (error) {
    console.error('Mesaj detayını getirirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Mesaj detayını getirirken bir hata oluştu',
      error: error.message
    });
  }
};

// Yeni mesaj oluştur
exports.createMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      list_name,
      title,
      content,
      send_date,
      send_time,
      recipient_count,
      status = 'Beklemede'
    } = req.body;

    // Gerekli alanları kontrol et
    if (!list_name || !title) {
      return res.status(400).json({
        success: false,
        message: 'Liste adı ve başlık zorunludur'
      });
    }

    const query = `
      INSERT INTO messages (
        user_id, list_name, title, content, send_date, send_time, 
        recipient_count, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.execute(query, [
      userId,
      list_name,
      title,
      content || null,
      send_date || null,
      send_time || null,
      recipient_count || 0,
      status
    ]);

    res.status(201).json({
      success: true,
      message: 'Mesaj başarıyla oluşturuldu',
      data: {
        id: result.insertId,
        list_name,
        title,
        content,
        send_date,
        send_time,
        recipient_count,
        status
      }
    });

  } catch (error) {
    console.error('Mesaj oluştururken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Mesaj oluştururken bir hata oluştu',
      error: error.message
    });
  }
};

// Mesajı güncelle
exports.updateMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.id;
    const {
      list_name,
      title,
      content,
      send_date,
      send_time,
      recipient_count,
      status
    } = req.body;

    // Mesajın varlığını ve kullanıcıya ait olduğunu kontrol et
    const checkQuery = 'SELECT id FROM messages WHERE id = ? AND user_id = ?';
    const [existingMessages] = await db.execute(checkQuery, [messageId, userId]);

    if (existingMessages.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mesaj bulunamadı'
      });
    }

    // Güncelleme sorgusu
    const updateQuery = `
      UPDATE messages SET
        list_name = COALESCE(?, list_name),
        title = COALESCE(?, title),
        content = COALESCE(?, content),
        send_date = COALESCE(?, send_date),
        send_time = COALESCE(?, send_time),
        recipient_count = COALESCE(?, recipient_count),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `;

    await db.execute(updateQuery, [
      list_name,
      title,
      content,
      send_date,
      send_time,
      recipient_count,
      status,
      messageId,
      userId
    ]);

    res.json({
      success: true,
      message: 'Mesaj başarıyla güncellendi'
    });

  } catch (error) {
    console.error('Mesajı güncellerken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Mesajı güncellerken bir hata oluştu',
      error: error.message
    });
  }
};

// Mesajı sil
exports.deleteMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.id;

    // Mesajın varlığını ve kullanıcıya ait olduğunu kontrol et
    const checkQuery = 'SELECT id FROM messages WHERE id = ? AND user_id = ?';
    const [existingMessages] = await db.execute(checkQuery, [messageId, userId]);

    if (existingMessages.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mesaj bulunamadı'
      });
    }

    // Mesajı sil
    const deleteQuery = 'DELETE FROM messages WHERE id = ? AND user_id = ?';
    await db.execute(deleteQuery, [messageId, userId]);

    res.json({
      success: true,
      message: 'Mesaj başarıyla silindi'
    });

  } catch (error) {
    console.error('Mesajı silerken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Mesajı silerken bir hata oluştu',
      error: error.message
    });
  }
};

// Çoklu mesaj silme
exports.deleteMultipleMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageIds } = req.body;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Silinecek mesaj ID\'leri gereklidir'
      });
    }

    // Placeholders oluştur
    const placeholders = messageIds.map(() => '?').join(',');
    const query = `DELETE FROM messages WHERE id IN (${placeholders}) AND user_id = ?`;
    
    const [result] = await db.execute(query, [...messageIds, userId]);

    res.json({
      success: true,
      message: `${result.affectedRows} mesaj başarıyla silindi`
    });

  } catch (error) {
    console.error('Çoklu mesaj silerken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Mesajları silerken bir hata oluştu',
      error: error.message
    });
  }
};

// Mesaj istatistikleri
exports.getMessageStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT 
        COUNT(*) as total_messages,
        SUM(CASE WHEN status = 'Gönderildi' THEN 1 ELSE 0 END) as sent_messages,
        SUM(CASE WHEN status = 'Beklemede' THEN 1 ELSE 0 END) as pending_messages,
        SUM(CASE WHEN status = 'Zamanlandı' THEN 1 ELSE 0 END) as scheduled_messages,
        SUM(recipient_count) as total_recipients,
        SUM(delivered_count) as total_delivered,
        SUM(read_count) as total_read
      FROM messages 
      WHERE user_id = ?
    `;

    const [stats] = await db.execute(query, [userId]);

    res.json({
      success: true,
      data: stats[0]
    });

  } catch (error) {
    console.error('Mesaj istatistiklerini getirirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'İstatistikleri getirirken bir hata oluştu',
      error: error.message
    });
  }
};

// Chat odalarını getir (sadece mesajlaştığı kullanıcılar)
exports.getChatRooms = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT DISTINCT
        u.id,
        u.name,
        u.email,
        u.avatar,
        u.is_online,
        u.last_seen,
        (
          SELECT cm.message 
          FROM chat_messages cm 
          JOIN chat_rooms cr ON cm.room_id = cr.id
          WHERE ((cr.created_by = ? AND cr.participant_id = u.id) 
             OR (cr.created_by = u.id AND cr.participant_id = ?))
          ORDER BY cm.created_at DESC 
          LIMIT 1
        ) as last_message,
        (
          SELECT cm.created_at 
          FROM chat_messages cm 
          JOIN chat_rooms cr ON cm.room_id = cr.id
          WHERE ((cr.created_by = ? AND cr.participant_id = u.id) 
             OR (cr.created_by = u.id AND cr.participant_id = ?))
          ORDER BY cm.created_at DESC 
          LIMIT 1
        ) as last_message_time,
        COALESCE(cs.is_pinned, FALSE) as is_pinned,
        COALESCE(cs.is_muted, FALSE) as is_muted,
        COALESCE(cs.is_deleted, FALSE) as is_deleted,
        (
          SELECT COUNT(*) 
          FROM chat_messages cm 
          JOIN chat_rooms cr ON cm.room_id = cr.id
          WHERE ((cr.created_by = ? AND cr.participant_id = u.id) 
             OR (cr.created_by = u.id AND cr.participant_id = ?))
            AND cm.sender_id = u.id 
            AND cm.id NOT IN (
              SELECT message_id FROM message_read_status WHERE user_id = ?
            )
        ) as unread_count,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM chat_messages cm 
            JOIN chat_rooms cr ON cm.room_id = cr.id
            WHERE ((cr.created_by = ? AND cr.participant_id = u.id) 
               OR (cr.created_by = u.id AND cr.participant_id = ?))
          ) THEN 1
          ELSE 0
        END as has_messages
      FROM users u
      LEFT JOIN chat_settings cs ON cs.user_id = ? AND cs.contact_user_id = u.id
      WHERE u.id != ? 
        AND COALESCE(cs.is_deleted, FALSE) = FALSE
      ORDER BY 
        has_messages DESC,
        COALESCE(cs.is_pinned, FALSE) DESC,
        last_message_time DESC, 
        u.name ASC
    `;

    const [users] = await db.execute(query, [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId]);

    console.log('getChatRooms sonucu:', { userId, userCount: users.length, users: users.map(u => ({ id: u.id, name: u.name })) });

    res.json({
      success: true,
      data: users
    });

  } catch (error) {
    console.error('Chat odalarını getirirken hata:', error);
    // Hata durumunda boş liste döndür
    res.json({
      success: true,
      data: []
    });
  }
};

// Chat mesajlarını getir
exports.getChatMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const markAsRead = req.query.markAsRead === 'true';
    const offset = (page - 1) * limit;

    // roomId'yi integer'a çevir (diğer kullanıcının ID'si)
    const otherUserId = parseInt(roomId);

    console.log('getChatMessages parametreleri:', { userId, otherUserId, page, limit, offset, markAsRead });

    // Kullanıcının kendi kendine mesaj görmesi engellenir
    if (userId === otherUserId) {
      console.log('Kullanıcı kendi kendine mesaj görmeye çalışıyor, boş liste döndürülüyor');
      return res.json({
        success: true,
        data: []
      });
    }

    // İki kullanıcı arasındaki chat room'u bul
    const roomQuery = `
      SELECT id FROM chat_rooms 
      WHERE ((created_by = ? AND participant_id = ?)
         OR (created_by = ? AND participant_id = ?))
      LIMIT 1
    `;
    const [rooms] = await db.query(roomQuery, [userId, otherUserId, otherUserId, userId]);
    
    if (rooms.length === 0) {
      console.log('Chat room bulunamadı, boş mesaj listesi döndürülüyor');
      return res.json({
        success: true,
        data: []
      });
    }

    const actualRoomId = rooms[0].id;
    console.log('Chat room bulundu:', actualRoomId);

    // Room'daki mesajları getir
    const query = `
      SELECT 
        cm.id,
        cm.message,
        cm.message_type,
        cm.file_url,
        cm.file_name,
        cm.file_size,
        cm.sender_id,
        cm.created_at,
        u.name as sender_name,
        u.avatar as sender_avatar
      FROM chat_messages cm
      JOIN users u ON cm.sender_id = u.id
      WHERE cm.room_id = ?
      ORDER BY cm.created_at ASC
      LIMIT ? OFFSET ?
    `;

    const [messages] = await db.query(query, [actualRoomId, limit, offset]);

    console.log('Bulunan mesaj sayısı:', messages.length);

    // Eğer markAsRead true ise ve mesajlar varsa, diğer kullanıcıdan gelen mesajları okundu olarak işaretle
    if (messages.length > 0 && markAsRead) {
      try {
        const otherUserMessages = messages.filter(msg => msg.sender_id === otherUserId);
        if (otherUserMessages.length > 0) {
          const messageIds = otherUserMessages.map(msg => msg.id);
          const markReadQuery = `
            INSERT IGNORE INTO message_read_status (message_id, user_id)
            VALUES ${messageIds.map(() => '(?, ?)').join(', ')}
          `;
          const markReadParams = messageIds.flatMap(id => [id, userId]);
          await db.query(markReadQuery, markReadParams);
          console.log('Okundu olarak işaretlenen mesaj sayısı:', messageIds.length);
        }
      } catch (readError) {
        console.log('Mesaj okundu işaretleme hatası (göz ardı edildi):', readError.message);
      }
    }

    res.json({
      success: true,
      data: messages || []
    });

  } catch (error) {
    console.error('Chat mesajlarını getirirken hata:', error);
    // Eğer hata alırsak boş array döndür
    res.json({
      success: true,
      data: []
    });
  }
};

// Mesaj gönder
exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { message } = req.body;

    console.log('sendMessage parametreleri:', { userId, roomId, body: req.body, message });

    if (!message || typeof message !== 'string' || !message.trim()) {
      console.log('Mesaj validasyon hatası:', { message, type: typeof message });
      return res.status(400).json({
        success: false,
        message: 'Mesaj içeriği gereklidir'
      });
    }

    // roomId'yi integer'a çevir (diğer kullanıcının ID'si)
    const otherUserId = parseInt(roomId);

    // Alıcının var olduğunu kontrol et
    const [receiverCheck] = await db.query('SELECT id, name FROM users WHERE id = ?', [otherUserId]);
    if (receiverCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alıcı kullanıcı bulunamadı'
      });
    }

    // İki kullanıcı arasındaki chat room'u bul veya oluştur
    let roomQuery = `
      SELECT id FROM chat_rooms 
      WHERE ((created_by = ? AND participant_id = ?)
         OR (created_by = ? AND participant_id = ?))
      LIMIT 1
    `;
    let [rooms] = await db.query(roomQuery, [userId, otherUserId, otherUserId, userId]);
    
    let actualRoomId;
    if (rooms.length === 0) {
      // Chat room yoksa oluştur
      const createRoomQuery = `
        INSERT INTO chat_rooms (name, created_by, participant_id, is_group)
        VALUES (?, ?, ?, FALSE)
      `;
      const roomName = `Chat ${userId}-${otherUserId}`;
      const [createResult] = await db.query(createRoomQuery, [roomName, userId, otherUserId]);
      actualRoomId = createResult.insertId;
      console.log('Yeni chat room oluşturuldu:', actualRoomId);
    } else {
      actualRoomId = rooms[0].id;
      console.log('Mevcut chat room kullanılıyor:', actualRoomId);
    }

    // Chat ayarlarını kontrol et/oluştur
    // Gönderen için
    const [senderSettings] = await db.execute(
      'SELECT * FROM chat_settings WHERE user_id = ? AND contact_user_id = ?',
      [userId, otherUserId]
    );

    if (senderSettings.length === 0) {
      await db.execute(
        'INSERT INTO chat_settings (user_id, contact_user_id, is_pinned, is_muted, is_deleted) VALUES (?, ?, ?, ?, ?)',
        [userId, otherUserId, false, false, false]
      );
    } else if (senderSettings[0].is_deleted) {
      // Eğer silinmişse, silme durumunu kaldır
      await db.execute(
        'UPDATE chat_settings SET is_deleted = FALSE, deleted_at = NULL WHERE user_id = ? AND contact_user_id = ?',
        [userId, otherUserId]
      );
    }

    // Alıcı için
    const [receiverSettings] = await db.execute(
      'SELECT * FROM chat_settings WHERE user_id = ? AND contact_user_id = ?',
      [otherUserId, userId]
    );

    if (receiverSettings.length === 0) {
      await db.execute(
        'INSERT INTO chat_settings (user_id, contact_user_id, is_pinned, is_muted, is_deleted) VALUES (?, ?, ?, ?, ?)',
        [otherUserId, userId, false, false, false]
      );
    } else if (receiverSettings[0].is_deleted) {
      // Eğer silinmişse, silme durumunu kaldır
      await db.execute(
        'UPDATE chat_settings SET is_deleted = FALSE, deleted_at = NULL WHERE user_id = ? AND contact_user_id = ?',
        [otherUserId, userId]
      );
    }

    // Mesajı veritabanına kaydet
    const insertQuery = `
      INSERT INTO chat_messages (room_id, sender_id, message, created_at)
      VALUES (?, ?, ?, NOW())
    `;

    const [result] = await db.query(insertQuery, [actualRoomId, userId, message.trim()]);

    // Kaydedilen mesajı getir
    const selectQuery = `
      SELECT 
        cm.id,
        cm.message,
        cm.sender_id,
        cm.room_id,
        cm.created_at,
        u.name as sender_name,
        u.avatar as sender_avatar
      FROM chat_messages cm
      JOIN users u ON cm.sender_id = u.id
      WHERE cm.id = ?
    `;

    const [messageData] = await db.query(selectQuery, [result.insertId]);

    if (messageData.length === 0) {
      throw new Error('Mesaj kaydedildi ancak geri alınamadı');
    }

    const savedMessage = messageData[0];

    // Socket.IO ile mesajı yayınla
    const io = req.app.get('io');
    if (io) {
      console.log('Socket.IO ile mesaj gönderiliyor:', {
        senderRoom: `user-${userId}`,
        receiverRoom: `user-${otherUserId}`,
        message: savedMessage
      });
      
      // Gönderene ve alıcıya mesajı gönder
      io.to(`user-${userId}`).emit('new-message', savedMessage);
      io.to(`user-${otherUserId}`).emit('new-message', savedMessage);
      
      // Chat listesi güncellemesi için event gönder
      io.to(`user-${userId}`).emit('chat-list-update', { lastMessage: savedMessage });
      io.to(`user-${otherUserId}`).emit('chat-list-update', { lastMessage: savedMessage });
    }

    res.status(201).json({
      success: true,
      data: savedMessage
    });

  } catch (error) {
    console.error('Mesaj gönderirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Mesaj gönderilemedi',
      error: error.message
    });
  }
};

// Dosya yükle ve mesaj gönder
exports.sendFileMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { message } = req.body;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Dosya seçilmedi'
      });
    }

    const receiverId = parseInt(roomId);
    const file = req.file;

    // Alıcının var olduğunu kontrol et
    const [receiverCheck] = await db.query('SELECT id, name FROM users WHERE id = ?', [receiverId]);
    if (receiverCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alıcı kullanıcı bulunamadı'
      });
    }

    // Chat ayarlarını kontrol et/oluştur (sendMessage'daki gibi)
    // Gönderen için
    const [senderSettings] = await db.execute(
      'SELECT * FROM chat_settings WHERE user_id = ? AND contact_user_id = ?',
      [userId, receiverId]
    );

    if (senderSettings.length === 0) {
      await db.execute(
        'INSERT INTO chat_settings (user_id, contact_user_id, is_pinned, is_muted, is_deleted) VALUES (?, ?, ?, ?, ?)',
        [userId, receiverId, false, false, false]
      );
    } else if (senderSettings[0].is_deleted) {
      await db.execute(
        'UPDATE chat_settings SET is_deleted = FALSE, deleted_at = NULL WHERE user_id = ? AND contact_user_id = ?',
        [userId, receiverId]
      );
    }

    // Alıcı için
    const [receiverSettings] = await db.execute(
      'SELECT * FROM chat_settings WHERE user_id = ? AND contact_user_id = ?',
      [receiverId, userId]
    );

    if (receiverSettings.length === 0) {
      await db.execute(
        'INSERT INTO chat_settings (user_id, contact_user_id, is_pinned, is_muted, is_deleted) VALUES (?, ?, ?, ?, ?)',
        [receiverId, userId, false, false, false]
      );
    } else if (receiverSettings[0].is_deleted) {
      await db.execute(
        'UPDATE chat_settings SET is_deleted = FALSE, deleted_at = NULL WHERE user_id = ? AND contact_user_id = ?',
        [receiverId, userId]
      );
    }

    // Dosya türünü belirle
    let messageType = 'file';
    if (file.mimetype.startsWith('image/')) {
      messageType = 'image';
    }

    // Dosya URL'sini oluştur
    const fileUrl = `/uploads/chat/${file.filename}`;

    // İki kullanıcı arasındaki chat room'u bul veya oluştur
    let roomQuery = `
      SELECT id FROM chat_rooms 
      WHERE ((created_by = ? AND participant_id = ?)
         OR (created_by = ? AND participant_id = ?))
      LIMIT 1
    `;
    let [rooms] = await db.query(roomQuery, [userId, receiverId, receiverId, userId]);
    
    let actualRoomId;
    if (rooms.length === 0) {
      // Chat room yoksa oluştur
      const createRoomQuery = `
        INSERT INTO chat_rooms (name, created_by, participant_id, is_group)
        VALUES (?, ?, ?, FALSE)
      `;
      const roomName = `Chat ${userId}-${receiverId}`;
      const [createResult] = await db.query(createRoomQuery, [roomName, userId, receiverId]);
      actualRoomId = createResult.insertId;
      console.log('Yeni chat room oluşturuldu:', actualRoomId);
    } else {
      actualRoomId = rooms[0].id;
      console.log('Mevcut chat room kullanılıyor:', actualRoomId);
    }

    // Mesajı veritabanına kaydet
    const insertQuery = `
      INSERT INTO chat_messages (room_id, sender_id, message_type, message, file_url, file_name, file_size, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const [result] = await db.query(insertQuery, [
      actualRoomId,
      userId, 
      messageType,
      message || file.originalname, // Mesaj yoksa dosya adını kullan
      fileUrl,
      file.originalname,
      file.size
    ]);

    // Kaydedilen mesajı getir
    const selectQuery = `
      SELECT 
        cm.id,
        cm.message,
        cm.message_type,
        cm.file_url,
        cm.file_name,
        cm.file_size,
        cm.sender_id,
        cm.room_id,
        cm.created_at,
        u.name as sender_name,
        u.avatar as sender_avatar
      FROM chat_messages cm
      JOIN users u ON cm.sender_id = u.id
      WHERE cm.id = ?
    `;

    const [messageData] = await db.query(selectQuery, [result.insertId]);

    if (messageData.length === 0) {
      throw new Error('Mesaj kaydedildi ancak geri alınamadı');
    }

    const savedMessage = messageData[0];

    // Socket.IO ile mesajı yayınla
    const io = req.app.get('io');
    if (io) {
      console.log('Socket.IO ile dosya mesajı gönderiliyor:', {
        senderRoom: `user-${userId}`,
        receiverRoom: `user-${receiverId}`,
        message: savedMessage
      });
      
      // Gönderene ve alıcıya mesajı gönder
      io.to(`user-${userId}`).emit('new-message', savedMessage);
      io.to(`user-${receiverId}`).emit('new-message', savedMessage);
      
      // Chat listesi güncellemesi için event gönder
      io.to(`user-${userId}`).emit('chat-list-update', { lastMessage: savedMessage });
      io.to(`user-${receiverId}`).emit('chat-list-update', { lastMessage: savedMessage });
    }

    res.status(201).json({
      success: true,
      data: savedMessage
    });

  } catch (error) {
    console.error('Dosya mesajı gönderirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Dosya gönderilemedi',
      error: error.message
    });
  }
};

// Tüm kullanıcıları getir
exports.getAllUsers = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT 
        id,
        name,
        email,
        avatar,
        is_online,
        last_seen,
        created_at
      FROM users 
      WHERE id != ?
      ORDER BY name ASC
    `;

    const [users] = await db.query(query, [userId]);

    res.json({
      success: true,
      data: users
    });

  } catch (error) {
    console.error('Kullanıcıları getirirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcılar getirilemedi',
      error: error.message
    });
  }
};

// Yeni chat başlat
exports.startNewChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userId: targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Hedef kullanıcı ID gereklidir'
      });
    }

    // Hedef kullanıcının var olduğunu kontrol et
    const userQuery = 'SELECT id, name, email, avatar, is_online FROM users WHERE id = ?';
    const [targetUser] = await db.query(userQuery, [targetUserId]);

    if (targetUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Chat ayarlarını kontrol et/oluştur
    const [existingSettings] = await db.execute(
      'SELECT * FROM chat_settings WHERE user_id = ? AND contact_user_id = ?',
      [userId, targetUserId]
    );

    if (existingSettings.length === 0) {
      // Yeni chat ayarı oluştur
      await db.execute(
        'INSERT INTO chat_settings (user_id, contact_user_id, is_pinned, is_muted, is_deleted) VALUES (?, ?, ?, ?, ?)',
        [userId, targetUserId, false, false, false]
      );
    } else {
      // Eğer silinmişse, silme durumunu kaldır
      if (existingSettings[0].is_deleted) {
        await db.execute(
          'UPDATE chat_settings SET is_deleted = FALSE, deleted_at = NULL WHERE user_id = ? AND contact_user_id = ?',
          [userId, targetUserId]
        );
      }
    }

    res.json({
      success: true,
      data: {
        ...targetUser[0],
        last_message: null,
        last_message_time: null,
        is_pinned: false,
        is_muted: false,
        is_deleted: false,
        has_messages: 0
      }
    });

  } catch (error) {
    console.error('Yeni chat başlatırken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Chat başlatılamadı',
      error: error.message
    });
  }
};

// Chat ayarlarını güncelle (sustur/susturmayı kaldır)
exports.toggleMuteChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactUserId } = req.params;

    // Mevcut ayarları kontrol et
    const [existingSettings] = await db.execute(
      'SELECT * FROM chat_settings WHERE user_id = ? AND contact_user_id = ?',
      [userId, contactUserId]
    );

    if (existingSettings.length > 0) {
      // Mevcut ayar varsa güncelle
      const newMuteStatus = !existingSettings[0].is_muted;
      await db.execute(
        'UPDATE chat_settings SET is_muted = ?, muted_at = ? WHERE user_id = ? AND contact_user_id = ?',
        [newMuteStatus, newMuteStatus ? new Date() : null, userId, contactUserId]
      );
    } else {
      // Yeni ayar oluştur
      await db.execute(
        'INSERT INTO chat_settings (user_id, contact_user_id, is_muted, muted_at) VALUES (?, ?, ?, ?)',
        [userId, contactUserId, true, new Date()]
      );
    }

    res.json({
      success: true,
      message: 'Chat susturma ayarı güncellendi'
    });

  } catch (error) {
    console.error('Chat susturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Chat susturma ayarı güncellenirken bir hata oluştu',
      error: error.message
    });
  }
};

// Chat ayarlarını güncelle (sabitle/sabitlemeyi kaldır)
exports.togglePinChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactUserId } = req.params;

    // Mevcut ayarları kontrol et
    const [existingSettings] = await db.execute(
      'SELECT * FROM chat_settings WHERE user_id = ? AND contact_user_id = ?',
      [userId, contactUserId]
    );

    if (existingSettings.length > 0) {
      // Mevcut ayar varsa güncelle
      const newPinStatus = !existingSettings[0].is_pinned;
      await db.execute(
        'UPDATE chat_settings SET is_pinned = ?, pinned_at = ? WHERE user_id = ? AND contact_user_id = ?',
        [newPinStatus, newPinStatus ? new Date() : null, userId, contactUserId]
      );
    } else {
      // Yeni ayar oluştur
      await db.execute(
        'INSERT INTO chat_settings (user_id, contact_user_id, is_pinned, pinned_at) VALUES (?, ?, ?, ?)',
        [userId, contactUserId, true, new Date()]
      );
    }

    res.json({
      success: true,
      message: 'Chat sabitleme ayarı güncellendi'
    });

  } catch (error) {
    console.error('Chat sabitleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Chat sabitleme ayarı güncellenirken bir hata oluştu',
      error: error.message
    });
  }
};

// Chat'i sil (gizle)
exports.deleteChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactUserId } = req.params;

    // Mevcut ayarları kontrol et
    const [existingSettings] = await db.execute(
      'SELECT * FROM chat_settings WHERE user_id = ? AND contact_user_id = ?',
      [userId, contactUserId]
    );

    if (existingSettings.length > 0) {
      // Mevcut ayar varsa güncelle
      await db.execute(
        'UPDATE chat_settings SET is_deleted = ?, deleted_at = ? WHERE user_id = ? AND contact_user_id = ?',
        [true, new Date(), userId, contactUserId]
      );
    } else {
      // Yeni ayar oluştur
      await db.execute(
        'INSERT INTO chat_settings (user_id, contact_user_id, is_deleted, deleted_at) VALUES (?, ?, ?, ?)',
        [userId, contactUserId, true, new Date()]
      );
    }

    res.json({
      success: true,
      message: 'Chat silindi'
    });

  } catch (error) {
    console.error('Chat silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Chat silinirken bir hata oluştu',
      error: error.message
    });
  }
};

// Chat ayarlarını getir
exports.getChatSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactUserId } = req.params;

    const [settings] = await db.execute(
      'SELECT * FROM chat_settings WHERE user_id = ? AND contact_user_id = ?',
      [userId, contactUserId]
    );

    const defaultSettings = {
      is_pinned: false,
      is_muted: false,
      is_deleted: false
    };

    res.json({
      success: true,
      data: settings.length > 0 ? settings[0] : defaultSettings
    });

  } catch (error) {
    console.error('Chat ayarlarını getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Chat ayarları getirilirken bir hata oluştu',
      error: error.message
    });
  }
};

// Chat mesajlarını kalıcı olarak sil
exports.deleteChatMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactUserId } = req.params;

    // İki kullanıcı arasındaki chat room'u bul
    const roomQuery = `
      SELECT id FROM chat_rooms 
      WHERE ((created_by = ? AND participant_id = ?)
         OR (created_by = ? AND participant_id = ?))
      LIMIT 1
    `;
    const [rooms] = await db.query(roomQuery, [userId, contactUserId, contactUserId, userId]);
    
    if (rooms.length === 0) {
      console.log('Chat room bulunamadı, silinecek mesaj yok');
      return res.json({
        success: true,
        message: 'Silinecek mesaj bulunamadı',
        deletedCount: 0
      });
    }

    const actualRoomId = rooms[0].id;

    // Bu room'daki tüm mesajları sil
    const deleteQuery = `
      DELETE FROM chat_messages 
      WHERE room_id = ?
    `;

    const [result] = await db.execute(deleteQuery, [actualRoomId]);

    // Chat ayarlarını da güncelle (gizli olarak işaretle)
    const [existingSettings] = await db.execute(
      'SELECT * FROM chat_settings WHERE user_id = ? AND contact_user_id = ?',
      [userId, contactUserId]
    );

    if (existingSettings.length > 0) {
      await db.execute(
        'UPDATE chat_settings SET is_deleted = ?, deleted_at = ? WHERE user_id = ? AND contact_user_id = ?',
        [true, new Date(), userId, contactUserId]
      );
    } else {
      await db.execute(
        'INSERT INTO chat_settings (user_id, contact_user_id, is_deleted, deleted_at) VALUES (?, ?, ?, ?)',
        [userId, contactUserId, true, new Date()]
      );
    }

    res.json({
      success: true,
      message: 'Tüm mesajlar kalıcı olarak silindi',
      deletedCount: result.affectedRows
    });

  } catch (error) {
    console.error('Chat mesajlarını silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mesajlar silinirken bir hata oluştu',
      error: error.message
    });
  }
};

// Mesajları okundu olarak işaretle
exports.markMessagesAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const otherUserId = parseInt(req.params.roomId);

    console.log('markMessagesAsRead çağrıldı:', { userId, otherUserId });

    // Kullanıcının kendi kendine mesaj okuması engellenir
    if (userId === otherUserId) {
      console.log('Kullanıcı kendi kendine mesaj okumaya çalışıyor, engellendi');
      return res.json({
        success: true,
        message: 'Kendi mesajlarınızı okumanıza gerek yok',
        markedCount: 0
      });
    }

    // Diğer kullanıcının var olup olmadığını kontrol et
    const userCheckQuery = `SELECT id FROM users WHERE id = ?`;
    const [userCheck] = await db.query(userCheckQuery, [otherUserId]);
    
    if (userCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // İki kullanıcı arasındaki chat room'u bul
    const roomQuery = `
      SELECT id FROM chat_rooms 
      WHERE ((created_by = ? AND participant_id = ?)
         OR (created_by = ? AND participant_id = ?))
      LIMIT 1
    `;
    const [rooms] = await db.query(roomQuery, [userId, otherUserId, otherUserId, userId]);
    
    if (rooms.length === 0) {
      console.log('Chat room bulunamadı');
      return res.json({
        success: true,
        message: 'Henüz mesaj yok',
        markedCount: 0
      });
    }

    const roomId = rooms[0].id;
    console.log('Chat room bulundu:', roomId);

    // Bu room'daki diğer kullanıcıdan gelen okunmamış mesajları bul
    const messagesQuery = `
      SELECT cm.id
      FROM chat_messages cm
      WHERE cm.room_id = ?
         AND cm.sender_id = ?
         AND cm.id NOT IN (
           SELECT message_id FROM message_read_status WHERE user_id = ?
         )
    `;

    const [messages] = await db.query(messagesQuery, [roomId, otherUserId, userId]);
    console.log('Okunmamış mesaj sayısı:', messages.length);

    if (messages.length > 0) {
      // Mesajları okundu olarak işaretle
      const messageIds = messages.map(msg => msg.id);
      const markReadQuery = `
        INSERT IGNORE INTO message_read_status (message_id, user_id)
        VALUES ${messageIds.map(() => '(?, ?)').join(', ')}
      `;
      const markReadParams = messageIds.flatMap(id => [id, userId]);
      await db.query(markReadQuery, markReadParams);
      console.log('Mesajlar okundu olarak işaretlendi:', messageIds);
    }

    res.json({
      success: true,
      message: 'Mesajlar okundu olarak işaretlendi',
      markedCount: messages.length
    });

  } catch (error) {
    console.error('Mesajları okundu işaretleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mesajları okundu işaretlerken bir hata oluştu',
      error: error.message
    });
  }
};