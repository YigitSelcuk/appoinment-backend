const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/security');
const {
  getCVs,
  getCVById,
  createCV,
  updateCV,
  deleteCV,
  getStatuses,
  downloadCVFile,
  getProfileImage,
  updateCVStatus
} = require('../controllers/cvsController');

// Upload klasörünü oluştur
const uploadDir = path.join(__dirname, '../uploads/cvs');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer konfigürasyonu CV dosyaları için
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'cv_' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // CV dosyası için kabul edilen türler
  const documentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];
  
  // Profil resmi için kabul edilen türler
  const imageTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp'
  ];
  
  if (file.fieldname === 'cv_dosyasi' && documentTypes.includes(file.mimetype)) {
    cb(null, true);
  } else if (file.fieldname === 'profil_resmi' && imageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const errorMsg = file.fieldname === 'profil_resmi' 
      ? 'Geçersiz resim türü. Sadece JPEG, PNG, GIF ve WebP dosyaları kabul edilir.'
      : 'Geçersiz dosya türü. Sadece PDF, Word, Excel ve TXT dosyaları kabul edilir.';
    cb(new Error(errorMsg), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Tüm rotalar authentication gerektiriyor
router.use(authenticateToken);

// GET /api/cvs - Tüm CV'leri getir (sayfalama ve filtreleme ile)
router.get('/', getCVs);

// GET /api/cvs/statuses - Durum listesini getir
router.get('/statuses', getStatuses);

// GET /api/cvs/download/:filename - CV dosyası indir
router.get('/download/:filename', downloadCVFile);

// GET /api/cvs/profile-image/:filename - Profil resmi görüntüle
router.get('/profile-image/:filename', getProfileImage);

// GET /api/cvs/:id - Belirli bir CV'yi getir
router.get('/:id', getCVById);

// POST /api/cvs - Yeni CV ekle
router.post('/', upload.fields([
  { name: 'cv_dosyasi', maxCount: 5 }, // Birden fazla CV dosyası için maxCount artırıldı
  { name: 'profil_resmi', maxCount: 1 }
]), createCV);

// PUT /api/cvs/:id - CV güncelle
router.put('/:id', upload.fields([
  { name: 'cv_dosyasi', maxCount: 1 },
  { name: 'profil_resmi', maxCount: 1 }
]), updateCV);

// DELETE /api/cvs/:id - CV sil
router.delete('/:id', deleteCV);

// PUT /api/cvs/:id/status - CV durumu güncelle
router.put('/:id/status', updateCVStatus);

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Dosya boyutu 10MB\'dan büyük olamaz.'
      });
    }
  }
  
  if (error.message.includes('Geçersiz')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
});

module.exports = router;