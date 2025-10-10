-- CV dosyalarını JSON formatında saklamak için cv_dosyasi alanını güncelle
-- Önce mevcut verileri yedekle
CREATE TABLE IF NOT EXISTS cvs_backup AS SELECT * FROM cvs;

-- cv_dosyasi alanını JSON tipine çevir
ALTER TABLE cvs MODIFY COLUMN cv_dosyasi JSON;

-- Mevcut tek dosya verilerini JSON array formatına çevir
UPDATE cvs 
SET cv_dosyasi = JSON_ARRAY(cv_dosyasi) 
WHERE cv_dosyasi IS NOT NULL 
AND cv_dosyasi != '' 
AND JSON_VALID(cv_dosyasi) = 0;