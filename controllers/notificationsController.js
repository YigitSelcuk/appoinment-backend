const { promisePool: db } = require('../config/database');

// Bildirim oluştur
exports.createNotification = async (userId, title, message, type = 'info', relatedId = null, relatedType = null) => {
  try {
    const [result] = await db.execute(
      'INSERT INTO notifications (user_id, title, message, type, related_id, related_type) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, title, message, type, relatedId, relatedType]
    );
    return result.insertId;
  } catch (error) {
    console.error('Bildirim oluşturma hatası:', error);
    throw error;
  }
};

// Kullanıcının bildirimlerini getir
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const unreadOnly = req.query.unread_only === 'true';

    // Parametrelerin sayısal olduğundan emin ol
    const safeLimit = Number.isInteger(limit) ? limit : 20;
    const safeOffset = Number.isInteger(offset) ? offset : 0;

    let whereClause = 'WHERE user_id = ?';
    let queryParams = [userId];

    if (unreadOnly) {
      whereClause += ' AND is_read = FALSE';
    }

    // Toplam bildirim sayısını al
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM notifications ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    // Bildirimleri getir
    const [notifications] = await db.execute(
      `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      queryParams
    );

    // Okunmamış bildirim sayısını al
    const [unreadResult] = await db.execute(
      'SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );
    const unreadCount = unreadResult[0].unread_count;

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(total / limit),
          total_items: total,
          items_per_page: limit
        },
        unread_count: unreadCount
      }
    });
  } catch (error) {
    console.error('Bildirimler getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Bildirimler getirilirken bir hata oluştu'
    });
  }
};

// Bildirimi okundu olarak işaretle
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [result] = await db.execute(
      'UPDATE notifications SET is_read = TRUE, read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bildirim bulunamadı'
      });
    }

    res.json({
      success: true,
      message: 'Bildirim okundu olarak işaretlendi'
    });
  } catch (error) {
    console.error('Bildirim güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Bildirim güncellenirken bir hata oluştu'
    });
  }
};

// Tüm bildirimleri okundu olarak işaretle
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await db.execute(
      'UPDATE notifications SET is_read = TRUE, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );

    res.json({
      success: true,
      message: 'Tüm bildirimler okundu olarak işaretlendi'
    });
  } catch (error) {
    console.error('Tüm bildirimleri güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Bildirimler güncellenirken bir hata oluştu'
    });
  }
};

// Bildirimi sil
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [result] = await db.execute(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bildirim bulunamadı'
      });
    }

    res.json({
      success: true,
      message: 'Bildirim silindi'
    });
  } catch (error) {
    console.error('Bildirim silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Bildirim silinirken bir hata oluştu'
    });
  }
};

// Okunmamış bildirim sayısını getir
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const [result] = await db.execute(
      'SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );

    res.json({
      success: true,
      data: {
        unread_count: result[0].unread_count
      }
    });
  } catch (error) {
    console.error('Okunmamış bildirim sayısı getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Okunmamış bildirim sayısı getirilirken bir hata oluştu'
    });
  }
};

// Bildirim türlerine göre getir
exports.getNotificationsByType = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    // Parametrelerin sayısal olduğundan emin ol
    const safeLimit = Number.isInteger(limit) ? limit : 20;
    const safeOffset = Number.isInteger(offset) ? offset : 0;

    // Toplam bildirim sayısını al
    const [countResult] = await db.execute(
      'SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND type = ?',
      [userId, type]
    );
    const total = countResult[0].total;

    // Bildirimleri getir
    const [notifications] = await db.execute(
      `SELECT * FROM notifications WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [userId, type]
    );

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(total / limit),
          total_items: total,
          items_per_page: limit
        }
      }
    });
  } catch (error) {
    console.error('Türe göre bildirimler getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Bildirimler getirilirken bir hata oluştu'
    });
  }
};