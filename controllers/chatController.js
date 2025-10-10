const { promisePool: db } = require('../config/database');

/**
 * Temiz Chat Controller
 * - Sadece direkt mesajlaşma (iki kullanıcı arasında)
 * - Basit ve anlaşılır API
 * - Tek sorumluluk prensibi
 */

// Konuşma listesini getir (mesajlaştığı kullanıcılar)
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT DISTINCT
        CASE 
          WHEN dm.sender_id = ? THEN dm.receiver_id 
          ELSE dm.sender_id 
        END as contact_id,
        u.name as contact_name,
        u.email as contact_email,
        u.avatar as contact_avatar,
        u.department,
        u.is_online,
        u.last_seen,
        
        -- Son mesaj
        (SELECT message 
         FROM direct_messages 
         WHERE (sender_id = ? AND receiver_id = contact_id) 
            OR (sender_id = contact_id AND receiver_id = ?)
         ORDER BY created_at DESC 
         LIMIT 1) as last_message,
         
        -- Son mesaj zamanı
        (SELECT created_at 
         FROM direct_messages 
         WHERE (sender_id = ? AND receiver_id = contact_id) 
            OR (sender_id = contact_id AND receiver_id = ?)
         ORDER BY created_at DESC 
         LIMIT 1) as last_message_time,
         
        -- Okunmamış mesaj sayısı (sadece karşı taraftan gelenler)
        (SELECT COUNT(*) 
         FROM direct_messages dm2 
         WHERE dm2.sender_id = contact_id 
           AND dm2.receiver_id = ?
           AND dm2.id NOT IN (
             SELECT message_id FROM message_reads WHERE user_id = ?
           )) as unread_count,
           
        -- Sabitlenmiş mesaj var mı kontrol et
        (SELECT COUNT(*) 
         FROM direct_messages dm3 
         WHERE ((dm3.sender_id = ? AND dm3.receiver_id = contact_id) 
            OR (dm3.sender_id = contact_id AND dm3.receiver_id = ?))
           AND dm3.is_pinned = 1
           AND NOT EXISTS(
             SELECT 1 FROM message_deletes 
             WHERE message_id = dm3.id AND user_id = ?
           )) as has_pinned_message
           
      FROM direct_messages dm
      JOIN users u ON u.id = CASE 
        WHEN dm.sender_id = ? THEN dm.receiver_id 
        ELSE dm.sender_id 
      END
      WHERE dm.sender_id = ? OR dm.receiver_id = ?
      ORDER BY has_pinned_message DESC, last_message_time DESC
    `;

    const [conversations] = await db.query(query, [
      userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId
    ]);

    // Avatar URL'lerini tam path olarak düzenle
    const conversationsWithAvatars = conversations.map(conversation => ({
      ...conversation,
      contact_avatar: conversation.contact_avatar && !conversation.contact_avatar.startsWith('http')
        ? `${process.env.BACKEND_URL || 'http://localhost:5000'}/uploads/avatars/${conversation.contact_avatar}`
        : conversation.contact_avatar
    }));

    console.log(`Kullanıcı ${userId} için ${conversations.length} konuşma bulundu`);

    res.json({
      success: true,
      data: conversationsWithAvatars
    });

  } catch (error) {
    console.error('Konuşmaları getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Konuşmalar getirilemedi',
      error: error.message
    });
  }
};

// Belirli bir kullanıcıyla mesajları getir
exports.getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = parseInt(req.params.contactId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const markAsRead = req.query.markAsRead === 'true';
    const offset = (page - 1) * limit;

    // Kendi kendine mesaj engeli
    if (userId === contactId) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Kontak kullanıcısının varlığını kontrol et
    const [contactCheck] = await db.query('SELECT id, name FROM users WHERE id = ?', [contactId]);
    if (contactCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    console.log(`Mesajlar getiriliyor: ${userId} <-> ${contactId}, markAsRead: ${markAsRead}`);

    // message_deletes tablosunun varlığını kontrol et
    let messageDeletesExists = false;
    try {
      console.log('🔍 message_deletes tablosu kontrol ediliyor...');
      await db.query('SELECT 1 FROM message_deletes LIMIT 1');
      messageDeletesExists = true;
      console.log('✅ message_deletes tablosu mevcut');
    } catch (error) {
      console.log('❌ message_deletes tablosu kontrol hatası:', error.code, error.message);
      if (error.code !== 'ER_NO_SUCH_TABLE') {
        console.error('🚨 Beklenmeyen veritabanı hatası:', error);
        throw error;
      }
      console.log('⚠️ message_deletes tablosu yok, basit sorgu kullanılacak');
    }

    // İki kullanıcı arasındaki mesajları getir
    let query, queryParams;
    
    if (messageDeletesExists) {
      console.log('📝 message_deletes tablosu ile sorgu hazırlanıyor');
      query = `
        SELECT 
          dm.id,
          dm.message,
          dm.message_type,
          dm.file_url,
          dm.file_name,
          dm.file_size,
          dm.is_pinned,
          dm.sender_id,
          dm.receiver_id,
          dm.created_at,
          u.name as sender_name,
          u.avatar as sender_avatar,
          EXISTS(
            SELECT 1 FROM message_reads 
            WHERE message_id = dm.id AND user_id = ?
          ) as is_read_by_me
        FROM direct_messages dm
        JOIN users u ON u.id = dm.sender_id
        WHERE ((dm.sender_id = ? AND dm.receiver_id = ?)
           OR (dm.sender_id = ? AND dm.receiver_id = ?))
          AND NOT EXISTS(
            SELECT 1 FROM message_deletes 
            WHERE message_id = dm.id AND user_id = ?
          )
        ORDER BY dm.is_pinned DESC, dm.created_at ASC
        LIMIT ? OFFSET ?
      `;
      queryParams = [userId, userId, contactId, contactId, userId, userId, limit, offset];
      console.log('🔧 Query parametreleri:', queryParams);
    } else {
      console.log('📝 Basit sorgu hazırlanıyor (message_deletes yok)');
      query = `
        SELECT 
          dm.id,
          dm.message,
          dm.message_type,
          dm.file_url,
          dm.file_name,
          dm.file_size,
          COALESCE(dm.is_pinned, 0) as is_pinned,
          dm.sender_id,
          dm.receiver_id,
          dm.created_at,
          u.name as sender_name,
          u.avatar as sender_avatar,
          EXISTS(
            SELECT 1 FROM message_reads 
            WHERE message_id = dm.id AND user_id = ?
          ) as is_read_by_me
        FROM direct_messages dm
        JOIN users u ON u.id = dm.sender_id
        WHERE (dm.sender_id = ? AND dm.receiver_id = ?)
           OR (dm.sender_id = ? AND dm.receiver_id = ?)
        ORDER BY COALESCE(dm.is_pinned, 0) DESC, dm.created_at ASC
        LIMIT ? OFFSET ?
      `;
      queryParams = [userId, userId, contactId, contactId, userId, limit, offset];
      console.log('🔧 Query parametreleri:', queryParams);
    }

    console.log('🚀 SQL sorgusu çalıştırılıyor...');
    console.log('📋 Query:', query.substring(0, 200) + '...');
    
    const [messages] = await db.query(query, queryParams);
    
    console.log('✅ SQL sorgusu başarılı');

    console.log(`${messages.length} mesaj bulundu`);

          // Eğer markAsRead true ise, karşı taraftan gelen okunmamış mesajları işaretle
      if (markAsRead && messages.length > 0) {
        const unreadMessages = messages.filter(msg => 
          msg.sender_id === contactId && !msg.is_read_by_me
        );

        if (unreadMessages.length > 0) {
          const messageIds = unreadMessages.map(msg => msg.id);
          const placeholders = messageIds.map(() => '(?, ?)').join(', ');
          const params = messageIds.flatMap(id => [id, userId]);

          await db.query(
            `INSERT IGNORE INTO message_reads (message_id, user_id) VALUES ${placeholders}`,
            params
          );

          console.log(`${unreadMessages.length} mesaj okundu olarak işaretlendi`);
          
          // Socket.IO ile okundu durumu bildir
          const io = req.app.get('io');
          if (io) {
            console.log(`Socket.IO ile okundu durumu bildiriliyor: ${contactId} -> ${userId}`);
            
            // Mesajı gönderen kişiye okundu bilgisi gönder
            io.to(`user-${contactId}`).emit('messages-read', {
              readerId: userId,
              messageIds: messageIds
            });
            
            // Konuşma listesi güncellemesi
            io.to(`user-${userId}`).emit('chat-list-update');
            io.to(`user-${contactId}`).emit('chat-list-update');
          }
        }
      }

    // Avatar URL'lerini tam path olarak düzenle
    const messagesWithAvatars = messages.map(message => ({
      ...message,
      sender_avatar: message.sender_avatar && !message.sender_avatar.startsWith('http')
        ? `${process.env.BACKEND_URL || 'http://localhost:5000'}/uploads/avatars/${message.sender_avatar}`
        : message.sender_avatar
    }));

    res.json({
      success: true,
      data: messagesWithAvatars
    });

  } catch (error) {
    console.error('🚨 Mesajları getirme hatası:', error);
    console.error('🔍 Hata detayları:');
    console.error('   - Code:', error.code);
    console.error('   - Message:', error.message);
    console.error('   - SQL State:', error.sqlState);
    console.error('   - SQL:', error.sql?.substring(0, 500) + '...');
    
    res.status(500).json({
      success: false,
      message: 'Mesajlar getirilemedi',
      error: error.message,
      errorCode: error.code
    });
  }
};

// Mesaj gönder
exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = parseInt(req.params.contactId);
    const { message, messageType = 'text' } = req.body;

    // Validation
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Mesaj içeriği gereklidir'
      });
    }

    // Kendi kendine mesaj engeli
    if (userId === contactId) {
      return res.status(400).json({
        success: false,
        message: 'Kendinize mesaj gönderemezsiniz'
      });
    }

    // Kontak kullanıcısının varlığını kontrol et
    const [contactCheck] = await db.query('SELECT id, name FROM users WHERE id = ?', [contactId]);
    if (contactCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alıcı kullanıcı bulunamadı'
      });
    }

    console.log(`Mesaj gönderiliyor: ${userId} -> ${contactId}`);

    // Mesajı kaydet
    const insertQuery = `
      INSERT INTO direct_messages (sender_id, receiver_id, message, message_type, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `;

    const [result] = await db.query(insertQuery, [userId, contactId, message.trim(), messageType]);

    // Kaydedilen mesajı geri getir
    const selectQuery = `
      SELECT 
        dm.id,
        dm.message,
        dm.message_type,
        dm.file_url,
        dm.file_name,
        dm.file_size,
        dm.sender_id,
        dm.receiver_id,
        dm.created_at,
        u.name as sender_name,
        u.avatar as sender_avatar
      FROM direct_messages dm
      JOIN users u ON u.id = dm.sender_id
      WHERE dm.id = ?
    `;

    const [messageData] = await db.query(selectQuery, [result.insertId]);
    const savedMessage = messageData[0];

    // Socket.IO ile mesajı yayınla
    const io = req.app.get('io');
    if (io) {
      console.log(`Socket.IO ile mesaj gönderiliyor: ${userId} -> ${contactId}`);
      
      // Gönderene ve alıcıya mesajı gönder
      io.to(`user-${userId}`).emit('new-message', savedMessage);
      io.to(`user-${contactId}`).emit('new-message', savedMessage);
      
      // Konuşma listesi güncellemesi
      io.to(`user-${userId}`).emit('chat-list-update');
      io.to(`user-${contactId}`).emit('chat-list-update');
    }

    res.status(201).json({
      success: true,
      data: savedMessage
    });

  } catch (error) {
    console.error('Mesaj gönderme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mesaj gönderilemedi',
      error: error.message
    });
  }
};

// Mesajları okundu olarak işaretle
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = parseInt(req.params.contactId);

    // Kendi kendine mesaj engeli
    if (userId === contactId) {
      return res.json({
        success: true,
        message: 'Kendi mesajlarınızı okumanıza gerek yok',
        markedCount: 0
      });
    }

    console.log(`Mesajlar okundu işaretleniyor: ${contactId} -> ${userId}`);

    // Karşı taraftan gelen okunmamış mesajları bul
    const unreadQuery = `
      SELECT dm.id
      FROM direct_messages dm
      WHERE dm.sender_id = ? 
        AND dm.receiver_id = ?
        AND dm.id NOT IN (
          SELECT message_id FROM message_reads WHERE user_id = ?
        )
    `;

    const [unreadMessages] = await db.query(unreadQuery, [contactId, userId, userId]);

    if (unreadMessages.length > 0) {
      const messageIds = unreadMessages.map(msg => msg.id);
      const placeholders = messageIds.map(() => '(?, ?)').join(', ');
      const params = messageIds.flatMap(id => [id, userId]);

      await db.query(
        `INSERT IGNORE INTO message_reads (message_id, user_id) VALUES ${placeholders}`,
        params
      );

      console.log(`${messageIds.length} mesaj okundu olarak işaretlendi`);
    }

    // Socket.IO ile okundu durumu bildir
    const io = req.app.get('io');
    if (io && unreadMessages.length > 0) {
      console.log(`${unreadMessages.length} mesaj okundu olarak işaretlendi - Socket.IO ile bildiriliyor`);
      
      // Mesajı gönderen kişiye okundu bilgisi gönder
      io.to(`user-${contactId}`).emit('messages-read', {
        readerId: userId,
        messageIds: unreadMessages.map(msg => msg.id)
      });
      
      // Konuşma listesi güncellemesi
      io.to(`user-${userId}`).emit('chat-list-update');
      io.to(`user-${contactId}`).emit('chat-list-update');
    }

    res.json({
      success: true,
      message: 'Mesajlar okundu olarak işaretlendi',
      markedCount: unreadMessages.length
    });

  } catch (error) {
    console.error('Mesaj okundu işaretleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mesajlar okundu işaretlenemedi',
      error: error.message
    });
  }
};

// Tüm kullanıcıları getir (yeni chat başlatmak için)
exports.getAllUsers = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT 
        id,
        name,
        email,
        avatar,
        department,
        is_online,
        last_seen
      FROM users 
      WHERE id != ?
      ORDER BY is_online DESC, name ASC
    `;

    const [users] = await db.query(query, [userId]);

    console.log(`${users.length} kullanıcı listelendi (kendisi hariç)`);

    res.json({
      success: true,
      data: users
    });

  } catch (error) {
    console.error('Kullanıcıları getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcılar getirilemedi',
      error: error.message
    });
  }
};

