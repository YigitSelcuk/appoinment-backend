-- Departments tablosu oluşturma migration'ı
-- Bu dosyayı veritabanında çalıştırarak departments tablosunu oluşturun

CREATE TABLE `departments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mevcut departmanları ekle
INSERT INTO `departments` (`name`, `description`, `is_active`) VALUES
('Başkanlık', 'Belediye Başkanlığı', 1),
('BİLGİ İŞLEM MÜDÜRLÜĞÜ', 'Bilgi İşlem ve Teknoloji Müdürlüğü', 1),
('HUKUK İŞLERİ MÜDÜRLÜĞÜ', 'Hukuk İşleri Müdürlüğü', 1),
('MALİ HİZMETLER MÜDÜRLÜĞÜ', 'Mali Hizmetler Müdürlüğü', 1),
('İNSAN KAYNAKLARI MÜDÜRLÜĞÜ', 'İnsan Kaynakları Müdürlüğü', 1),
('KÜLTÜR VE SOSYAL İŞLER MÜDÜRLÜĞÜ', 'Kültür ve Sosyal İşler Müdürlüğü', 1),
('FEN İŞLERİ MÜDÜRLÜĞÜ', 'Fen İşleri Müdürlüğü', 1),
('ÇEVRE KORUMA VE KONTROL MÜDÜRLÜĞÜ', 'Çevre Koruma ve Kontrol Müdürlüğü', 1),
('PARK VE BAHÇELER MÜDÜRLÜĞÜ', 'Park ve Bahçeler Müdürlüğü', 1),
('ZABITA MÜDÜRLÜĞÜ', 'Zabıta Müdürlüğü', 1);