const { promisePool: db } = require('../config/database');

// Kullanıcının katıldığı chat odalarını getir
exports.getChatRooms = async (req, res) => {
  try {
    const userId = req.user.id;

    // Users tablosundaki diğer kullanıcıları getir (kendisi hariç)
    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.avatar,
        u.is_online,
        u.last_seen,
        u.created_at,
        (
          SELECT cm.message 
          FROM chat_messages cm 
          JOIN chat_rooms cr ON cm.room_id = cr.id 
          WHERE (cr.created_by = ? AND cr.participant_id = u.id) 
             OR (cr.created_by = u.id AND cr.participant_id = ?)
          ORDER BY cm.created_at DESC 
          LIMIT 1
        ) as last_message,
        (
          SELECT cm.created_at 
          FROM chat_messages cm 
          JOIN chat_rooms cr ON cm.room_id = cr.id 
          WHERE (cr.created_by = ? AND cr.participant_id = u.id) 
             OR (cr.created_by = u.id AND cr.participant_id = ?)
          ORDER BY cm.created_at DESC 
          LIMIT 1
        ) as last_message_time,
        (
          SELECT COUNT(*) 
          FROM chat_messages cm 
          JOIN chat_rooms cr ON cm.room_id = cr.id 
          WHERE (cr.created_by = ? AND cr.participant_id = u.id) 
             OR (cr.created_by = u.id AND cr.participant_id = ?)
             AND cm.sender_id != ?
             AND cm.id NOT IN (
               SELECT message_id FROM message_read_status WHERE user_id = ?
             )
        ) as unread_count
      FROM users u
      WHERE u.id != ?
      ORDER BY u.is_online DESC, last_message_time DESC, u.name ASC
    `;

    const [users] = await db.query(query, [
      userId, userId, userId, userId, userId, userId, userId, userId, userId
    ]);

    // Kullanıcıları chat odası formatında döndür
    const chatRooms = users.map(user => ({
      id: user.id,
      name: user.name,
      description: user.email,
      avatar: user.avatar,
      is_group: false,
      is_online: user.is_online,
      last_seen: user.last_seen,
      participant_count: 2,
      last_message: user.last_message,
      last_message_time: user.last_message_time,
      unread_count: user.unread_count || 0,
      created_at: user.created_at
    }));

    res.json({
      success: true,
      data: chatRooms
    });

  } catch (error) {
    console.error('Chat odalarını getirirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Chat odalarını getirirken bir hata oluştu',
      error: error.message
    });
  }
};

// Belirli bir chat odasının mesajlarını getir
exports.getChatMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const otherUserId = parseInt(req.params.roomId); // Artık bu diğer kullanıcının ID'si
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const markAsRead = req.query.markAsRead === 'true'; // Yeni parametre
    const offset = (page - 1) * limit;

    // Diğer kullanıcının var olup olmadığını kontrol et
    const userCheckQuery = `SELECT id FROM users WHERE id = ?`;
    const [userCheck] = await db.query(userCheckQuery, [otherUserId]);
    
    if (userCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    console.log('getChatMessages çağrıldı:', { userId, otherUserId, markAsRead });

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
        data: []
      });
    }

    const roomId = rooms[0].id;
    console.log('Chat room bulundu:', roomId);

    // Room'daki mesajları getir
    const query = `
      SELECT 
        cm.id,
        cm.message,
        cm.message_type,
        cm.file_url,
        cm.file_name,
        cm.file_size,
        cm.is_edited,
        cm.edited_at,
        cm.reply_to_id,
        cm.created_at,
        u.name as sender_name,
        u.email as sender_email,
        cm.sender_id,
        (SELECT COUNT(*) FROM message_read_status WHERE message_id = cm.id) as read_count
      FROM chat_messages cm
      JOIN users u ON cm.sender_id = u.id
      WHERE cm.room_id = ?
      ORDER BY cm.created_at ASC
      LIMIT ? OFFSET ?
    `;

    const [messages] = await db.query(query, [roomId, limit, offset]);
    console.log('Bulunan mesaj sayısı:', messages.length);

    // Sadece markAsRead true ise diğer kullanıcıdan gelen mesajları okundu olarak işaretle
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
      data: messages
    });

  } catch (error) {
    console.error('Chat mesajlarını getirirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Chat mesajlarını getirirken bir hata oluştu',
      error: error.message
    });
  }
};

// Yeni mesaj gönder
exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const receiverId = parseInt(req.params.roomId); // Artık bu receiver user ID'si
    
    console.log('Request body:', req.body);
    console.log('Message type:', typeof req.body.message);
    
    const { message, messageType = 'text', replyToId } = req.body;

    if (!message || (typeof message === 'string' && message.trim() === '')) {
      return res.status(400).json({
        success: false,
        message: 'Mesaj içeriği boş olamaz'
      });
    }

    const messageText = typeof message === 'string' ? message : message.message || '';

    if (!messageText.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Mesaj içeriği boş olamaz'
      });
    }

    // Alıcı kullanıcının var olup olmadığını kontrol et
    const userCheckQuery = `SELECT id, name FROM users WHERE id = ?`;
    const [userCheck] = await db.query(userCheckQuery, [receiverId]);
    
    if (userCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alıcı kullanıcı bulunamadı'
      });
    }

    // İki kullanıcı arasında chat odası var mı kontrol et
    let chatRoomId;
    const roomCheckQuery = `
      SELECT id FROM chat_rooms 
      WHERE (created_by = ? AND participant_id = ?) 
         OR (created_by = ? AND participant_id = ?)
      LIMIT 1
    `;
    const [roomCheck] = await db.query(roomCheckQuery, [userId, receiverId, receiverId, userId]);

    if (roomCheck.length > 0) {
      // Mevcut chat odası var
      chatRoomId = roomCheck[0].id;
    } else {
      // Yeni chat odası oluştur
      const createRoomQuery = `
        INSERT INTO chat_rooms (name, description, created_by, participant_id, is_group)
        VALUES (?, ?, ?, ?, FALSE)
      `;
      const roomName = `${req.user.name} - ${userCheck[0].name}`;
      const [roomResult] = await db.query(createRoomQuery, [
        roomName,
        'Private chat',
        userId,
        receiverId
      ]);
      chatRoomId = roomResult.insertId;
    }

    // Mesajı veritabanına kaydet
    const insertQuery = `
      INSERT INTO chat_messages (room_id, sender_id, message, message_type, reply_to_id)
      VALUES (?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(insertQuery, [
      chatRoomId,
      userId,
      messageText.trim(),
      messageType,
      replyToId || null
    ]);

    // Gönderilen mesajı kullanıcı bilgileriyle birlikte getir
    const messageQuery = `
      SELECT 
        cm.id,
        cm.message,
        cm.message_type,
        cm.reply_to_id,
        cm.created_at,
        u.name as sender_name,
        u.email as sender_email,
        cm.sender_id
      FROM chat_messages cm
      JOIN users u ON cm.sender_id = u.id
      WHERE cm.id = ?
    `;

    const [messageResult] = await db.query(messageQuery, [result.insertId]);
    const newMessage = messageResult[0];

    // Socket.IO ile real-time mesaj gönder
    const io = req.app.get('io');
    if (io) {
      console.log('Socket.IO mesaj gönderiliyor:', {
        senderId: userId,
        receiverId: receiverId,
        message: newMessage
      });
      
      // Hem gönderen hem alıcıya mesajı gönder
      io.to(`user-${userId}`).emit('new-message', newMessage);
      io.to(`user-${receiverId}`).emit('new-message', newMessage);
      
      // Chat listesi güncellemesi için event gönder
      io.to(`user-${userId}`).emit('chat-list-update', { roomId: chatRoomId, lastMessage: newMessage });
      io.to(`user-${receiverId}`).emit('chat-list-update', { roomId: chatRoomId, lastMessage: newMessage });
      
      console.log('Socket.IO mesaj gönderildi');
    } else {
      console.log('Socket.IO instance bulunamadı');
    }

    res.status(201).json({
      success: true,
      message: 'Mesaj başarıyla gönderildi',
      data: newMessage
    });

  } catch (error) {
    console.error('Mesaj gönderirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Mesaj gönderirken bir hata oluştu',
      error: error.message
    });
  }
};

