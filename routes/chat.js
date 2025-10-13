const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/security');
const chatController = require('../controllers/chatController');
const db = require('../config/database');
const { getIO } = require('../utils/socket');

// Multer konfigürasyonu - dosya yükleme için
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/chat');
    
    // Klasör yoksa oluştur
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Dosya adını benzersiz yap
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const filename = file.fieldname + '-' + uniqueSuffix + extension;
    cb(null, filename);
  }
});

// Dosya filtreleme
const fileFilter = (req, file, cb) => {
  // İzin verilen dosya türleri
  const allowedTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/avi', 'video/mov', 'video/wmv',
    'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a',
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Bu dosya türü desteklenmiyor'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// =====================================================
// CHAT ODALARI (ROOMS) ROUTES
// =====================================================

// Kullanıcının chat odalarını getir
router.get('/rooms', authenticateToken, chatController.getChatRooms);

// Yeni direct chat oluştur veya mevcut olanı getir
router.post('/rooms/direct', authenticateToken, chatController.createOrGetDirectChat);

// Grup chat oluştur
router.post('/rooms/group', authenticateToken, chatController.createGroupChat);

// Chat odası bilgilerini getir
router.get('/rooms/:roomId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;

    // Kullanıcının bu odaya erişimi var mı kontrol et
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
        cr.*,
        creator.name as creator_name,
        COUNT(cp.user_id) as participant_count
      FROM chat_rooms cr
      LEFT JOIN users creator ON cr.created_by = creator.id
      LEFT JOIN chat_participants cp ON cr.id = cp.room_id AND cp.left_at IS NULL
      WHERE cr.id = ? AND cr.is_active = 1
      GROUP BY cr.id
    `;

    const [room] = await db.query(query, [roomId]);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat odası bulunamadı'
      });
    }

    res.json({
      success: true,
      data: room
    });

  } catch (error) {
    console.error('Chat odası bilgilerini getirirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Chat odası bilgileri getirilemedi',
      error: error.message
    });
  }
});

// Chat odası ayarlarını güncelle
router.put('/rooms/:roomId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { name, description, avatarUrl } = req.body;

    // Kullanıcının admin yetkisi var mı kontrol et
    const adminCheck = await db.query(
      'SELECT role FROM chat_participants WHERE room_id = ? AND user_id = ? AND role = "admin" AND left_at IS NULL',
      [roomId, userId]
    );

    if (adminCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için admin yetkisi gerekli'
      });
    }

    await db.query(
      'UPDATE chat_rooms SET name = ?, description = ?, avatar_url = ?, updated_at = NOW() WHERE id = ?',
      [name, description, avatarUrl, roomId]
    );

    res.json({
      success: true,
      message: 'Chat odası güncellendi'
    });

  } catch (error) {
    console.error('Chat odası güncellerken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Chat odası güncellenemedi',
      error: error.message
    });
  }
});

// =====================================================
// MESAJ ROUTES
// =====================================================

// Chat mesajlarını getir
router.get('/rooms/:roomId/messages', authenticateToken, chatController.getChatMessages);

// Yeni mesaj gönder (text)
router.post('/rooms/:roomId/messages', authenticateToken, chatController.sendMessage);

// Dosya ile mesaj gönder
router.post('/rooms/:roomId/messages/file', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { messageType = 'file', replyToMessageId } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Dosya gerekli'
      });
    }

    // Kullanıcının bu odaya erişimi var mı kontrol et
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

    const file = req.file;
    const fileUrl = `/uploads/chat/${file.filename}`;
    
    // Dosya türüne göre mesaj tipini belirle
    let finalMessageType = messageType;
    if (file.mimetype.startsWith('image/')) {
      finalMessageType = 'image';
    } else if (file.mimetype.startsWith('video/')) {
      finalMessageType = 'video';
    } else if (file.mimetype.startsWith('audio/')) {
      finalMessageType = 'audio';
    } else {
      finalMessageType = 'file';
    }

    // Metadata oluştur
    const metadata = {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size
    };

    // Mesajı veritabanına kaydet
    const result = await db.query(
      `INSERT INTO chat_messages 
       (room_id, sender_id, message_content, message_type, file_url, file_name, file_size, file_mime_type, reply_to_message_id, metadata) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        roomId, 
        userId, 
        file.originalname, // Dosya adını mesaj içeriği olarak kullan
        finalMessageType, 
        fileUrl, 
        file.originalname, 
        file.size, 
        file.mimetype, 
        replyToMessageId || null, // undefined ise null yap
        JSON.stringify(metadata)
      ]
    );

    const messageId = result.insertId;

    // Oda katılımcılarını getir (gönderen hariç)
    const participants = await db.query(
      `SELECT user_id FROM chat_participants 
       WHERE room_id = ? AND user_id != ? AND left_at IS NULL`,
      [roomId, userId]
    );

    // Her katılımcı için mesaj durumu oluştur
    for (const participant of participants) {
      await db.query(
        'INSERT INTO message_read_status (message_id, user_id, status) VALUES (?, ?, ?)',
        [messageId, participant.user_id, 'delivered']
      );
    }

    // Gönderilen mesajı detaylarıyla birlikte getir
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

    // Socket ile real-time mesaj gönder
    const io = getIO();
    console.log('Dosya upload Socket emit başlıyor. Katılımcılar:', participants);
    console.log('Gönderen userId:', userId);
    console.log('Gönderilecek dosya mesajı:', newMessage);
    
    // Frontend'in beklediği formatta mesaj objesi oluştur
    const messageForSocket = {
      id: newMessage.id,
      room_id: parseInt(roomId),
      sender_id: newMessage.sender_id,
      content: newMessage.message_content,
      message_type: newMessage.message_type,
      file_url: newMessage.file_url,
      file_name: newMessage.file_name,
      file_size: newMessage.file_size,
      file_mime_type: newMessage.file_mime_type,
      created_at: newMessage.created_at,
      sender_name: newMessage.sender_name,
      sender_avatar: newMessage.sender_avatar,
      metadata: (() => {
        try {
          return newMessage.metadata ? 
            (typeof newMessage.metadata === 'string' ? JSON.parse(newMessage.metadata) : newMessage.metadata) 
            : null;
        } catch (error) {
          console.error('Metadata parse hatası (dosya upload):', error);
          return null;
        }
      })()
    };

    // Oda katılımcılarına mesajı gönder
    for (const participant of participants) {
      console.log(`Socket emit: user-${participant.user_id} için new-message gönderiliyor (dosya)`);
      io.to(`user-${participant.user_id}`).emit('new-message', messageForSocket);
    }
    
    // Gönderene de mesajı gönder (diğer cihazları için)
    console.log(`Socket emit: user-${userId} için new-message gönderiliyor (dosya)`);
    io.to(`user-${userId}`).emit('new-message', messageForSocket);

    // Chat listesi güncellemesi için event gönder (okunmamış mesaj sayıları için)
    for (const participant of participants) {
      io.to(`user-${participant.user_id}`).emit('chat-list-update', { 
        type: 'new_message', 
        room_id: parseInt(roomId),
        message_id: messageId,
        sender_id: userId
      });
    }
    console.log('Chat listesi güncelleme event\'i gönderildi (dosya mesajı):', roomId);

    res.json({
      success: true,
      data: newMessage,
      message: 'Dosya gönderildi'
    });

  } catch (error) {
    console.error('Dosya gönderirken hata:', error);
    
    // Hata durumunda dosyayı sil
    if (req.file) {
      const filePath = path.join(__dirname, '../uploads/chat', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Dosya gönderilemedi',
      error: error.message
    });
  }
});