// Kullanıcı online durumunu güncelle
exports.updateOnlineStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { isOnline } = req.body;

    const query = `
      UPDATE users 
      SET is_online = ?, last_seen = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;

    await db.query(query, [isOnline, userId]);

    // Socket.IO ile durumu bildir
    const io = req.app.get('io');
    if (io) {
      const eventName = isOnline ? 'user-online' : 'user-offline';
      io.emit(eventName, {
        userId: userId,
        last_seen: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: `Kullanıcı ${isOnline ? 'online' : 'offline'} yapıldı`
    });

  } catch (error) {
    console.error('Online durum güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Online durumu güncellenemedi',
      error: error.message
    });
  }
};

// Dosya mesajı gönder
exports.sendFileMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = parseInt(req.params.contactId);
    const { message } = req.body;
    const file = req.file;

    // Validation
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Dosya gereklidir'
      });
    }

    // Kendi kendine mesaj engeli
    if (userId === contactId) {
      return res.status(400).json({
        success: false,
        message: 'Kendinize dosya gönderemezsiniz'
      });
    }

    // Kontak kullanıcısının varlığını kontrol et
    const [contactCheck] = await db.query('SELECT id, name FROM users WHERE id = ?', [contactId]);
    if (contactCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alıcı kullanıcı bulunamadı'
      });
    }

    console.log(`Dosya mesajı gönderiliyor: ${userId} -> ${contactId}, File: ${file.filename}`);

    // Dosya URL'ini oluştur
    const fileUrl = `/uploads/chat/${file.filename}`;
    
    // Mesaj içeriği oluştur
    const messageContent = message || file.originalname;
    
    // Dosya tipini belirle
    let messageType = 'file';
    if (file.mimetype.startsWith('image/')) {
      messageType = 'image';
    }

    // Mesajı kaydet
    const insertQuery = `
      INSERT INTO direct_messages (sender_id, receiver_id, message, message_type, file_url, file_name, file_size, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const [result] = await db.query(insertQuery, [
      userId, 
      contactId, 
      messageContent, 
      messageType, 
      fileUrl, 
      file.originalname, 
      file.size
    ]);

    // Kaydedilen mesajı geri getir
    const selectQuery = `
      SELECT 
        dm.id,
        dm.message,
        dm.message_type,
        dm.file_url,
        dm.file_name,
        dm.file_size,
        dm.sender_id,
        dm.receiver_id,
        dm.created_at,
        u.name as sender_name,
        u.avatar as sender_avatar
      FROM direct_messages dm
      JOIN users u ON u.id = dm.sender_id
      WHERE dm.id = ?
    `;

    const [messageData] = await db.query(selectQuery, [result.insertId]);
    const savedMessage = messageData[0];

    // Socket.IO ile mesajı yayınla
    const io = req.app.get('io');
    if (io) {
      console.log(`Socket.IO ile dosya mesajı gönderiliyor: ${userId} -> ${contactId}`);
      
      // Gönderene ve alıcıya mesajı gönder
      io.to(`user-${userId}`).emit('new-message', savedMessage);
      io.to(`user-${contactId}`).emit('new-message', savedMessage);
      
      // Konuşma listesi güncellemesi
      io.to(`user-${userId}`).emit('chat-list-update');
      io.to(`user-${contactId}`).emit('chat-list-update');
    }

    res.status(201).json({
      success: true,
      data: savedMessage
    });

  } catch (error) {
    console.error('Dosya mesajı gönderme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Dosya mesajı gönderilemedi',
      error: error.message
    });
  }
};