// Chat odasına katıl
exports.joinRoom = async (req, res) => {
  try {
    const userId = req.user.id;
    const roomId = req.params.roomId;

    // Kullanıcının bu odaya erişimi var mı kontrol et
    const accessQuery = `
      SELECT id FROM chat_room_participants 
      WHERE room_id = ? AND user_id = ?
    `;
    const [accessResult] = await db.query(accessQuery, [roomId, userId]);

    if (accessResult.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu chat odasına erişim yetkiniz yok'
      });
    }

    // Kullanıcıyı online olarak işaretle
    const updateQuery = `
      UPDATE chat_room_participants 
      SET is_online = TRUE, last_seen = CURRENT_TIMESTAMP
      WHERE room_id = ? AND user_id = ?
    `;
    await db.query(updateQuery, [roomId, userId]);

    // Socket.IO ile odaya katıl
    const io = req.app.get('io');
    if (io) {
      // Kullanıcıyı odaya ekle
      io.to(`user-${userId}`).socketsJoin(`room-${roomId}`);
      
      // Diğer kullanıcılara bildir
      io.to(`room-${roomId}`).emit('user-joined', {
        userId: userId,
        userName: req.user.name,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Chat odasına başarıyla katıldınız'
    });

  } catch (error) {
    console.error('Chat odasına katılırken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Chat odasına katılırken bir hata oluştu',
      error: error.message
    });
  }
};