// Mesajları okundu olarak işaretle
router.put('/rooms/:roomId/messages/read', authenticateToken, chatController.markMessagesAsRead);

// Mesaj düzenle
router.put('/messages/:messageId', authenticateToken, chatController.editMessage);

// Mesaj sil
router.delete('/messages/:messageId', authenticateToken, chatController.deleteMessage);

// Mesaja reaksiyon ekle/kaldır
router.post('/messages/:messageId/reaction', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { reaction } = req.body;

    if (!reaction) {
      return res.status(400).json({
        success: false,
        message: 'Reaksiyon gerekli'
      });
    }

    // Mesajın var olduğunu ve kullanıcının erişimi olduğunu kontrol et
    const messageCheck = await db.query(`
      SELECT cm.id 
      FROM chat_messages cm
      JOIN chat_participants cp ON cm.room_id = cp.room_id
      WHERE cm.id = ? AND cp.user_id = ? AND cp.left_at IS NULL AND cm.is_deleted = 0
    `, [messageId, userId]);

    if (messageCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu mesaja reaksiyon verme yetkiniz yok'
      });
    }

    // Mevcut reaksiyonu kontrol et
    const existingReaction = await db.query(
      'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND reaction = ?',
      [messageId, userId, reaction]
    );

    if (existingReaction.length > 0) {
      // Reaksiyonu kaldır
      await db.query(
        'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND reaction = ?',
        [messageId, userId, reaction]
      );
      
      res.json({
        success: true,
        message: 'Reaksiyon kaldırıldı',
        action: 'removed'
      });
    } else {
      // Reaksiyonu ekle
      await db.query(
        'INSERT INTO message_reactions (message_id, user_id, reaction) VALUES (?, ?, ?)',
        [messageId, userId, reaction]
      );
      
      res.json({
        success: true,
        message: 'Reaksiyon eklendi',
        action: 'added'
      });
    }

  } catch (error) {
    console.error('Reaksiyon işleminde hata:', error);
    res.status(500).json({
      success: false,
      message: 'Reaksiyon işlemi başarısız',
      error: error.message
    });
  }
});

