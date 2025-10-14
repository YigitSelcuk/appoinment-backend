const db = require('../config/database');
const notificationsController = require('./notificationsController');

// Tüm görevleri getir (sayfalama ve filtreleme ile)
const getTasks = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const priority = req.query.priority || '';
    const assignee = req.query.assignee || '';

    const userId = req.user?.id || 1;

    // Filtreleme koşulları - hem oluşturan hem de atanan kişinin görevlerini getir
    let whereClause = 'WHERE (t.user_id = ? OR t.assignee_id = ?)';
    let queryParams = [userId, userId];

    // Arama
    if (search) {
      whereClause += ` AND (
        t.title LIKE ? OR 
        t.description LIKE ? OR 
        t.assignee_name LIKE ? OR
        t.category LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Durum filtresi
    if (status && status !== 'Hepsi') {
      whereClause += ` AND t.status = ?`;
      queryParams.push(status);
    }

    // Öncelik filtresi
    if (priority) {
      whereClause += ` AND t.priority = ?`;
      queryParams.push(priority);
    }

    // Atanan kişi filtresi
    if (assignee) {
      whereClause += ` AND t.assignee_name LIKE ?`;
      queryParams.push(`%${assignee}%`);
    }

    // Toplam kayıt sayısını al
    const countQuery = `SELECT COUNT(*) as total FROM tasks t ${whereClause}`;
    const [countResult] = await db.execute(countQuery, queryParams);
    const totalRecords = countResult[0].total;
    const totalPages = Math.ceil(totalRecords / limit);

    // Görevleri getir
    const query = `
      SELECT 
        t.*,
        DATE_FORMAT(t.start_date, '%d.%m.%Y') as start_date_display,
        DATE_FORMAT(t.end_date, '%d.%m.%Y') as end_date_display,
        DATE_FORMAT(t.created_at, '%d.%m.%Y %H:%i:%s') as created_at_display,
        u.name as assignee_full_name,
        u.avatar as assignee_avatar,
        CASE 
          WHEN t.user_id = ? THEN 'creator'
          WHEN t.assignee_id = ? THEN 'assignee'
        END as user_role
      FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      ${whereClause}
      ORDER BY 
        CASE t.status 
          WHEN 'Devam Ediyor' THEN 1
          WHEN 'Beklemede' THEN 2  
          WHEN 'Tamamlandı' THEN 3
          WHEN 'İptal Edildi' THEN 4
        END,
        CASE t.priority
          WHEN 'Kritik' THEN 1
          WHEN 'Yüksek' THEN 2
          WHEN 'Normal' THEN 3
          WHEN 'Düşük' THEN 4
        END,
        t.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;

    // userId'yi iki kez ekliyoruz: CASE için ve WHERE koşulu için
    const [tasks] = await db.execute(query, [...queryParams, userId, userId]);

    // Durum sayılarını al - hem oluşturan hem de atanan kişi için
    const statusCountQuery = `
      SELECT 
        status,
        COUNT(*) as count
      FROM tasks t
      WHERE (t.user_id = ? OR t.assignee_id = ?)
      GROUP BY status
    `;
    const [statusCounts] = await db.execute(statusCountQuery, [userId, userId]);

    // Durum sayılarını formatla
    const formattedStatusCounts = {
      'Hepsi': totalRecords,
      'Beklemede': 0,
      'Devam Ediyor': 0,
      'Tamamlandı': 0,
      'İptal Edildi': 0
    };

    statusCounts.forEach(item => {
      formattedStatusCounts[item.status] = item.count;
    });

    res.json({
      success: true,
      data: tasks,
      statusCounts: formattedStatusCounts,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Görevler getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Görevler getirilirken hata oluştu',
      error: error.message
    });
  }
};

// Görev detayını getir
const getTask = async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const userId = req.user?.id || 1;

    const query = `
      SELECT 
        t.*,
        DATE_FORMAT(t.start_date, '%d.%m.%Y') as start_date_display,
        DATE_FORMAT(t.end_date, '%d.%m.%Y') as end_date_display,
        DATE_FORMAT(t.created_at, '%d.%m.%Y %H:%i:%s') as created_at_display,
        u.name as assignee_full_name,
        u.email as assignee_email,
        u.avatar as assignee_avatar,
        CASE 
          WHEN t.user_id = ? THEN 'creator'
          WHEN t.assignee_id = ? THEN 'assignee'
        END as user_role
      FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      WHERE t.id = ? AND (t.user_id = ? OR t.assignee_id = ?)
    `;

    const [tasks] = await db.execute(query, [userId, userId, taskId, userId, userId]);

    if (tasks.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Görev bulunamadı'
      });
    }

    res.json({
      success: true,
      data: tasks[0]
    });

  } catch (error) {
    console.error('Görev detayı getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Görev detayı getirilirken hata oluştu',
      error: error.message
    });
  }
};

