-- CVS tablosundaki eksik sütunları kontrol et ve ekle

-- Önce mevcut tablo yapısını kontrol et
DESCRIBE cvs;

-- tc_kimlik_no sütunu yoksa ekle
ALTER TABLE cvs 
ADD COLUMN IF NOT EXISTS tc_kimlik_no VARCHAR(11) AFTER user_id;

-- profil_resmi sütunu yoksa ekle (hata mesajında görülen)
ALTER TABLE cvs 
ADD COLUMN IF NOT EXISTS profil_resmi VARCHAR(255) AFTER cv_dosyasi;

-- Diğer eksik olabilecek sütunları kontrol et ve ekle
ALTER TABLE cvs 
ADD COLUMN IF NOT EXISTS ilce VARCHAR(100) AFTER soyadi;

ALTER TABLE cvs 
ADD COLUMN IF NOT EXISTS mahalle VARCHAR(100) AFTER ilce;

ALTER TABLE cvs 
ADD COLUMN IF NOT EXISTS adres TEXT AFTER mahalle;

ALTER TABLE cvs 
ADD COLUMN IF NOT EXISTS talep_edilen_is VARCHAR(255) AFTER adres;

ALTER TABLE cvs 
ADD COLUMN IF NOT EXISTS referans_kisi VARCHAR(100) AFTER email;

ALTER TABLE cvs 
ADD COLUMN IF NOT EXISTS referans_telefon VARCHAR(20) AFTER referans_kisi;

ALTER TABLE cvs 
ADD COLUMN IF NOT EXISTS referans_meslek VARCHAR(150) AFTER referans_telefon;

ALTER TABLE cvs 
ADD COLUMN IF NOT EXISTS referans JSON AFTER referans_meslek;

ALTER TABLE cvs 
ADD COLUMN IF NOT EXISTS is_yonlendirildi ENUM('SEÇİNİZ', 'EVET', 'HAYIR') DEFAULT 'SEÇİNİZ' AFTER referans;

ALTER TABLE cvs 
ADD COLUMN IF NOT EXISTS durum ENUM('İŞ ARIYOR', 'İŞ BULUNDU', 'BEKLEMEDE', 'YETİŞTİRİLDİ', 'İŞLENMEDE', 'GÖLDAĞ', 'DEĞERLENDİRİLİYOR', 'YETİŞTİRİLECEK') DEFAULT 'İŞ ARIYOR' AFTER is_yonlendirildi;

-- İndeksleri ekle
CREATE INDEX IF NOT EXISTS idx_tc_kimlik_no ON cvs(tc_kimlik_no);
CREATE INDEX IF NOT EXISTS idx_adi ON cvs(adi);
CREATE INDEX IF NOT EXISTS idx_soyadi ON cvs(soyadi);
CREATE INDEX IF NOT EXISTS idx_meslek ON cvs(meslek);

-- Güncellenmiş tablo yapısını göster
DESCRIBE cvs;