// Mesajı sabitle/sabitlemeyi kaldır
router.put('/messages/:messageId/pin', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { isPinned } = req.body;

    // Kullanıcının admin yetkisi var mı kontrol et
    const adminCheck = await db.query(`
      SELECT cp.role 
      FROM chat_messages cm
      JOIN chat_participants cp ON cm.room_id = cp.room_id
      WHERE cm.id = ? AND cp.user_id = ? AND cp.role = 'admin' AND cp.left_at IS NULL
    `, [messageId, userId]);

    if (adminCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için admin yetkisi gerekli'
      });
    }

    await db.query(
      'UPDATE chat_messages SET is_pinned = ? WHERE id = ?',
      [isPinned ? 1 : 0, messageId]
    );

    res.json({
      success: true,
      message: isPinned ? 'Mesaj sabitlendi' : 'Mesaj sabitleme kaldırıldı'
    });

  } catch (error) {
    console.error('Mesaj sabitleme işleminde hata:', error);
    res.status(500).json({
      success: false,
      message: 'Mesaj sabitleme işlemi başarısız',
      error: error.message
    });
  }
});

// =====================================================
// KATILIMCI ROUTES
// =====================================================

// Chat katılımcılarını getir
router.get('/rooms/:roomId/participants', authenticateToken, chatController.getChatParticipants);

