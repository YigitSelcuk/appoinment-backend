const jwt = require('jsonwebtoken');
const db = require('./config/database');

class SocketManager {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // userId -> { socketId, userInfo, rooms }
    this.typingUsers = new Map(); // roomId -> Set of userIds
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.use(this.authenticateSocket.bind(this));
    this.io.on('connection', this.handleConnection.bind(this));
  }

  // Socket kimlik doğrulama middleware
  async authenticateSocket(socket, next) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Token gerekli'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userQuery = 'SELECT id, name, email, avatar FROM users WHERE id = ?';
      const [users] = await db.execute(userQuery, [decoded.id]);

      if (!users || users.length === 0) {
        return next(new Error('Kullanıcı bulunamadı'));
      }

      const user = users[0];

      socket.userId = user.id;
      socket.userInfo = user;
      next();
    } catch (error) {
      console.error('Socket kimlik doğrulama hatası:', error);
      next(new Error('Kimlik doğrulama başarısız'));
    }
  }

  // Yeni bağlantı işleyicisi
  async handleConnection(socket) {
    const userId = socket.userId;
    const userInfo = socket.userInfo;

    console.log(`Kullanıcı bağlandı: ${userInfo.name} (${userId})`);

    // Kullanıcıyı online olarak işaretle
    const updatedUser = await this.setUserOnlineStatus(userId, true);

    // Kullanıcının chat odalarını getir ve odalara katıl
    const userRooms = await this.getUserRooms(userId);
    const roomIds = userRooms && userRooms.length > 0 
      ? userRooms.filter(room => room && room.room_id).map(room => room.room_id.toString()) 
      : [];

    // Socket'i odalara tek tek katıl (diziyi iterate et)
    roomIds.forEach((roomId) => {
      if (roomId) {
        socket.join(roomId);
        console.log(`Odaya katıldı: ${roomId}`);
      }
    });

    // Kullanıcı özel odasına da katıl
    socket.join(`user-${userId}`);
    console.log(`Kullanıcı kişisel odaya katıldı: user-${userId}`);

    // Bağlı kullanıcıları güncelle
    this.connectedUsers.set(userId, {
      socketId: socket.id,
      userInfo: userInfo,
      rooms: roomIds
    });

    // Kullanıcının odalarındaki diğer kullanıcılara online durumunu bildir
    if (updatedUser) {
      roomIds.forEach(roomId => {
        socket.to(roomId).emit('user-online', {
          userId: userId,
          userInfo: userInfo,
          last_seen: updatedUser.last_seen,
          timestamp: new Date()
        });
      });
    }

    // Tüm kullanıcılara güncel online users listesini gönder
    this.broadcastOnlineUsersList();

    // Socket event handlers
    this.setupMessageHandlers(socket);
    this.setupRoomHandlers(socket);
    this.setupTypingHandlers(socket);
    this.setupStatusHandlers(socket);

    // Bağlantı koptuğunda
    socket.on('disconnect', () => this.handleDisconnection(socket));
  }

  // Mesaj event handlers
  setupMessageHandlers(socket) {
    const userId = socket.userId;

    // Yeni mesaj gönderme
    socket.on('send_message', async (data) => {
      try {
        const { roomId, messageContent, messageType = 'text', replyToMessageId, metadata } = data;

        // Kullanıcının bu odaya erişimi var mı kontrol et
        const hasAccess = await this.checkRoomAccess(userId, roomId);
        if (!hasAccess) {
          socket.emit('error', { message: 'Bu odaya erişim yetkiniz yok' });
          return;
        }

        // Oda katılımcılarını getir
        const [participants] = await db.execute(
          `SELECT user_id FROM chat_participants 
           WHERE room_id = ? AND left_at IS NULL`,
          [roomId]
        );

        // Alıcıların chat'ini yeniden aç (deleted_at varsa reopened_at güncelle) - MESAJ KAYDEDİLMEDEN ÖNCE
        for (const participant of participants) {
          if (participant.user_id !== userId) {
            await db.execute(
              'UPDATE chat_participants SET reopened_at = CURRENT_TIMESTAMP WHERE room_id = ? AND user_id = ? AND deleted_at IS NOT NULL',
              [roomId, participant.user_id]
            );
          }
        }

        // Mesajı veritabanına kaydet
        const [result] = await db.execute(
          `INSERT INTO chat_messages 
           (room_id, sender_id, message_content, message_type, reply_to_message_id, metadata) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [roomId, userId, messageContent, messageType, replyToMessageId, JSON.stringify(metadata)]
        );

        const messageId = result.insertId;

        // Her katılımcı için mesaj durumu oluştur (gönderen hariç)
        for (const participant of participants) {
          if (participant.user_id !== userId) {
            await db.execute(
              'INSERT INTO message_read_status (message_id, user_id, status) VALUES (?, ?, ?)',
              [messageId, participant.user_id, 'delivered']
            );
          }
        }

        // Mesaj detaylarını getir
        const messageQuery = `
          SELECT 
            cm.id,
            cm.room_id,
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
            cm.sender_id,
            sender.name as sender_name,
            sender.avatar as sender_avatar,
            reply_msg.message_content as reply_content,
            reply_sender.name as reply_sender_name
          FROM chat_messages cm
          JOIN users sender ON cm.sender_id = sender.id
          LEFT JOIN chat_messages reply_msg ON cm.reply_to_message_id = reply_msg.id
          LEFT JOIN users reply_sender ON reply_msg.sender_id = reply_sender.id
          WHERE cm.id = ?
        `;

        const [messages] = await db.execute(messageQuery, [messageId]);
        const newMessage = messages[0];

        // Odadaki tüm kullanıcılara mesajı gönder
        this.io.to(roomId.toString()).emit('new_message', {
        ...newMessage,
        timestamp: new Date()
        });

        // Gönderene onay
        socket.emit('message_sent', {
        tempId: data.tempId,
        messageId: messageId,
        timestamp: new Date()
        });

        // Typing durumunu temizle
        this.removeTypingUser(roomId, userId);

      } catch (error) {
        console.error('Mesaj gönderme hatası:', error);
        socket.emit('error', { message: 'Mesaj gönderilemedi' });
      }
    });

    // Alternatif event adı ile (dash) yeni mesaj gönderme
    socket.on('send-message', async (data) => {
    try {
    const { roomId, messageContent, messageType = 'text', replyToMessageId, metadata } = data;
    // Kullanıcının bu odaya erişimi var mı kontrol et
    const hasAccess = await this.checkRoomAccess(userId, roomId);
    if (!hasAccess) {
    socket.emit('error', { message: 'Bu odaya erişim yetkiniz yok' });
    return;
    }
    
    // Mesajı veritabanına kaydet
    const [result] = await db.execute(
    `INSERT INTO chat_messages 
    (room_id, sender_id, message_content, message_type, reply_to_message_id, metadata) 
    VALUES (?, ?, ?, ?, ?, ?)`,
    [roomId, userId, messageContent, messageType, replyToMessageId, JSON.stringify(metadata)]
    );
    
    const messageId = result.insertId;
    
    // Oda katılımcılarını getir
    const [participants] = await db.execute(
    `SELECT user_id FROM chat_participants 
    WHERE room_id = ? AND left_at IS NULL`,
    [roomId]
    );
    
    // Her katılımcı için mesaj durumu oluştur (gönderen hariç)
    for (const participant of participants) {
    if (participant.user_id !== userId) {
    await db.execute(
    'INSERT INTO message_read_status (message_id, user_id, status) VALUES (?, ?, ?)',
    [messageId, participant.user_id, 'delivered']
    );
    }
    }
    
    // Mesaj detaylarını getir
    const messageQuery = `
    SELECT 
    cm.id,
    cm.room_id,
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
    cm.sender_id,
    sender.name as sender_name,
    sender.avatar as sender_avatar,
    reply_msg.message_content as reply_content,
    reply_sender.name as reply_sender_name
    FROM chat_messages cm
    JOIN users sender ON cm.sender_id = sender.id
    LEFT JOIN chat_messages reply_msg ON cm.reply_to_message_id = reply_msg.id
    LEFT JOIN users reply_sender ON reply_msg.sender_id = reply_sender.id
    WHERE cm.id = ?
    `;
    
    const [messages] = await db.execute(messageQuery, [messageId]);
    const newMessage = messages[0];
    
    // Odadaki tüm kullanıcılara mesajı gönder (dash event adı)
    this.io.to(roomId.toString()).emit('new-message', {
    ...newMessage,
    timestamp: new Date()
    });
    
    // Gönderene onay
    socket.emit('message_sent', {
    tempId: data.tempId,
    messageId: messageId,
    timestamp: new Date()
    });
    
    // Typing durumunu temizle
    this.removeTypingUser(roomId, userId);
    
    } catch (error) {
    console.error('Mesaj gönderme hatası:', error);
    socket.emit('error', { message: 'Mesaj gönderilemedi' });
    }
    });
     // Mesaj düzenleme
     socket.on('edit_message', async (data) => {
       try {
         const { messageId, newContent } = data;

         // Mesajın sahibi mi kontrol et
         const [messageCheck] = await db.execute(
           'SELECT room_id FROM chat_messages WHERE id = ? AND sender_id = ? AND is_deleted = 0',
           [messageId, userId]
         );

         if (messageCheck.length === 0) {
           socket.emit('error', { message: 'Bu mesajı düzenleme yetkiniz yok' });
           return;
         }

         const roomId = messageCheck[0].room_id;

         // Mesajı güncelle
         await db.execute(
           'UPDATE chat_messages SET message_content = ?, is_edited = 1, edited_at = NOW() WHERE id = ?',
           [newContent, messageId]
         );

         // Odadaki tüm kullanıcılara güncellemeyi bildir
         this.io.to(roomId.toString()).emit('message_edited', {
           messageId: messageId,
           newContent: newContent,
           editedAt: new Date(),
           editorId: userId
         });

       } catch (error) {
         console.error('Mesaj düzenleme hatası:', error);
         socket.emit('error', { message: 'Mesaj düzenlenemedi' });
       }
     });

     // Mesaj silme
     socket.on('delete_message', async (data) => {
       try {
         const { messageId, deleteType = 'for_me' } = data;

         const [messageCheck] = await db.execute(
           'SELECT room_id, sender_id FROM chat_messages WHERE id = ? AND is_deleted = 0',
           [messageId]
         );

         if (messageCheck.length === 0) {
           socket.emit('error', { message: 'Mesaj bulunamadı' });
           return;
         }

         const { room_id: roomId, sender_id: senderId } = messageCheck[0];
         const isOwner = senderId === userId;

         if (deleteType === 'for_everyone' && !isOwner) {
           socket.emit('error', { message: 'Bu mesajı herkes için silme yetkiniz yok' });
           return;
         }

         if (deleteType === 'for_everyone') {
           // Herkes için sil
           await db.execute(
             'UPDATE chat_messages SET is_deleted = 1, deleted_at = NOW() WHERE id = ?',
             [messageId]
           );

           // Odadaki tüm kullanıcılara bildir
           this.io.to(roomId.toString()).emit('message_deleted', {
             messageId: messageId,
             deleteType: 'for_everyone',
             deletedBy: userId,
             timestamp: new Date()
           });
         } else {
           // Sadece kendim için sil
           await db.execute(
             'INSERT INTO message_deletes (message_id, user_id, delete_type) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE deleted_at = NOW()',
             [messageId, userId, deleteType]
           );

           // Sadece kendisine bildir
           socket.emit('message_deleted', {
             messageId: messageId,
             deleteType: 'for_me',
             timestamp: new Date()
           });
         }

       } catch (error) {
         console.error('Mesaj silme hatası:', error);
         socket.emit('error', { message: 'Mesaj silinemedi' });
       }
     });

     // Mesajları okundu işaretle
     socket.on('mark_messages_read', async (data) => {
       try {
         const { roomId, messageIds } = data;

         // Kullanıcının bu odaya erişimi var mı kontrol et
         const hasAccess = await this.checkRoomAccess(userId, roomId);
         if (!hasAccess) {
           socket.emit('error', { message: 'Bu odaya erişim yetkiniz yok' });
           return;
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

         const [result] = await db.execute(query, params);

         // Odadaki diğer kullanıcılara bildir
         socket.to(roomId.toString()).emit('messages_read', {
           userId: userId,
           roomId: roomId,
           messageIds: messageIds,
           readCount: result.affectedRows,
           timestamp: new Date()
         });

         // Kendisine onay gönder
         socket.emit('messages_marked_read', {
           roomId: roomId,
           readCount: result.affectedRows
         });

       } catch (error) {
         console.error('Mesaj okundu işaretleme hatası:', error);
         socket.emit('error', { message: 'Mesajlar okundu işaretlenemedi' });
       }
     });

     // Reaksiyon ekleme/kaldırma
     socket.on('toggle_reaction', async (data) => {
       try {
         const { messageId, reaction } = data;

         // Mesajın var olduğunu kontrol et
         const [messageCheck] = await db.execute(`
           SELECT cm.room_id 
           FROM chat_messages cm
           JOIN chat_participants cp ON cm.room_id = cp.room_id
           WHERE cm.id = ? AND cp.user_id = ? AND cp.left_at IS NULL AND cm.is_deleted = 0
         `, [messageId, userId]);

         if (messageCheck.length === 0) {
           socket.emit('error', { message: 'Bu mesaja reaksiyon verme yetkiniz yok' });
           return;
         }

         const roomId = messageCheck[0].room_id;

         // Mevcut reaksiyonu kontrol et
         const [existingReaction] = await db.execute(
           'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND reaction = ?',
           [messageId, userId, reaction]
         );

         let action;
         if (existingReaction.length > 0) {
           // Reaksiyonu kaldır
           await db.execute(
             'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND reaction = ?',
             [messageId, userId, reaction]
           );
           action = 'removed';
         } else {
           // Reaksiyonu ekle
           await db.execute(
             'INSERT INTO message_reactions (message_id, user_id, reaction) VALUES (?, ?, ?)',
             [messageId, userId, reaction]
           );
           action = 'added';
         }

         // Odadaki tüm kullanıcılara bildir
         this.io.to(roomId.toString()).emit('reaction_updated', {
           messageId: messageId,
           reaction: reaction,
           userId: userId,
           userName: socket.userInfo.name,
           action: action,
           timestamp: new Date()
         });

       } catch (error) {
         console.error('Reaksiyon işlemi hatası:', error);
         socket.emit('error', { message: 'Reaksiyon işlemi başarısız' });
       }
     });
   }

   // Oda event handlers
   setupRoomHandlers(socket) {
     const userId = socket.userId;

     // Odaya katılma
     socket.on('join_room', async (data) => {
       try {
         const { roomId } = data;

         // Kullanıcının bu odaya erişimi var mı kontrol et
         const hasAccess = await this.checkRoomAccess(userId, roomId);
         if (!hasAccess) {
           socket.emit('error', { message: 'Bu odaya erişim yetkiniz yok' });
           return;
         }

         socket.join(roomId.toString());

         // Bağlı kullanıcı bilgilerini güncelle
         const userConnection = this.connectedUsers.get(userId);
         if (userConnection) {
           userConnection.rooms.push(roomId.toString());
         }

         // Odadaki diğer kullanıcılara bildir
         socket.to(roomId.toString()).emit('user_joined_room', {
           userId: userId,
           userInfo: socket.userInfo,
           roomId: roomId,
           timestamp: new Date()
         });

         socket.emit('room_joined', { roomId: roomId });

       } catch (error) {
         console.error('Odaya katılma hatası:', error);
         socket.emit('error', { message: 'Odaya katılamadı' });
       }
     });

     // Odadan ayrılma
     socket.on('leave_room', async (data) => {
       try {
         const { roomId } = data;

         socket.leave(roomId.toString());

         // Bağlı kullanıcı bilgilerini güncelle
         const userConnection = this.connectedUsers.get(userId);
         if (userConnection) {
           userConnection.rooms = userConnection.rooms.filter(r => r !== roomId.toString());
         }

         // Typing durumunu temizle
         this.removeTypingUser(roomId, userId);

         // Odadaki diğer kullanıcılara bildir
         socket.to(roomId.toString()).emit('user_left_room', {
           userId: userId,
           userInfo: socket.userInfo,
           roomId: roomId,
           timestamp: new Date()
         });

         socket.emit('room_left', { roomId: roomId });

       } catch (error) {
         console.error('Odadan ayrılma hatası:', error);
         socket.emit('error', { message: 'Odadan ayrılamadı' });
       }
     });
   }

   // Typing event handlers
   setupTypingHandlers(socket) {
     const userId = socket.userId;

     // Yazıyor durumu başlat
     socket.on('typing_start', (data) => {
       const { roomId } = data;
       
       if (!this.typingUsers.has(roomId)) {
         this.typingUsers.set(roomId, new Set());
       }
       
       this.typingUsers.get(roomId).add(userId);

       // Odadaki diğer kullanıcılara bildir
       socket.to(roomId.toString()).emit('user_typing', {
         userId: userId,
         userName: socket.userInfo.name,
         roomId: roomId,
         isTyping: true
       });
     });

     // Yazıyor durumu durdur
     socket.on('typing_stop', (data) => {
       const { roomId } = data;
       this.removeTypingUser(roomId, userId);
     });
   }

   // Durum event handlers
   setupStatusHandlers(socket) {
     const userId = socket.userId;
     const userInfo = socket.userInfo;
   
     // Online durumu güncelle
     ['update_status', 'update-status'].forEach((eventName) => {
       socket.on(eventName, async (data) => {
         try {
           const { isOnline } = data;
           console.log(`📡 ${eventName} event alındı:`, { userId, isOnline, userInfo: userInfo.name });
           
           const updatedUser = await this.setUserOnlineStatus(userId, isOnline);
           console.log('✅ Kullanıcı durumu güncellendi:', { userId, isOnline, last_seen: updatedUser?.last_seen });
   
           // Kullanıcının odalarındaki diğer kullanıcılara bildir
           const userConnection = this.connectedUsers.get(userId);
           if (userConnection && updatedUser) {
             console.log(`📢 ${userConnection.rooms.length} odaya durum bildiriliyor:`, userConnection.rooms);
             userConnection.rooms.forEach(roomId => {
               const payload = { 
                 userId: userId, 
                 userInfo: userInfo, 
                 last_seen: updatedUser.last_seen,
                 timestamp: new Date() 
               };
               if (isOnline) {
                 socket.to(roomId).emit('user-online', payload);
                 console.log(`🟢 user-online emit edildi (oda: ${roomId}):`, payload);
               } else {
                 socket.to(roomId).emit('user-offline', payload);
                 console.log(`🔴 user-offline emit edildi (oda: ${roomId}):`, payload);
               }
               // Eski event ismini koru (geri uyumluluk)
               socket.to(roomId).emit('user_status_updated', {
                 userId: userId,
                 isOnline: isOnline,
                 last_seen: updatedUser.last_seen,
                 timestamp: new Date()
               });
             });
           }
   
         } catch (error) {
           console.error('Durum güncelleme hatası:', error);
         }
       });
     });
   }

   // Bağlantı kopma işleyicisi
   async handleDisconnection(socket) {
     const userId = socket.userId;
     const userInfo = socket.userInfo;

     console.log(`Kullanıcı bağlantısı koptu: ${userInfo.name} (${userId})`);

     // Kullanıcıyı offline olarak işaretle
     const updatedUser = await this.setUserOnlineStatus(userId, false);

     // Bağlı kullanıcılardan çıkar
     const userConnection = this.connectedUsers.get(userId);
     if (userConnection && updatedUser) {
       // Kullanıcının odalarındaki typing durumunu temizle
       userConnection.rooms.forEach(roomId => {
         this.removeTypingUser(parseInt(roomId), userId);
         
         // Odadaki diğer kullanıcılara offline durumunu bildir
         socket.to(roomId).emit('user-offline', {
           userId: userId,
           userInfo: userInfo,
           last_seen: updatedUser.last_seen,
           timestamp: new Date()
         });
       });

       this.connectedUsers.delete(userId);
     }

     // Tüm kullanıcılara güncel online users listesini gönder
     this.broadcastOnlineUsersList();
   }

   // Yardımcı metodlar
   async getUserRooms(userId) {
     const query = `
       SELECT room_id 
       FROM chat_participants 
       WHERE user_id = ? AND left_at IS NULL
     `;
     const [rooms] = await db.execute(query, [userId]);
     return rooms;
   }

   async checkRoomAccess(userId, roomId) {
     const query = `
       SELECT id 
       FROM chat_participants 
       WHERE room_id = ? AND user_id = ? AND left_at IS NULL
     `;
     const [result] = await db.execute(query, [roomId, userId]);
     return result.length > 0;
   }

   async setUserOnlineStatus(userId, isOnline) {
     try {
       const currentTime = new Date();
       const formattedTime = currentTime.toISOString().slice(0, 19).replace('T', ' ');
       
       await db.execute(
         'UPDATE users SET is_online = ?, last_seen = ? WHERE id = ?',
         [isOnline ? 1 : 0, formattedTime, userId]
       );
       
       // Güncellenmiş kullanıcı bilgisini al
       const [userRows] = await db.execute(
         'SELECT id, name, is_online, last_seen FROM users WHERE id = ?',
         [userId]
       );
       
       return userRows[0] || null;
     } catch (error) {
       console.error('Online durum güncelleme hatası:', error);
       return null;
     }
   }

   removeTypingUser(roomId, userId) {
     if (this.typingUsers.has(roomId)) {
       const typingSet = this.typingUsers.get(roomId);
       typingSet.delete(userId);
       
       if (typingSet.size === 0) {
         this.typingUsers.delete(roomId);
       }

       // Odadaki diğer kullanıcılara bildir
       this.io.to(roomId.toString()).emit('user_typing', {
         userId: userId,
         roomId: roomId,
         isTyping: false
       });
     }
   }

   // Belirli bir kullanıcıya mesaj gönder
   sendToUser(userId, event, data) {
     const userConnection = this.connectedUsers.get(userId);
     if (userConnection) {
       this.io.to(userConnection.socketId).emit(event, data);
       return true;
     }
     return false;
   }

   // Belirli bir odaya mesaj gönder
   sendToRoom(roomId, event, data) {
     this.io.to(roomId.toString()).emit(event, data);
   }

   // Online kullanıcıları getir
   getOnlineUsers() {
     return Array.from(this.connectedUsers.keys());
   }

   // Tüm kullanıcılara online users listesini broadcast et
   broadcastOnlineUsersList() {
     const onlineUserIds = this.getOnlineUsers();
     console.log('📡 Online users listesi broadcast ediliyor:', onlineUserIds);
     
     // Tüm bağlı kullanıcılara gönder
     this.io.emit('online-users-list', {
       onlineUsers: onlineUserIds,
       timestamp: new Date()
     });
   }

   // Belirli bir odadaki online kullanıcıları getir
   getOnlineUsersInRoom(roomId) {
     const onlineUsers = [];
     this.connectedUsers.forEach((connection, userId) => {
       if (connection.rooms.includes(roomId.toString())) {
         onlineUsers.push({
           userId: userId,
           userInfo: connection.userInfo
         });
       }
     });
     return onlineUsers;
   }
}

module.exports = SocketManager;