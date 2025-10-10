const db = require('../config/database');

// Tüm aktiviteleri getir (sayfalama ile)
const getActivities = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const actionType = req.query.actionType || '';
    const tableName = req.query.tableName || '';

    const userId = req.user?.id || 1;

    // Filtreleme koşulları
    let whereClause = 'WHERE 1=1';
    let queryParams = [];

    // Arama
    if (search) {
      whereClause += ` AND (
        a.user_name LIKE ? OR 
        a.user_email LIKE ? OR 
        a.description LIKE ? OR
        a.table_name LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // İşlem türü filtresi
    if (actionType) {
      whereClause += ` AND a.action_type = ?`;
      queryParams.push(actionType);
    }

    // Tablo adı filtresi
    if (tableName) {
      whereClause += ` AND a.table_name = ?`;
      queryParams.push(tableName);
    }

    // Toplam kayıt sayısını al
    const countQuery = `SELECT COUNT(*) as total FROM activities a ${whereClause}`;
    const [countResult] = await db.execute(countQuery, queryParams);
    const totalRecords = countResult[0].total;
    const totalPages = Math.ceil(totalRecords / limit);

    // Aktiviteleri getir
    const query = `
      SELECT 
        a.*,
        DATE_FORMAT(a.created_at, '%d.%m.%Y %H:%i:%s') as created_at_display
      FROM activities a
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;

    const [activities] = await db.execute(query, queryParams);

    // JSON alanlarını parse et
    const formattedActivities = activities.map(activity => {
      let oldValues = null;
      let newValues = null;
      
      // old_values parse et
      if (activity.old_values) {
        try {
          oldValues = typeof activity.old_values === 'string' 
            ? JSON.parse(activity.old_values) 
            : activity.old_values;
        } catch (error) {
          console.error('old_values parse hatası:', error);
          oldValues = null;
        }
      }
      
      // new_values parse et
      if (activity.new_values) {
        try {
          newValues = typeof activity.new_values === 'string' 
            ? JSON.parse(activity.new_values) 
            : activity.new_values;
        } catch (error) {
          console.error('new_values parse hatası:', error);
          newValues = null;
        }
      }
      
      return {
        ...activity,
        old_values: oldValues,
        new_values: newValues,
        created_at_display: activity.created_at_display
      };
    });

    res.json({
      success: true,
      data: formattedActivities,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords: totalRecords,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Aktiviteler getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Aktiviteler getirilirken hata oluştu',
      error: error.message
    });
  }
};

// Aktivite kaydet
const logActivity = async (userId, userName, userEmail, actionType, tableName, recordId, description, oldValues = null, newValues = null, ipAddress = null, userAgent = null) => {
  try {
    const query = `
      INSERT INTO activities (
        user_id, user_name, user_email, action_type, table_name, record_id, 
        description, old_values, new_values, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      userId,
      userName,
      userEmail,
      actionType,
      tableName,
      recordId,
      description,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      ipAddress,
      userAgent
    ];

    await db.execute(query, values);
    console.log('Aktivite kaydedildi:', description);
  } catch (error) {
    console.error('Aktivite kaydedilemedi:', error);
  }
};

// Aktivite istatistikleri
const getActivityStats = async (req, res) => {
  try {
    const userId = req.user?.id || 1;

    // Son 30 gün içindeki aktivite sayıları
    const statsQuery = `
      SELECT 
        action_type,
        COUNT(*) as count,
        DATE(created_at) as date
      FROM activities 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY action_type, DATE(created_at)
      ORDER BY date DESC
    `;

    const [stats] = await db.execute(statsQuery);

    // Tablo bazında aktivite sayıları
    const tableStatsQuery = `
      SELECT 
        table_name,
        action_type,
        COUNT(*) as count
      FROM activities 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY table_name, action_type
      ORDER BY count DESC
    `;

    const [tableStats] = await db.execute(tableStatsQuery);

    // Kullanıcı bazında aktivite sayıları
    const userStatsQuery = `
      SELECT 
        user_name,
        user_email,
        COUNT(*) as count,
        MAX(created_at) as last_activity
      FROM activities 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY user_id, user_name, user_email
      ORDER BY count DESC
      LIMIT 10
    `;

    const [userStats] = await db.execute(userStatsQuery);

    res.json({
      success: true,
      data: {
        dailyStats: stats,
        tableStats: tableStats,
        userStats: userStats
      }
    });

  } catch (error) {
    console.error('Aktivite istatistikleri getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Aktivite istatistikleri getirilirken hata oluştu',
      error: error.message
    });
  }
};

// Frontend'den aktivite kayıt isteği
const logActivityEndpoint = async (req, res) => {
  try {
    const { action_type, table_name, record_id, description, old_values, new_values } = req.body;
    const userId = req.user?.id || 1;
    const userName = req.user?.name || 'Bilinmeyen Kullanıcı';
    const userEmail = req.user?.email || 'unknown@email.com';
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    if (!action_type || !table_name || !description) {
      return res.status(400).json({
        success: false,
        message: 'action_type, table_name ve description alanları zorunludur'
      });
    }

    await logActivity(
      userId,
      userName,
      userEmail,
      action_type,
      table_name,
      record_id || null,
      description,
      old_values || null,
      new_values || null,
      ipAddress,
      userAgent
    );

    res.json({
      success: true,
      message: 'Aktivite başarıyla kaydedildi'
    });

  } catch (error) {
    console.error('Aktivite kaydedilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Aktivite kaydedilirken hata oluştu',
      error: error.message
    });
  }
};

module.exports = {
  getActivities,
  logActivity,
  logActivityEndpoint,
  getActivityStats
};