// Chat odasına katılımcı ekle
router.post('/rooms/:roomId/participants', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { userIds } = req.body;

    if (!userIds || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Eklenecek kullanıcılar gerekli'
      });
    }

    // Kullanıcının admin yetkisi var mı kontrol et
    const adminCheck = await db.query(
      'SELECT role FROM chat_participants WHERE room_id = ? AND user_id = ? AND role = "admin" AND left_at IS NULL',
      [roomId, userId]
    );

    if (adminCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için admin yetkisi gerekli'
      });
    }

    // Grup chat mi kontrol et
    const roomCheck = await db.query(
      'SELECT type FROM chat_rooms WHERE id = ? AND type = "group"',
      [roomId]
    );

    if (roomCheck.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Sadece grup chatlerine katılımcı eklenebilir'
      });
    }

    const addedUsers = [];
    
    for (const newUserId of userIds) {
      // Kullanıcı zaten katılımcı mı kontrol et
      const existingParticipant = await db.query(
        'SELECT id FROM chat_participants WHERE room_id = ? AND user_id = ? AND left_at IS NULL',
        [roomId, newUserId]
      );

      if (existingParticipant.length === 0) {
        await db.query(
          'INSERT INTO chat_participants (room_id, user_id, role) VALUES (?, ?, ?)',
          [roomId, newUserId, 'member']
        );
        addedUsers.push(newUserId);
      }
    }

    res.json({
      success: true,
      data: { addedUsers },
      message: `${addedUsers.length} katılımcı eklendi`
    });

  } catch (error) {
    console.error('Katılımcı eklerken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Katılımcı eklenemedi',
      error: error.message
    });
  }
});

// Chat odasından katılımcı çıkar
router.delete('/rooms/:roomId/participants/:participantId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId, participantId } = req.params;

    // Kullanıcının admin yetkisi var mı veya kendini mi çıkarıyor kontrol et
    const adminCheck = await db.query(
      'SELECT role FROM chat_participants WHERE room_id = ? AND user_id = ? AND role = "admin" AND left_at IS NULL',
      [roomId, userId]
    );

    const isSelfLeaving = userId === parseInt(participantId);

    if (adminCheck.length === 0 && !isSelfLeaving) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için admin yetkisi gerekli'
      });
    }

    // Katılımcıyı çıkar (soft delete)
    await db.query(
      'UPDATE chat_participants SET left_at = NOW() WHERE room_id = ? AND user_id = ?',
      [roomId, participantId]
    );

    res.json({
      success: true,
      message: isSelfLeaving ? 'Chat odasından ayrıldınız' : 'Katılımcı çıkarıldı'
    });

  } catch (error) {
    console.error('Katılımcı çıkarırken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Katılımcı çıkarılamadı',
      error: error.message
    });
  }
});

// Katılımcı rolünü güncelle
router.put('/rooms/:roomId/participants/:participantId/role', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId, participantId } = req.params;
    const { role } = req.body;

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz rol'
      });
    }

    // Kullanıcının admin yetkisi var mı kontrol et
    const adminCheck = await db.query(
      'SELECT role FROM chat_participants WHERE room_id = ? AND user_id = ? AND role = "admin" AND left_at IS NULL',
      [roomId, userId]
    );

    if (adminCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için admin yetkisi gerekli'
      });
    }

    await db.query(
      'UPDATE chat_participants SET role = ? WHERE room_id = ? AND user_id = ?',
      [role, roomId, participantId]
    );

    res.json({
      success: true,
      message: 'Katılımcı rolü güncellendi'
    });

  } catch (error) {
    console.error('Katılımcı rolü güncellerken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Katılımcı rolü güncellenemedi',
      error: error.message
    });
  }
});

// =====================================================
// ARAMA VE FİLTRELEME
// =====================================================

