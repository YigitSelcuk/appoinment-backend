-- Tasks tablosunu güncelleme scripti
-- Eksik sütunları ekle

USE appointment_app;

-- assignee_name sütunu ekle
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_name VARCHAR(100) AFTER assignee_id;

-- created_by_name sütunu ekle  
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(100) AFTER category;

-- created_by_email sütunu ekle
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by_email VARCHAR(255) AFTER created_by_name;

-- approval sütunu ekle
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approval ENUM('ONAY BEKLİYOR', 'ONAYLANDI', 'REDDEDİLDİ') DEFAULT 'ONAY BEKLİYOR' AFTER priority;

-- notes sütunu ekle
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT AFTER created_by_email;

-- Status ve priority değerlerini güncelle
ALTER TABLE tasks MODIFY COLUMN status ENUM('Beklemede', 'Devam Ediyor', 'Tamamlandı', 'İptal Edildi') DEFAULT 'Beklemede';
ALTER TABLE tasks MODIFY COLUMN priority ENUM('Düşük', 'Normal', 'Yüksek', 'Kritik') DEFAULT 'Normal';

-- due_date sütununu start_date ve end_date olarak ayır (eğer yoksa)
-- due_date sütunu varsa onu start_date olarak kullan
UPDATE tasks SET start_date = DATE(due_date) WHERE start_date IS NULL AND due_date IS NOT NULL;

-- İndeksler ekle
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_name ON tasks(assignee_name);
CREATE INDEX IF NOT EXISTS idx_tasks_approval ON tasks(approval);

SHOW COLUMNS FROM tasks;