// Yeni görev oluştur
const createTask = async (req, res) => {
  try {
    const {
      title,
      description,
      assignee_id,
      assignee_name,
      start_date,
      end_date,
      status = 'Beklemede',
      priority = 'Normal',
      approval = 'ONAY BEKLİYOR',
      category,
      notes
    } = req.body;

    const userId = req.user?.id || 1;
    const userName = req.user?.name || 'Admin User';
    const userEmail = req.user?.email || 'admin@test.com';

    // Gerekli alanları kontrol et
    if (!title || !assignee_name) {
      return res.status(400).json({
        success: false,
        message: 'Görev başlığı ve atanan kişi gereklidir'
      });
    }

    const query = `
      INSERT INTO tasks (
        user_id, title, description, assignee_id, assignee_name,
        start_date, end_date, status, priority, approval, category,
        notes, created_by_name, created_by_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      userId, title, description, assignee_id, assignee_name,
      start_date, end_date, status, priority, approval, category,
      notes, userName, userEmail
    ];

    const [result] = await db.execute(query, values);

    // Atanan kişiye bildirim gönder
    if (assignee_id && assignee_id !== userId) {
      try {
        await notificationsController.createNotification(
          assignee_id,
          'Yeni Görev Atandı',
          `Size yeni bir görev atandı: ${title}`,
          'task_assigned',
          result.insertId,
          'tasks'
        );
        console.log('Görev atama bildirimi gönderildi:', assignee_id);
      } catch (notificationError) {
        console.error('Görev atama bildirimi gönderme hatası:', notificationError);
      }
    }

    // Aktivite kaydet
    const { logActivity } = require('./activitiesController');
    await logActivity(
      userId,
      userName,
      userEmail,
      'CREATE',
      'tasks',
      result.insertId,
      `Yeni görev oluşturuldu: ${title}`,
      null,
      { title, assignee_name, status, priority },
      req.ip,
      req.get('User-Agent')
    );

    res.status(201).json({
      success: true,
      message: 'Görev başarıyla oluşturuldu',
      data: { id: result.insertId }
    });

  } catch (error) {
    console.error('Görev oluşturulurken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Görev oluşturulurken hata oluştu',
      error: error.message
    });
  }
};

// Görev güncelle
const updateTask = async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const userId = req.user?.id || 1;
    const userName = req.user?.name || 'Admin User';
    const userEmail = req.user?.email || 'admin@test.com';

    // Mevcut görevi getir - hem oluşturan hem de atanan kişi erişebilir
    const [existingTasks] = await db.execute(
      'SELECT *, CASE WHEN user_id = ? THEN "creator" WHEN assignee_id = ? THEN "assignee" END as user_role FROM tasks WHERE id = ? AND (user_id = ? OR assignee_id = ?)',
      [userId, userId, taskId, userId, userId]
    );

    if (existingTasks.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Görev bulunamadı'
      });
    }

    const existingTask = existingTasks[0];
    const userRole = existingTask.user_role;
    const updateFields = [];
    const updateValues = [];

    // Tarihleri MySQL formatına çevir
    const convertDateToMySQLFormat = (dateStr) => {
      if (!dateStr) return null;
      const [day, month, year] = dateStr.split('.');
      return `${year}-${month}-${day}`;
    };

    // Güncellenecek alanları belirle - rol bazında yetki kontrolü
    let allowedFields;
    if (userRole === 'creator') {
      // Görev oluşturan tüm alanları düzenleyebilir
      allowedFields = [
        'title', 'description', 'assignee_id', 'assignee_name',
        'status', 'priority', 'approval', 'category', 'notes', 
        'completion_percentage'
      ];
    } else if (userRole === 'assignee') {
      // Atanan kişi sadece belirli alanları düzenleyebilir
      allowedFields = [
        'status', 'completion_percentage', 'notes', 'approval'
      ];
    } else {
      return res.status(403).json({
        success: false,
        message: 'Bu görevi düzenleme yetkiniz yok'
      });
    }

    // Tarihleri ayrı işle
    if (req.body.start_date) {
      updateFields.push('start_date = ?');
      updateValues.push(convertDateToMySQLFormat(req.body.start_date));
    }

    if (req.body.end_date) {
      updateFields.push('end_date = ?');
      updateValues.push(convertDateToMySQLFormat(req.body.end_date));
    }

    // Diğer alanları işle
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(req.body[field]);
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Güncellenecek alan bulunamadı'
      });
    }

    // Güncelleme sorgusu
    updateValues.push(taskId, userId, userId);
    const query = `
      UPDATE tasks 
      SET ${updateFields.join(', ')}
      WHERE id = ? AND (user_id = ? OR assignee_id = ?)
    `;

    await db.execute(query, updateValues);

    // Görev güncellendiğinde bildirim gönder
    // Eğer atanan kişi değiştiyse hem eski hem yeni kişiye bildirim gönder
    if (req.body.assignee_id && req.body.assignee_id !== existingTask.assignee_id) {
      // Yeni atanan kişiye bildirim
      if (req.body.assignee_id !== userId) {
        try {
          await notificationsController.createNotification(
            req.body.assignee_id,
            'Görev Atandı',
            `Size yeni bir görev atandı: ${existingTask.title}`,
            'task_assigned',
            taskId,
            'tasks'
          );
          console.log('Yeni atanan kişiye bildirim gönderildi:', req.body.assignee_id);
        } catch (notificationError) {
          console.error('Yeni atanan kişiye bildirim gönderme hatası:', notificationError);
        }
      }
      
      // Eski atanan kişiye bildirim (eğer varsa)
      if (existingTask.assignee_id && existingTask.assignee_id !== userId) {
        try {
          await notificationsController.createNotification(
            existingTask.assignee_id,
            'Görev Ataması Değişti',
            `${existingTask.title} görevi artık size atanmamış`,
            'task_unassigned',
            taskId,
            'tasks'
          );
          console.log('Eski atanan kişiye bildirim gönderildi:', existingTask.assignee_id);
        } catch (notificationError) {
          console.error('Eski atanan kişiye bildirim gönderme hatası:', notificationError);
        }
      }
    } else {
      // Görev güncellendi ama atanan kişi değişmedi
      // Atanan kişi değişiklik yaptıysa görev oluşturanına bildirim gönder
      if (userRole === 'assignee' && existingTask.user_id !== userId) {
        try {
          await notificationsController.createNotification(
            existingTask.user_id,
            'Görev Güncellendi',
            `Atadığınız görev güncellendi: ${existingTask.title}`,
            'task_updated',
            taskId,
            'tasks'
          );
          console.log('Görev oluşturanına güncelleme bildirimi gönderildi:', existingTask.user_id);
        } catch (notificationError) {
          console.error('Görev oluşturanına bildirim gönderme hatası:', notificationError);
        }
      }
      // Görev oluşturan değişiklik yaptıysa atanan kişiye bildirim gönder
      else if (userRole === 'creator' && existingTask.assignee_id && existingTask.assignee_id !== userId) {
        try {
          await notificationsController.createNotification(
            existingTask.assignee_id,
            'Görev Güncellendi',
            `Size atanan görev güncellendi: ${existingTask.title}`,
            'task_updated',
            taskId,
            'tasks'
          );
          console.log('Atanan kişiye güncelleme bildirimi gönderildi:', existingTask.assignee_id);
        } catch (notificationError) {
          console.error('Güncelleme bildirimi gönderme hatası:', notificationError);
        }
      }
    }

    // Aktivite kaydet
    const { logActivity } = require('./activitiesController');
    await logActivity(
      userId,
      userName,
      userEmail,
      'UPDATE',
      'tasks',
      taskId,
      `Görev güncellendi: ${existingTask.title}`,
      existingTask,
      req.body,
      req.ip,
      req.get('User-Agent')
    );

    res.json({
      success: true,
      message: 'Görev başarıyla güncellendi'
    });

  } catch (error) {
    console.error('Görev güncellenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Görev güncellenirken hata oluştu',
      error: error.message
    });
  }
};

// Görev sil
const deleteTask = async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const userId = req.user?.id || 1;
    const userName = req.user?.name || 'Admin User';
    const userEmail = req.user?.email || 'admin@test.com';

    // Mevcut görevi getir - sadece görev oluşturan silebilir
    const [existingTasks] = await db.execute(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
      [taskId, userId]
    );

    if (existingTasks.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Görev bulunamadı veya silme yetkiniz yok'
      });
    }

    const existingTask = existingTasks[0];

    // Atanan kişiye görev silindi bildirimi gönder
    if (existingTask.assignee_id && existingTask.assignee_id !== userId) {
      try {
        await notificationsController.createNotification(
          existingTask.assignee_id,
          'Görev Silindi',
          `Size atanan görev silindi: ${existingTask.title}`,
          'task_deleted',
          taskId,
          'tasks'
        );
        console.log('Görev silme bildirimi gönderildi:', existingTask.assignee_id);
      } catch (notificationError) {
        console.error('Görev silme bildirimi gönderme hatası:', notificationError);
      }
    }

    // Görevi sil
    await db.execute('DELETE FROM tasks WHERE id = ? AND user_id = ?', [taskId, userId]);

    // Aktivite kaydet
    const { logActivity } = require('./activitiesController');
    await logActivity(
      userId,
      userName,
      userEmail,
      'DELETE',
      'tasks',
      taskId,
      `Görev silindi: ${existingTask.title}`,
      existingTask,
      null,
      req.ip,
      req.get('User-Agent')
    );

    res.json({
      success: true,
      message: 'Görev başarıyla silindi'
    });

  } catch (error) {
    console.error('Görev silinirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Görev silinirken hata oluştu',
      error: error.message
    });
  }
};

// Görev istatistikleri
const getTaskStats = async (req, res) => {
  try {
    const userId = req.user?.id || 1;

    // Durum bazında istatistikler
    const statusStatsQuery = `
      SELECT 
        status,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tasks WHERE user_id = ?), 2) as percentage
      FROM tasks 
      WHERE user_id = ?
      GROUP BY status
    `;

    const [statusStats] = await db.execute(statusStatsQuery, [userId, userId]);

    // Öncelik bazında istatistikler
    const priorityStatsQuery = `
      SELECT 
        priority,
        COUNT(*) as count
      FROM tasks 
      WHERE user_id = ?
      GROUP BY priority
      ORDER BY 
        CASE priority
          WHEN 'Kritik' THEN 1
          WHEN 'Yüksek' THEN 2
          WHEN 'Normal' THEN 3
          WHEN 'Düşük' THEN 4
        END
    `;

    const [priorityStats] = await db.execute(priorityStatsQuery, [userId]);

    // Kategori bazında istatistikler
    const categoryStatsQuery = `
      SELECT 
        category,
        COUNT(*) as count
      FROM tasks 
      WHERE user_id = ? AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
      LIMIT 10
    `;

    const [categoryStats] = await db.execute(categoryStatsQuery, [userId]);

    // Atanan kişi bazında istatistikler
    const assigneeStatsQuery = `
      SELECT 
        assignee_name,
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'Tamamlandı' THEN 1 ELSE 0 END) as completed_tasks,
        ROUND(SUM(CASE WHEN status = 'Tamamlandı' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as completion_rate
      FROM tasks 
      WHERE user_id = ? AND assignee_name IS NOT NULL
      GROUP BY assignee_name
      ORDER BY total_tasks DESC
      LIMIT 10
    `;

    const [assigneeStats] = await db.execute(assigneeStatsQuery, [userId]);

    res.json({
      success: true,
      data: {
        statusStats,
        priorityStats,
        categoryStats,
        assigneeStats
      }
    });

  } catch (error) {
    console.error('Görev istatistikleri getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Görev istatistikleri getirilirken hata oluştu',
      error: error.message
    });
  }
};

// Görev onay durumunu güncelle
const updateTaskApproval = async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { approval } = req.body;
    const userId = req.user?.id || 1;
    const userName = req.user?.name || 'Admin User';
    const userEmail = req.user?.email || 'admin@test.com';

    // Geçerli onay durumları
    const validApprovalStatuses = ['ONAYLANDI', 'REDDEDİLDİ', 'ONAY BEKLİYOR'];
    
    if (!validApprovalStatuses.includes(approval)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz onay durumu'
      });
    }

    // Mevcut görevi kontrol et
    const [existingTasks] = await db.execute(
      'SELECT * FROM tasks WHERE id = ? AND (user_id = ? OR assignee_id = ?)',
      [taskId, userId, userId]
    );

    if (existingTasks.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Görev bulunamadı veya yetkiniz yok'
      });
    }

    const existingTask = existingTasks[0];

    // Onay durumunu güncelle
    await db.execute(
      'UPDATE tasks SET approval = ? WHERE id = ?',
      [approval, taskId]
    );

    // Onay durumu değişikliği bildirimi gönder
    // Atanan kişi onay durumunu değiştirdiyse görev oluşturanına bildirim gönder
    if (existingTask.assignee_id === userId && existingTask.user_id !== userId) {
      try {
        let notificationTitle = 'Görev Onay Durumu Değişti';
        let notificationMessage = `Atadığınız görevin onay durumu değişti: ${existingTask.title} - ${approval}`;
        
        await notificationsController.createNotification(
          existingTask.user_id,
          notificationTitle,
          notificationMessage,
          'task_approval_changed',
          taskId,
          'tasks'
        );
        console.log('Görev oluşturanına onay durumu bildirimi gönderildi:', existingTask.user_id);
      } catch (notificationError) {
        console.error('Görev oluşturanına onay durumu bildirimi gönderme hatası:', notificationError);
      }
    }
    // Görev oluşturan onay durumunu değiştirdiyse atanan kişiye bildirim gönder
    else if (existingTask.user_id === userId && existingTask.assignee_id && existingTask.assignee_id !== userId) {
      try {
        let notificationTitle = 'Görev Onay Durumu Değişti';
        let notificationMessage = `Görevinizin onay durumu değişti: ${existingTask.title} - ${approval}`;
        
        await notificationsController.createNotification(
          existingTask.assignee_id,
          notificationTitle,
          notificationMessage,
          'task_approval_changed',
          taskId,
          'tasks'
        );
        console.log('Atanan kişiye onay durumu bildirimi gönderildi:', existingTask.assignee_id);
      } catch (notificationError) {
        console.error('Atanan kişiye onay durumu bildirimi gönderme hatası:', notificationError);
      }
    }

    // Aktivite kaydet
    const { logActivity } = require('./activitiesController');
    await logActivity(
      userId,
      userName,
      userEmail,
      'UPDATE',
      'tasks',
      taskId,
      `Görev onay durumu güncellendi: ${existingTask.title} - ${approval}`,
      { approval: existingTask.approval },
      { approval },
      req.ip,
      req.get('User-Agent')
    );

    res.json({
      success: true,
      message: 'Onay durumu başarıyla güncellendi'
    });

  } catch (error) {
    console.error('Onay durumu güncellenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Onay durumu güncellenirken hata oluştu',
      error: error.message
    });
  }
};

// Toplu görev silme
const deleteMultipleTasks = async (req, res) => {
  try {
    const { taskIds } = req.body;
    const userId = req.user?.id || 1;
    const userName = req.user?.name || 'Admin User';
    const userEmail = req.user?.email || 'admin@test.com';

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Geçerli görev ID\'leri gerekli'
      });
    }

    // Tüm görevlerin var olup olmadığını ve kullanıcıya ait olup olmadığını kontrol et
    const placeholders = taskIds.map(() => '?').join(',');
    const checkQuery = `SELECT * FROM tasks WHERE id IN (${placeholders}) AND user_id = ?`;
    const [existingTasks] = await db.execute(checkQuery, [...taskIds, userId]);

    if (existingTasks.length !== taskIds.length) {
      return res.status(404).json({
        success: false,
        message: 'Bazı görevler bulunamadı veya silme yetkiniz yok'
      });
    }

    // Atanan kişilere bildirim gönder
    for (const task of existingTasks) {
      if (task.assignee_id && task.assignee_id !== userId) {
        try {
          await notificationsController.createNotification(
            task.assignee_id,
            'Görev Silindi',
            `Size atanan görev silindi: ${task.title}`,
            'task_deleted',
            task.id,
            'tasks'
          );
        } catch (notificationError) {
          console.error('Görev silme bildirimi gönderme hatası:', notificationError);
        }
      }
    }

    // Toplu silme işlemi
    const deleteQuery = `DELETE FROM tasks WHERE id IN (${placeholders}) AND user_id = ?`;
    await db.execute(deleteQuery, [...taskIds, userId]);

    // Her silinen görev için aktivite kaydı
    const { logActivity } = require('./activitiesController');
    for (const task of existingTasks) {
      await logActivity(
        userId,
        userName,
        userEmail,
        'DELETE',
        'tasks',
        task.id,
        `Görev silindi: ${task.title}`,
        task,
        null,
        req.ip,
        req.get('User-Agent')
      );
    }

    res.json({
      success: true,
      message: `${existingTasks.length} görev başarıyla silindi`
    });

  } catch (error) {
    console.error('Toplu görev silinirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Toplu görev silinirken hata oluştu',
      error: error.message
    });
  }
};

module.exports = {
  getTasks,
  getTask,
  createTask,
  updateTask,
  updateTaskApproval,
  deleteTask,
  deleteMultipleTasks,
  getTaskStats
};