// Mesajı sabitle/sabitlemeyi kaldır
exports.togglePinMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = parseInt(req.params.messageId);
    const { isPinned } = req.body;

    // Mesajın varlığını ve kullanıcının yetkisini kontrol et
    const [messageCheck] = await db.query(
      'SELECT sender_id, receiver_id FROM direct_messages WHERE id = ?', 
      [messageId]
    );
    
    if (messageCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mesaj bulunamadı'
      });
    }

    const message = messageCheck[0];
    if (message.sender_id !== userId && message.receiver_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bu mesajı sabitleme yetkiniz yok'
      });
    }

    // Mesajı sabitle/sabitlemeyi kaldır
    await db.query(
      'UPDATE direct_messages SET is_pinned = ? WHERE id = ?',
      [isPinned ? 1 : 0, messageId]
    );

    // Socket.IO ile güncellemeyi bildir
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${message.sender_id}`).emit('message-pin-updated', {
        messageId,
        isPinned
      });
      io.to(`user-${message.receiver_id}`).emit('message-pin-updated', {
        messageId,
        isPinned
      });
    }

    res.json({
      success: true,
      message: isPinned ? 'Mesaj sabitlendi' : 'Mesaj sabitleme kaldırıldı'
    });

  } catch (error) {
    console.error('Mesaj sabitleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mesaj sabitlenemedi',
      error: error.message
    });
  }
};

// Tüm mesajları sil (sadece silen kullanıcı için)
exports.deleteAllMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = parseInt(req.params.contactId);

    // message_deletes tablosu yoksa oluştur
    await db.query(`
      CREATE TABLE IF NOT EXISTS message_deletes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id INT NOT NULL,
        user_id INT NOT NULL,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_delete (message_id, user_id),
        FOREIGN KEY (message_id) REFERENCES direct_messages(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // İki kullanıcı arasındaki tüm mesajları bu kullanıcı için "silinmiş" olarak işaretle
    const insertQuery = `
      INSERT IGNORE INTO message_deletes (message_id, user_id)
      SELECT dm.id, ? as user_id
      FROM direct_messages dm
      WHERE (dm.sender_id = ? AND dm.receiver_id = ?)
         OR (dm.sender_id = ? AND dm.receiver_id = ?)
    `;

    const [result] = await db.query(insertQuery, [
      userId, userId, contactId, contactId, userId
    ]);

    // Socket.IO ile güncellemeyi bildir
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${userId}`).emit('chat-cleared', {
        contactId
      });
    }

    res.json({
      success: true,
      message: 'Tüm mesajlar silindi',
      deletedCount: result.affectedRows
    });

  } catch (error) {
    console.error('Mesajları silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mesajlar silinemedi',
      error: error.message
    });
  }
};