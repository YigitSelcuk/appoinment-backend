const db = require('../config/database');
const { logActivity } = require('../middleware/logger');
const { getIO } = require('../utils/socket');

// =====================================================
// CHAT ODALARI (ROOMS) İŞLEMLERİ
// =====================================================

// Kullanıcının chat odalarını getir
const getChatRooms = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT 
        cr.id as room_id,
        cr.name as room_name,
        cr.type as room_type,
        cr.avatar_url as room_avatar,
        cr.description,
        cr.created_at as room_created_at,
        
        -- Son mesaj bilgileri
        cm.id as last_message_id,
        cm.message_content as last_message,
        cm.message_type as last_message_type,
        cm.created_at as last_message_time,
        sender.name as last_sender_name,
        
        -- Okunmamış mesaj sayısı
        COALESCE(unread_count.count, 0) as unread_count,
        
        -- Direct chat için diğer kullanıcı bilgileri
        CASE 
          WHEN cr.type = 'direct' THEN other_user.name
          ELSE cr.name
        END as display_name,
        
        CASE 
          WHEN cr.type = 'direct' THEN other_user.avatar
          ELSE cr.avatar_url
        END as display_avatar,
        
        CASE 
          WHEN cr.type = 'direct' THEN other_user.is_online
          ELSE NULL
        END as is_online,
        
        -- Diğer kullanıcı detayları (direct chat için)
        other_user.id as other_user_id,
        other_user.name as other_user_name,
        other_user.avatar as other_user_avatar,
        other_user.is_online as other_user_is_online,
        other_user.last_seen as other_user_last_seen,
        other_user.department as other_user_department,
        
        -- Katılımcı ayarları
        cp.is_pinned,
        cp.is_muted,
        cp.is_archived,
        cp.custom_name,
        cp.last_seen_at
        
      FROM chat_participants cp
      JOIN chat_rooms cr ON cp.room_id = cr.id
      
      -- Son mesaj için LEFT JOIN
      LEFT JOIN chat_messages cm ON cm.id = (
        SELECT id FROM chat_messages 
        WHERE room_id = cr.id AND is_deleted = 0 
        ORDER BY created_at DESC LIMIT 1
      )
      LEFT JOIN users sender ON cm.sender_id = sender.id
      
      -- Okunmamış mesaj sayısı
      LEFT JOIN (
        SELECT 
          cm2.room_id,
          COUNT(*) as count
        FROM chat_messages cm2
        LEFT JOIN message_read_status mrs ON cm2.id = mrs.message_id AND mrs.user_id = ?
        WHERE cm2.sender_id != ? 
          AND cm2.is_deleted = 0
          AND (mrs.status IS NULL OR mrs.status != 'read')
        GROUP BY cm2.room_id
      ) unread_count ON unread_count.room_id = cr.id
      
      -- Direct chat için diğer kullanıcı bilgileri
      LEFT JOIN (
        SELECT 
          cp2.room_id,
          u.id,
          u.name,
          u.avatar,
          u.is_online,
          u.last_seen,
          u.department
        FROM chat_participants cp2
        JOIN users u ON cp2.user_id = u.id
        WHERE cp2.user_id != ? AND cp2.left_at IS NULL
      ) other_user ON other_user.room_id = cr.id AND cr.type = 'direct'
      
      WHERE cp.user_id = ? 
        AND cp.left_at IS NULL
        AND (cp.deleted_at IS NULL OR cp.reopened_at IS NOT NULL)
        AND cr.is_active = 1
      
      ORDER BY 
        cp.is_pinned DESC,
        COALESCE(cm.created_at, cr.created_at) DESC
    `;

    const rawRooms = await db.query(query, [userId, userId, userId, userId]);
    
    const rooms = rawRooms.map(room => {
      const result = {
        room_id: room.room_id,
        room_name: room.room_name,
        room_type: room.room_type,
        room_avatar: room.room_avatar,
        description: room.description,
        room_created_at: room.room_created_at,
        last_message_id: room.last_message_id,
        last_message: room.last_message,
        last_message_type: room.last_message_type,
        last_message_time: room.last_message_time,
        last_sender_name: room.last_sender_name,
        unread_count: room.unread_count,
        display_name: room.display_name,
        display_avatar: room.display_avatar,
        is_online: room.is_online,
        is_pinned: room.is_pinned,
        is_muted: room.is_muted,
        is_archived: room.is_archived,
        custom_name: room.custom_name,
        last_seen_at: room.last_seen_at
      };
      
      if (room.room_type === 'direct' && room.other_user_id) {
        result.participants = [
          {
            user_id: userId,
            user_name: req.user.name,
            avatar: req.user.avatar,
            is_online: req.user.is_online,
            last_seen: req.user.last_seen,
            department: req.user.department
          },
          {
            user_id: room.other_user_id,
            user_name: room.other_user_name,
            avatar: room.other_user_avatar,
            is_online: room.other_user_is_online,
            last_seen: room.other_user_last_seen,
            department: room.other_user_department
          }
        ];
      }
      
      return result;
    });

    res.json({
      success: true,
      data: rooms
    });

  } catch (error) {
    console.error('Chat odalarını getirirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Chat odaları getirilemedi',
      error: error.message
    });
  }
};

const createOrGetDirectChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otherUserId } = req.body;

    if (!otherUserId) {
      return res.status(400).json({
        success: false,
        message: 'Diğer kullanıcı ID gerekli'
      });
    }

    if (userId === otherUserId) {
      return res.status(400).json({
        success: false,
        message: 'Kendinizle chat oluşturamazsınız'
      });
    }

    const existingChatQuery = `
      SELECT cr.id as room_id
      FROM chat_rooms cr
      WHERE cr.type = 'direct'
        AND cr.is_active = 1
        AND cr.id IN (
          SELECT cp1.room_id
          FROM chat_participants cp1
          WHERE cp1.user_id = ? AND cp1.left_at IS NULL
        )
        AND cr.id IN (
          SELECT cp2.room_id
          FROM chat_participants cp2
          WHERE cp2.user_id = ? AND cp2.left_at IS NULL
        )
    `;

    const existingChat = await db.query(existingChatQuery, [userId, otherUserId]);
    console.log('Existing chat query result:', existingChat);
    console.log('Query parameters - userId:', userId, 'otherUserId:', otherUserId);

    if (existingChat.length > 0) {
      console.log('Mevcut chat bulundu, room_id:', existingChat[0].room_id);
      console.log('Full existing chat object:', existingChat[0]);
      return res.json({
        success: true,
        data: { room_id: existingChat[0].room_id },
        message: 'Mevcut chat bulundu'
      });
    }

    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      const [roomResult] = await connection.execute(
        'INSERT INTO chat_rooms (type, created_by) VALUES (?, ?)',
        ['direct', userId]
      );
      const roomId = roomResult.insertId;

      await connection.execute(
        'INSERT INTO chat_participants (room_id, user_id, role) VALUES (?, ?, ?), (?, ?, ?)',
        [roomId, userId, 'admin', roomId, otherUserId, 'member']
      );

      await connection.commit();
      connection.release();

      await logActivity(req, 'CREATE', 'chat_rooms', roomId, `Yeni direct chat oluşturuldu`);

      const io = getIO();
      if (io) {
        io.to(`user-${userId}`).emit('chat-list-update', { 
          type: 'new_chat', 
          room_id: roomId,
          participants: [userId, otherUserId]
        });
        io.to(`user-${otherUserId}`).emit('chat-list-update', { 
          type: 'new_chat', 
          room_id: roomId,
          participants: [userId, otherUserId]
        });
        console.log('Chat listesi güncelleme event\'i gönderildi:', roomId);
      }

      console.log('Yeni chat oluşturuldu, room_id:', roomId);
      res.json({
        success: true,
        data: { room_id: roomId },
        message: 'Yeni chat oluşturuldu'
      });

    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }

  } catch (error) {
    console.error('Direct chat oluştururken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Chat oluşturulamadı',
      error: error.message
    });
  }
};

const createGroupChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, participantIds, avatarUrl } = req.body;

    if (!name || !participantIds || participantIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Grup adı ve katılımcılar gerekli'
      });
    }

    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      const [roomResult] = await connection.execute(
        'INSERT INTO chat_rooms (name, type, description, avatar_url, created_by) VALUES (?, ?, ?, ?, ?)',
        [name, 'group', description, avatarUrl, userId]
      );
      const roomId = roomResult.insertId;

      await connection.execute(
        'INSERT INTO chat_participants (room_id, user_id, role) VALUES (?, ?, ?)',
        [roomId, userId, 'admin']
      );

      for (const participantId of participantIds) {
        if (participantId !== userId) {
          await connection.execute(
            'INSERT INTO chat_participants (room_id, user_id, role) VALUES (?, ?, ?)',
            [roomId, participantId, 'member']
          );
        }
      }

      await connection.commit();
      connection.release();

      await logActivity(req, 'CREATE', 'chat_rooms', roomId, `Yeni grup chat oluşturuldu: ${name}`);

      const io = getIO();
      if (io) {
        const allParticipants = [userId, ...participantIds.filter(id => id !== userId)];
        allParticipants.forEach(participantId => {
          io.to(`user-${participantId}`).emit('chat-list-update', { 
            type: 'new_group_chat', 
            room_id: roomId,
            participants: allParticipants,
            name: name
          });
        });
        console.log('Grup chat listesi güncelleme event\'i gönderildi:', roomId);
      }

      res.json({
        success: true,
        data: { room_id: roomId },
        message: 'Grup chat oluşturuldu'
      });

    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }

  } catch (error) {
    console.error('Grup chat oluştururken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Grup chat oluşturulamadı',
      error: error.message
    });
  }
};

// =====================================================
// MESAJ İŞLEMLERİ
// =====================================================

const getChatMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.min(200, Number(limit)) : 50;
    const offsetNum = (pageNum - 1) * limitNum;

    const accessCheck = await db.query(
      'SELECT id FROM chat_participants WHERE room_id = ? AND user_id = ? AND left_at IS NULL AND (deleted_at IS NULL OR reopened_at IS NOT NULL)',
      [roomId, userId]
    );

    if (accessCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu chat odasına erişim yetkiniz yok'
      });
    }

    const userParticipant = await db.query(
      'SELECT deleted_at, reopened_at FROM chat_participants WHERE room_id = ? AND user_id = ?',
      [roomId, userId]
    );

    const userDeletedAt = userParticipant[0]?.deleted_at;
    const userReopenedAt = userParticipant[0]?.reopened_at;

    let query = `
      SELECT 
        cm.id,
        cm.message_content as content,
        cm.message_type,
        cm.file_url,
        cm.file_name,
        cm.file_size,
        cm.file_mime_type as file_type,
        cm.thumbnail_url,
        cm.duration,
        cm.metadata,
        cm.is_edited,
        cm.is_pinned,
        cm.reply_to_message_id,
        cm.created_at,
        cm.updated_at,
        cm.edited_at,
        
        -- Gönderen bilgileri
        sender.id as sender_id,
        sender.name as sender_name,
        sender.avatar as sender_avatar,
        
        -- Yanıtlanan mesaj bilgileri
        reply_msg.message_content as reply_content,
        reply_msg.message_type as reply_type,
        reply_sender.name as reply_sender_name,
        
        -- Okunma durumu
        CASE 
          WHEN cm.sender_id = ? THEN 'sent'
          ELSE 'delivered'
        END as read_status
        
      FROM chat_messages cm
      JOIN users sender ON cm.sender_id = sender.id
      LEFT JOIN chat_messages reply_msg ON cm.reply_to_message_id = reply_msg.id
      LEFT JOIN users reply_sender ON reply_msg.sender_id = reply_sender.id
      
      WHERE cm.room_id = ? 
        AND cm.is_deleted = 0`;

    let filterDate = null;
    if (userDeletedAt) {
      if (userReopenedAt) {
        filterDate = userReopenedAt;
      } else {
        query += ` AND 1 = 0`;
      }
    }

    if (filterDate) {
      query += ` AND cm.created_at >= ?`;
    }

    query += `
      ORDER BY cm.created_at DESC
      LIMIT ${limitNum} OFFSET ${offsetNum}
    `;

    const queryParams = [Number(userId), Number(roomId)];
    if (filterDate) {
      queryParams.push(filterDate);
    }

    const messages = await db.query(query, queryParams);

    const parsedMessages = messages.map(msg => {
      let parsedMetadata = null;
      if (msg.metadata) {
        try {
          parsedMetadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
        } catch (error) {
          console.error('Metadata parse hatası:', error);
          parsedMetadata = null;
        }
      }
      
      return {
        ...msg,
        reactions: {}, 
        metadata: parsedMetadata
      };
    });

    res.json({
      success: true,
      data: parsedMessages.reverse(), 
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: messages.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Mesajları getirirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Mesajlar getirilemedi',
      error: error.message
    });
  }
};

const sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { 
      messageContent, 
      messageType = 'text', 
      replyToMessageId,
      metadata 
    } = req.body;

    const accessCheck = await db.query(
      'SELECT id FROM chat_participants WHERE room_id = ? AND user_id = ? AND left_at IS NULL',
      [roomId, userId]
    );

    if (accessCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu chat odasına mesaj gönderme yetkiniz yok'
      });
    }

    if (!messageContent && messageType === 'text') {
      return res.status(400).json({
        success: false,
        message: 'Mesaj içeriği gerekli'
      });
    }

    const participants = await db.query(
      `SELECT user_id FROM chat_participants 
       WHERE room_id = ? AND user_id != ? AND left_at IS NULL`,
      [roomId, userId]
    );

    for (const participant of participants) {
      await db.query(
        'UPDATE chat_participants SET reopened_at = CURRENT_TIMESTAMP WHERE room_id = ? AND user_id = ? AND deleted_at IS NOT NULL',
        [roomId, participant.user_id]
      );
    }

    const result = await db.query(
      `INSERT INTO chat_messages 
       (room_id, sender_id, message_content, message_type, reply_to_message_id, metadata) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [roomId, userId, messageContent, messageType, replyToMessageId, JSON.stringify(metadata)]
    );

    const messageId = result.insertId;

    for (const participant of participants) {
      await db.query(
        'INSERT INTO message_read_status (message_id, user_id, status) VALUES (?, ?, ?)',
        [messageId, participant.user_id, 'delivered']
      );
    }

    const messageQuery = `
      SELECT 
        cm.*,
        sender.name as sender_name,
        sender.avatar as sender_avatar
      FROM chat_messages cm
      JOIN users sender ON cm.sender_id = sender.id
      WHERE cm.id = ?
    `;

    const [newMessage] = await db.query(messageQuery, [messageId]);

    const io = getIO();
    console.log('Socket emit başlıyor. Katılımcılar:', participants);
    console.log('Gönderen userId:', userId);
    console.log('Gönderilecek mesaj:', newMessage);
    
    const messageForSocket = {
      id: newMessage.id,
      room_id: parseInt(roomId),
      sender_id: newMessage.sender_id,
      content: newMessage.message_content, 
      message_type: newMessage.message_type,
      created_at: newMessage.created_at,
      sender_name: newMessage.sender_name,
      sender_avatar: newMessage.sender_avatar
    };

    for (const participant of participants) {
      console.log(`Socket emit: user-${participant.user_id} için new-message gönderiliyor`);
      io.to(`user-${participant.user_id}`).emit('new-message', messageForSocket);
    }
    
    console.log(`Socket emit: user-${userId} için new-message gönderiliyor`);
    io.to(`user-${userId}`).emit('new-message', messageForSocket);

    for (const participant of participants) {
      io.to(`user-${participant.user_id}`).emit('chat-list-update', { 
        type: 'new_message', 
        room_id: parseInt(roomId),
        message_id: messageId,
        sender_id: userId
      });
    }
    console.log('Chat listesi güncelleme event\'i gönderildi (yeni mesaj):', roomId);

    res.json({
      success: true,
      data: newMessage,
      message: 'Mesaj gönderildi'
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

const markMessagesAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { messageIds } = req.body; 

    const accessCheck = await db.query(
      'SELECT id FROM chat_participants WHERE room_id = ? AND user_id = ? AND left_at IS NULL',
      [roomId, userId]
    );

    if (accessCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu chat odasına erişim yetkiniz yok'
      });
    }

    let query, params;

    if (messageIds && messageIds.length > 0) {
      const placeholders = messageIds.map(() => '?').join(',');
      query = `
        UPDATE message_read_status 
        SET status = 'read', read_at = NOW() 
        WHERE user_id = ? AND message_id IN (${placeholders}) AND status != 'read'
      `;
      params = [userId, ...messageIds];
    } else {
      query = `
        UPDATE message_read_status mrs
        JOIN chat_messages cm ON mrs.message_id = cm.id
        SET mrs.status = 'read', mrs.read_at = NOW()
        WHERE mrs.user_id = ? AND cm.room_id = ? AND mrs.status != 'read'
      `;
      params = [userId, roomId];
    }

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: { updatedCount: result.affectedRows },
      message: 'Mesajlar okundu olarak işaretlendi'
    });

  } catch (error) {
    console.error('Mesajları okundu işaretlerken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Mesajlar okundu işaretlenemedi',
      error: error.message
    });
  }
};

const editMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { messageContent } = req.body;

    if (!messageContent) {
      return res.status(400).json({
        success: false,
        message: 'Yeni mesaj içeriği gerekli'
      });
    }

    const messageCheck = await db.query(
      'SELECT id FROM chat_messages WHERE id = ? AND sender_id = ? AND is_deleted = 0',
      [messageId, userId]
    );

    if (messageCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu mesajı düzenleme yetkiniz yok'
      });
    }

    await db.query(
      'UPDATE chat_messages SET message_content = ?, is_edited = 1, edited_at = NOW() WHERE id = ?',
      [messageContent, messageId]
    );

    res.json({
      success: true,
      message: 'Mesaj düzenlendi'
    });

  } catch (error) {
    console.error('Mesaj düzenlerken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Mesaj düzenlenemedi',
      error: error.message
    });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { deleteType = 'for_me' } = req.body; // 'for_me' veya 'for_everyone'

    const messageCheck = await db.query(
      'SELECT sender_id, room_id FROM chat_messages WHERE id = ? AND is_deleted = 0',
      [messageId]
    );

    if (messageCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mesaj bulunamadı'
      });
    }

    const message = messageCheck[0];
    const isOwner = message.sender_id === userId;

    if (deleteType === 'for_everyone' && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Bu mesajı herkes için silme yetkiniz yok'
      });
    }

    if (deleteType === 'for_everyone') {
      await db.query(
        'UPDATE chat_messages SET is_deleted = 1, deleted_at = NOW() WHERE id = ?',
        [messageId]
      );
    } else {
      await db.query(
        'INSERT INTO message_deletes (message_id, user_id, delete_type) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE deleted_at = NOW()',
        [messageId, userId, deleteType]
      );
    }

    res.json({
      success: true,
      message: deleteType === 'for_everyone' ? 'Mesaj herkes için silindi' : 'Mesaj sizin için silindi'
    });

  } catch (error) {
    console.error('Mesaj silerken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Mesaj silinemedi',
      error: error.message
    });
  }
};

// =====================================================
// KATILIMCI İŞLEMLERİ
// =====================================================

const getChatParticipants = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;

    const accessCheck = await db.query(
      'SELECT role FROM chat_participants WHERE room_id = ? AND user_id = ? AND left_at IS NULL',
      [roomId, userId]
    );

    if (accessCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu chat odasına erişim yetkiniz yok'
      });
    }

    const query = `
      SELECT 
        cp.user_id,
        cp.role,
        cp.joined_at,
        cp.last_seen_at,
        cp.is_muted,
        u.name,
        u.email,
        u.avatar,
        u.is_online
      FROM chat_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.room_id = ? AND cp.left_at IS NULL
      ORDER BY cp.role DESC, u.name ASC
    `;

    const participants = await db.query(query, [roomId]);

    res.json({
      success: true,
      data: participants
    });

  } catch (error) {
    console.error('Katılımcıları getirirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Katılımcılar getirilemedi',
      error: error.message
    });
  }
};

module.exports = {
  getChatRooms,
  createOrGetDirectChat,
  createGroupChat,
  getChatMessages,
  sendMessage,
  markMessagesAsRead,
  editMessage,
  deleteMessage,
  getChatParticipants
};