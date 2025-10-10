-- Categories tablosunu düzelt
USE appointment_app;

-- Önce mevcut categories tablosunu kontrol et
SHOW TABLES LIKE 'categories';

-- Eğer categories tablosu varsa yapısını kontrol et
DESCRIBE categories;

-- Önce user_id kolonunu NULL olarak ekle
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS user_id INT NULL AFTER id;

-- Mevcut kayıtlara varsayılan user_id değeri ata (admin kullanıcısı = 1)
UPDATE categories SET user_id = 1 WHERE user_id IS NULL;

-- Şimdi kolonu NOT NULL yap
ALTER TABLE categories 
MODIFY COLUMN user_id INT NOT NULL;

-- Foreign key ve index ekle
ALTER TABLE categories 
ADD CONSTRAINT fk_categories_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE categories 
ADD INDEX idx_user_id (user_id);

-- Unique constraint ekle
ALTER TABLE categories 
ADD CONSTRAINT unique_user_category UNIQUE (user_id, name);

-- Eğer categories tablosu hiç yoksa oluştur
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    alt_kategori VARCHAR(100) DEFAULT '',
    description TEXT,
    color VARCHAR(7) DEFAULT '#4E0DCC',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_name (name),
    UNIQUE KEY unique_user_category (user_id, name)
);

-- Test kategorileri ekle (sadece tablo boşsa)
INSERT IGNORE INTO categories (user_id, name, alt_kategori, description) VALUES
(1, 'GENEL', '', 'Genel kategori'),
(1, 'MÜŞTERİ', '', 'Müşteri kategorisi'),
(1, 'TEDARİKÇİ', '', 'Tedarikçi kategorisi'),
(1, 'TASARIMCI', '', 'Tasarımcı kategorisi'),
(1, 'İŞ ORTAĞI', '', 'İş ortağı kategorisi');

-- Sonucu kontrol et
SELECT 'Categories tablosu başarıyla oluşturuldu/güncellendi' as result;
DESCRIBE categories;