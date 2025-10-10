-- CVs tablosundaki durum sütununu ENUM'dan VARCHAR'a çevir
USE appointment_app;

-- Durum sütununu VARCHAR'a çevir
ALTER TABLE cvs MODIFY COLUMN durum VARCHAR(50) DEFAULT 'İŞ ARIYOR';

-- Mevcut verileri kontrol et
SELECT DISTINCT durum FROM cvs;