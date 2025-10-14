const { promisePool: db } = require('../config/database');

// Tüm departmanları getir
const getAllDepartments = async (req, res) => {
  try {
    const [departments] = await db.execute(
      'SELECT id, name, description, is_active, created_at, updated_at FROM departments WHERE is_active = 1 ORDER BY name ASC'
    );

    res.json({
      success: true,
      data: departments
    });
  } catch (error) {
    console.error('Departmanları getirirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Departmanlar getirilemedi',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Yeni departman ekle
const createDepartment = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Departman adı gereklidir'
      });
    }

    // Aynı isimde departman var mı kontrol et
    const [existing] = await db.execute(
      'SELECT id FROM departments WHERE name = ?',
      [name.trim()]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Bu isimde bir departman zaten mevcut'
      });
    }

    const [result] = await db.execute(
      'INSERT INTO departments (name, description) VALUES (?, ?)',
      [name.trim(), description || null]
    );

    const [newDepartment] = await db.execute(
      'SELECT id, name, description, is_active, created_at, updated_at FROM departments WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Departman başarıyla oluşturuldu',
      data: newDepartment[0]
    });
  } catch (error) {
    console.error('Departman oluştururken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Departman oluşturulamadı',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Departman güncelle
const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_active } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Departman adı gereklidir'
      });
    }

    // Departman var mı kontrol et
    const [existing] = await db.execute(
      'SELECT id FROM departments WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Departman bulunamadı'
      });
    }

    // Aynı isimde başka departman var mı kontrol et
    const [nameCheck] = await db.execute(
      'SELECT id FROM departments WHERE name = ? AND id != ?',
      [name.trim(), id]
    );

    if (nameCheck.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Bu isimde bir departman zaten mevcut'
      });
    }

    await db.execute(
      'UPDATE departments SET name = ?, description = ?, is_active = ? WHERE id = ?',
      [name.trim(), description || null, is_active !== undefined ? is_active : 1, id]
    );

    const [updatedDepartment] = await db.execute(
      'SELECT id, name, description, is_active, created_at, updated_at FROM departments WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Departman başarıyla güncellendi',
      data: updatedDepartment[0]
    });
  } catch (error) {
    console.error('Departman güncellerken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Departman güncellenemedi',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Departman sil (soft delete)
const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    // Departman var mı kontrol et
    const [existing] = await db.execute(
      'SELECT id, name FROM departments WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Departman bulunamadı'
      });
    }

    // Bu departmana ait kullanıcı var mı kontrol et
    const [users] = await db.execute(
      'SELECT COUNT(*) as count FROM users WHERE department = ?',
      [existing[0].name]
    );

    if (users[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Bu departmana ait kullanıcılar bulunduğu için silinemez'
      });
    }

    // Soft delete
    await db.execute(
      'UPDATE departments SET is_active = 0 WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Departman başarıyla silindi'
    });
  } catch (error) {
    console.error('Departman silerken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Departman silinemedi',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Tek departman getir
const getDepartmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const [department] = await db.execute(
      'SELECT id, name, description, is_active, created_at, updated_at FROM departments WHERE id = ?',
      [id]
    );

    if (department.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Departman bulunamadı'
      });
    }

    res.json({
      success: true,
      data: department[0]
    });
  } catch (error) {
    console.error('Departman getirirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Departman getirilemedi',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getAllDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentById
};