// Mesajlarda arama yap
router.get('/rooms/:roomId/search', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const { query, messageType, dateFrom, dateTo, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Kullanıcının bu odaya erişimi var mı kontrol et
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

    let searchQuery = `
      SELECT 
        cm.*,
        sender.name as sender_name,
        sender.avatar as sender_avatar
      FROM chat_messages cm
      JOIN users sender ON cm.sender_id = sender.id
      WHERE cm.room_id = ? AND cm.is_deleted = 0
    `;
    
    const queryParams = [roomId];

    if (query) {
      searchQuery += ` AND cm.message_content LIKE ?`;
      queryParams.push(`%${query}%`);
    }

    if (messageType) {
      searchQuery += ` AND cm.message_type = ?`;
      queryParams.push(messageType);
    }

    if (dateFrom) {
      searchQuery += ` AND cm.created_at >= ?`;
      queryParams.push(dateFrom);
    }

    if (dateTo) {
      searchQuery += ` AND cm.created_at <= ?`;
      queryParams.push(dateTo);
    }

    searchQuery += ` ORDER BY cm.created_at DESC LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit), offset);

    const messages = await db.query(searchQuery, queryParams);

    res.json({
      success: true,
      data: messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: messages.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Mesaj arama hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Arama yapılamadı',
      error: error.message
    });
  }
});

// Kullanıcı arama (yeni chat oluşturmak için)
router.get('/users/search', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { query = '', limit = 10 } = req.query;

    // Boş query için tüm kullanıcıları döndür
    let searchQuery, queryParams;
    
    if (!query || query.trim().length === 0) {
      searchQuery = `
        SELECT 
          id,
          name,
          email,
          avatar,
          is_online
        FROM users 
        WHERE id != ?
        ORDER BY name ASC
        LIMIT ?
      `;
      queryParams = [userId, parseInt(limit)];
    } else {
      searchQuery = `
        SELECT 
          id,
          name,
          email,
          avatar,
          is_online
        FROM users 
        WHERE id != ? 
          AND (name LIKE ? OR email LIKE ?)
        ORDER BY name ASC
        LIMIT ?
      `;
      queryParams = [userId, `%${query}%`, `%${query}%`, parseInt(limit)];
    }

    const users = await db.query(searchQuery, queryParams);

    res.json({
      success: true,
      data: users
    });

  } catch (error) {
    console.error('Kullanıcı arama hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı araması yapılamadı',
      error: error.message
    });
  }
});

// Chat sabitleme/sabitleme kaldırma
router.put('/rooms/:roomId/pin', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;
    const { is_pinned } = req.body;

    // Kullanıcının bu chat'e katılımcı olup olmadığını kontrol et
    const participantCheck = await db.query(
      'SELECT id FROM chat_participants WHERE room_id = ? AND user_id = ? AND left_at IS NULL',
      [roomId, userId]
    );

    if (participantCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu chat\'e erişim yetkiniz yok'
      });
    }

    // Chat sabitleme durumunu güncelle
    await db.query(
      'UPDATE chat_participants SET is_pinned = ?, updated_at = NOW() WHERE room_id = ? AND user_id = ?',
      [is_pinned ? 1 : 0, roomId, userId]
    );

    res.json({
      success: true,
      message: is_pinned ? 'Chat başa sabitlendi' : 'Chat sabitleme kaldırıldı',
      data: {
        room_id: roomId,
        is_pinned: is_pinned
      }
    });

  } catch (error) {
    console.error('Chat sabitleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Chat sabitleme işlemi yapılamadı',
      error: error.message
    });
  }
});

// Tüm mesajları sil (sadece silen kullanıcı için)
router.delete('/rooms/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;

    // Kullanıcının bu chat'e erişimi var mı kontrol et
    const [participantRows] = await db.query(
      'SELECT * FROM chat_participants WHERE room_id = ? AND user_id = ? AND left_at IS NULL AND (deleted_at IS NULL OR reopened_at IS NOT NULL)',
      [roomId, userId]
    );

    if (participantRows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bu chat\'e erişim yetkiniz yok'
      });
    }

    // Chat'i sadece bu kullanıcı için sil (soft delete)
    await db.query(
      'UPDATE chat_participants SET deleted_at = NOW(), updated_at = NOW() WHERE room_id = ? AND user_id = ?',
      [roomId, userId]
    );

    res.json({
      success: true,
      message: 'Tüm mesajlar silindi',
      data: {
        room_id: roomId,
        deleted_for_user: userId
      }
    });

  } catch (error) {
    console.error('Mesaj silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mesajlar silinemedi',
      error: error.message
    });
  }
});

module.exports = router;