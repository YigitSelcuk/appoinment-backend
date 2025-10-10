const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Uploads klasörünü oluştur
const uploadsDir = path.join(__dirname, '../uploads/avatars');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer konfigürasyonu
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Dosya adını benzersiz yap: timestamp_originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `avatar_${uniqueSuffix}${extension}`);
  }
});

// Dosya filtresi
const fileFilter = (req, file, cb) => {
  // Sadece resim dosyalarını kabul et
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Sadece resim dosyaları yüklenebilir'), false);
  }
};

// Multer instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// Multer hata yakalama middleware'i
const handleMulterError = (err, req, res, next) => {
  console.log('Multer error occurred:', err);
  console.log('Request headers:', req.headers);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Dosya boyutu çok büyük (maksimum 5MB)'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Beklenmeyen dosya alanı'
      });
    }
  }
  
  if (err.message && err.message.includes('Sadece resim dosyaları')) {
    return res.status(400).json({
      success: false,
      message: 'Sadece resim dosyaları yüklenebilir'
    });
  }
  
  return res.status(400).json({
    success: false,
    message: 'Dosya yükleme hatası: ' + err.message
  });
};

upload.handleError = handleMulterError;

module.exports = upload;