// Chat odasından ayrıl
exports.leaveRoom = async (req, res) => {
  try {
    const userId = req.user.id;
    const roomId = req.params.roomId;

    // Kullanıcıyı offline olarak işaretle
    const updateQuery = `
      UPDATE chat_room_participants 
      SET is_online = FALSE, last_seen = CURRENT_TIMESTAMP
      WHERE room_id = ? AND user_id = ?
    `;
    await db.query(updateQuery, [roomId, userId]);

    // Socket.IO ile odadan ayrıl
    const io = req.app.get('io');
    if (io) {
      // Kullanıcıyı odadan çıkar
      io.to(`user-${userId}`).socketsLeave(`room-${roomId}`);
      
      // Diğer kullanıcılara bildir
      io.to(`room-${roomId}`).emit('user-left', {
        userId: userId,
        userName: req.user.name,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Chat odasından başarıyla ayrıldınız'
    });

  } catch (error) {
    console.error('Chat odasından ayrılırken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Chat odasından ayrılırken bir hata oluştu',
      error: error.message
    });
  }
};

// Online kullanıcıları getir
exports.getOnlineUsers = async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const userId = req.user.id;

    // Kullanıcının bu odaya erişimi var mı kontrol et
    const accessQuery = `
      SELECT id FROM chat_room_participants 
      WHERE room_id = ? AND user_id = ?
    `;
    const [accessResult] = await db.query(accessQuery, [roomId, userId]);

    if (accessResult.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu chat odasına erişim yetkiniz yok'
      });
    }

    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        crp.is_online,
        crp.last_seen,
        crp.role
      FROM chat_room_participants crp
      JOIN users u ON crp.user_id = u.id
      WHERE crp.room_id = ?
      ORDER BY crp.is_online DESC, u.name ASC
    `;

    const [users] = await db.query(query, [roomId]);

    res.json({
      success: true,
      data: users
    });

  } catch (error) {
    console.error('Online kullanıcıları getirirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Online kullanıcıları getirirken bir hata oluştu',
      error: error.message
    });
  }
};

// Okunmamış mesaj sayılarını getir
exports.getUnreadCounts = async (req, res) => {
  try {
    const userId = req.user.id;

    // Kullanıcının chat yaptığı tüm kişileri ve onlardan gelen okunmamış mesaj sayısını getir
    const query = `
      SELECT 
        u.id as user_id,
        u.name,
        u.avatar,
        COUNT(CASE WHEN cm.sender_id = u.id AND mrs.message_id IS NULL THEN 1 END) as unread_count
      FROM users u
      INNER JOIN chat_rooms cr ON (cr.created_by = u.id AND cr.participant_id = ?) 
                               OR (cr.created_by = ? AND cr.participant_id = u.id)
      LEFT JOIN chat_messages cm ON cm.room_id = cr.id AND cm.sender_id = u.id
      LEFT JOIN message_read_status mrs ON cm.id = mrs.message_id AND mrs.user_id = ?
      WHERE u.id != ?
      GROUP BY u.id, u.name, u.avatar
      ORDER BY unread_count DESC, u.name ASC
    `;

    const [results] = await db.query(query, [userId, userId, userId, userId]);

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Okunmamış mesaj sayılarını getirirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Okunmamış mesaj sayılarını getirirken bir hata oluştu',
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