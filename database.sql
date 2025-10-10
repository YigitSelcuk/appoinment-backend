-- Veritabanı oluştur
CREATE DATABASE IF NOT EXISTS appointment_app;
USE appointment_app;

-- Kullanıcılar tablosu
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('patient', 'doctor', 'admin', 'başkan') DEFAULT 'patient',
    phone VARCHAR(20),
    address TEXT,
    bio TEXT,
    avatar VARCHAR(255),
    department VARCHAR(255),
    is_online BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Rehber tablosu
CREATE TABLE IF NOT EXISTS contacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    tc_no VARCHAR(11),
    name VARCHAR(100) NOT NULL,
    surname VARCHAR(100) NOT NULL,
    phone1 VARCHAR(20) NOT NULL,
    phone2 VARCHAR(20),
    email VARCHAR(255),
    category VARCHAR(50) NOT NULL DEFAULT 'GENEL',
    title VARCHAR(100),
    district VARCHAR(100),
    address TEXT,
    notes TEXT,
    avatar VARCHAR(255),
    gender ENUM('ERKEK', 'KADIN') DEFAULT 'ERKEK',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_name (name),
    INDEX idx_surname (surname),
    INDEX idx_category (category),
    INDEX idx_tc_no (tc_no)
);

-- CV tablosu
CREATE TABLE IF NOT EXISTS cvs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    tc_kimlik_no VARCHAR(11),
    kayit_tarihi DATE NOT NULL,
    adi VARCHAR(100) NOT NULL,
    soyadi VARCHAR(100) NOT NULL,
    ilce VARCHAR(100),
    mahalle VARCHAR(100),
    adres TEXT,
    talep_edilen_is VARCHAR(255),
    meslek VARCHAR(150) NOT NULL,
    telefon VARCHAR(20),
    email VARCHAR(255),
    referans_kisi VARCHAR(100),
    referans_telefon VARCHAR(20),
    referans_meslek VARCHAR(150),
    referans JSON,
    is_yonlendirildi ENUM('SEÇİNİZ', 'EVET', 'HAYIR') DEFAULT 'SEÇİNİZ',
    durum ENUM('İŞ ARIYOR', 'İŞ BULUNDU', 'BEKLEMEDE', 'YETİŞTİRİLDİ', 'İŞLENMEDE', 'GÖLDAĞ', 'DEĞERLENDİRİLİYOR', 'YETİŞTİRİLECEK') DEFAULT 'İŞ ARIYOR',
    cv_dosyasi VARCHAR(255),
    notlar TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_tc_kimlik_no (tc_kimlik_no),
    INDEX idx_adi (adi),
    INDEX idx_soyadi (soyadi),
    INDEX idx_meslek (meslek),
    INDEX idx_durum (durum),
    INDEX idx_kayit_tarihi (kayit_tarihi),
    INDEX idx_ilce (ilce),
    INDEX idx_is_yonlendirildi (is_yonlendirildi)
);

-- Not: Mevcut veritabanını güncellemek için database_update.sql dosyasını kullanın

-- Test kullanıcıları ekle
INSERT INTO users (name, email, password, role, department) VALUES 
('Admin User', 'admin@test.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 'BİLGİ İŞLEM MÜDÜRLÜĞÜ'),
('Dr. Ahmet Yılmaz', 'doctor@test.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'doctor', 'SAĞLIK MÜDÜRLÜĞÜ'),
('Hasta User', 'patient@test.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'patient', NULL),
('Başkan', 'baskan@test.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'başkan', 'BAŞKAN');

-- Test rehber kayıtları ekle
INSERT INTO contacts (user_id, name, surname, phone1, phone2, category, title, district, gender) VALUES
(1, 'YAKUP', 'YILMAZ', '0533 236 65 66', '0212 456 78 90', 'TASARIMCI', 'SULTANGAZİ İŞ ADAMLARI', 'İsmetpaşa', 'ERKEK'),
(1, 'AYŞE', 'KAYA', '0534 567 89 12', '0216 345 67 89', 'MÜŞTERİ', 'KAYA İNŞAAT', 'Kadıköy', 'KADIN'),
(1, 'MEHMET', 'ÖZTÜRK', '0535 678 90 23', '0212 234 56 78', 'TEDARİKÇİ', 'ÖZTÜRK TİCARET', 'Şişli', 'ERKEK'),
(1, 'FATMA', 'DEMİR', '0536 789 01 34', '0216 123 45 67', 'DOKTOR', 'ÖZEL SAĞLIK', 'Üsküdar', 'KADIN'),
(1, 'ALİ', 'ÇELIK', '0537 890 12 45', '0212 987 65 43', 'AVUKAT', 'ÇELIK HUKUK', 'Beşiktaş', 'ERKEK'),
(1, 'ZEYNEP', 'ARSLAN', '0538 901 23 56', '0216 876 54 32', 'MİMAR', 'ARSLAN MİMARLIK', 'Maltepe', 'KADIN'),
(1, 'HASAN', 'KURT', '0539 012 34 67', '0212 765 43 21', 'MÜHENDİS', 'KURT İNŞAAT', 'Bakırköy', 'ERKEK'),
(1, 'AYŞEGÜL', 'YILDIZ', '0540 123 45 78', '0216 654 32 10', 'ÖĞRETMEN', 'YILDIZ EĞİTİM', 'Kartal', 'KADIN'),
(1, 'MUSTAFA', 'ŞAHIN', '0541 234 56 89', '0212 543 21 09', 'BERBER', 'ŞAHIN KUAFÖR', 'Fatih', 'ERKEK'),
(1, 'SEDA', 'GÜNEŞ', '0542 345 67 90', '0216 432 10 98', 'ECZACI', 'GÜNEŞ ECZANE', 'Pendik', 'KADIN'),
(1, 'OĞUZ', 'KAPLAN', '0543 456 78 01', '0212 321 09 87', 'ŞOFÖR', 'KAPLAN ULAŞIM', 'Zeytinburnu', 'ERKEK'),
(1, 'PINAR', 'KOÇAK', '0544 567 89 12', '0216 210 98 76', 'HEMŞİRE', 'KOÇAK SAĞLIK', 'Ataşehir', 'KADIN'),
(1, 'BERK', 'YAMAN', '0545 678 90 23', '0212 109 87 65', 'MÜZİSYEN', 'YAMAN MÜZİK', 'Beyoğlu', 'ERKEK'),
(1, 'ELIF', 'ÖZKAN', '0546 789 01 34', '0216 098 76 54', 'PAZARLAMA', 'ÖZKAN REKLAM', 'Bostancı', 'KADIN');

-- Kategoriler tablosu
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

-- Test kategorileri ekle
INSERT INTO categories (user_id, name, alt_kategori, description) VALUES
(1, 'MÜŞTERİLER', '', 'Müşteri kayıtları'),
(1, 'TEDARİKÇİLER VE ANLAŞMALI', '', 'Tedarikçi ve anlaşmalı firmalar'),
(1, 'SERVİSLER', '', 'Servis hizmetleri'),
(1, 'PERSONEL', '', 'Şirket personeli'),
(1, 'DEVLET DAİRELERİ', '', 'Resmi kurumlar'),
(1, 'BANKALAR', '', 'Banka iletişim bilgileri'),
(1, 'SİGORTA ŞİRKETLERİ', '', 'Sigorta firmaları'),
(1, 'DOKTORLAR', '', 'Sağlık profesyonelleri'),
(1, 'AVUKATLAR', '', 'Hukuk danışmanları'),
(1, 'MÜHENDİSLER', '', 'Mühendislik hizmetleri'),
(1, 'ÖĞRETMENLER', '', 'Eğitim sektörü'),
(1, 'İNŞAAT FİRMALARI', '', 'İnşaat ve yapı sektörü'),
(1, 'EMLAKÇILAR', '', 'Emlak danışmanları'),
(1, 'DİĞER', '', 'Diğer kategoriler');

-- SMS Mesajları tablosu
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    list_name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    send_date DATE,
    send_time TIME,
    recipient_count INT DEFAULT 0,
    delivered_count INT DEFAULT 0,
    read_count INT DEFAULT 0,
    status ENUM('Gönderildi', 'Beklemede', 'İptal Edildi', 'Zamanlandı') DEFAULT 'Beklemede',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_list_name (list_name),
    INDEX idx_title (title),
    INDEX idx_status (status),
    INDEX idx_send_date (send_date)
);

-- Test SMS mesajları ekle
INSERT INTO messages (user_id, list_name, title, content, send_date, send_time, recipient_count, delivered_count, read_count, status) VALUES
(1, 'MUTLULUK', 'Mutluluk Mesajı', 'Hayatınızın en güzel anlarını yaşamanız dileğiyle...', '2020-12-01', '16:00:00', 12, 12, 8, 'Gönderildi'),
(1, 'SEÇENEKLER İÇİN MAİLLER', 'Yeni Seçenekler Duyurusu', 'Yeni ürün seçeneklerimiz hakkında bilgi almak için...', '2020-12-01', '16:00:00', 5106, 5098, 4523, 'Gönderildi'),
(1, 'SEÇENEKLER GİYİM TÜM MAĞAZALAR', 'Giyim Kampanyası', 'Tüm mağazalarımızda büyük indirim fırsatları...', NULL, NULL, 4837, 0, 0, 'Beklemede'),
(1, 'YENİ YILBAŞI KAMPANYASI', 'Yılbaşı Hediye Çeki', 'Yeni yıla özel hediye çeklerimiz hazır!', '2023-12-25', '10:00:00', 2500, 2487, 1890, 'Gönderildi'),
(1, 'DOĞUM GÜNÜ LİSTESİ', 'Doğum Günü Kutlaması', 'Doğum gününüz kutlu olsun! Size özel indirimlerimiz var.', '2023-11-15', '09:30:00', 156, 154, 132, 'Gönderildi'),
(1, 'BAHAR KOLEKSIYONU', 'Bahar İndirimleri', 'Bahar koleksiyonumuzda %50\'ye varan indirimler başladı!', '2024-03-20', '14:15:00', 3200, 0, 0, 'Zamanlandı'),
(1, 'ACİL DUYURU', 'Sistem Bakımı', 'Sistemimiz bu gece 02:00-04:00 arası bakımda olacaktır.', '2023-10-10', '18:00:00', 890, 885, 820, 'Gönderildi'),
(1, 'PROMOSYON LİSTESİ', 'Hafta Sonu Fırsatları', 'Hafta sonu boyunca geçerli özel fırsatlarımız!', NULL, NULL, 1250, 0, 0, 'İptal Edildi');

-- Talepler tablosu
CREATE TABLE IF NOT EXISTS requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    tc_no VARCHAR(11),
    ad VARCHAR(100) NOT NULL,
    soyad VARCHAR(100) NOT NULL,
    ilce VARCHAR(100),
    mahalle VARCHAR(100),
    adres TEXT,
    telefon VARCHAR(20),
    talep_durumu ENUM('SEÇİNİZ', 'KRİTİK', 'NORMAL', 'DÜŞÜK') DEFAULT 'SEÇİNİZ',
    talep_turu VARCHAR(255) DEFAULT 'ARIZA TALEBİNİN GİDERİLMESİ',
    ilgili_mudurluk VARCHAR(255) DEFAULT 'BİLGİ İŞLEM MÜDÜRLÜĞÜ',
    talep_basligi VARCHAR(255),
    aciklama TEXT,
    durum ENUM('DÜŞÜK', 'NORMAL', 'ACİL', 'ÇOK ACİL', 'KRİTİK', 'TAMAMLANDI', 'İPTAL EDİLDİ') DEFAULT 'DÜŞÜK',
    created_by_name VARCHAR(255),
    created_by_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_tc_no (tc_no),
    INDEX idx_ad (ad),
    INDEX idx_soyad (soyad),
    INDEX idx_talep_durumu (talep_durumu),
    INDEX idx_durum (durum),
    INDEX idx_created_at (created_at)
);

-- Test talep kayıtları ekle
INSERT INTO requests (user_id, tc_no, ad, soyad, ilce, mahalle, adres, telefon, talep_durumu, talep_turu, ilgili_mudurluk, talep_basligi, aciklama, durum, created_by_name, created_by_email) VALUES
(1, '12345678901', 'YAKUP', 'YILMAZ', 'SULTANGAZI', 'İSMETPAŞA', 'Test Mahallesi Test Sokak No:1', '0533 236 65 66', 'KRİTİK', 'ARIZA TALEBİNİN GİDERİLMESİ', 'BİLGİ İŞLEM MÜDÜRLÜĞÜ', 'İnternet Bağlantı Sorunu', 'Evimde internet bağlantısı kesildi, acil çözüm gerekiyor.', 'BEKLEMEDE', 'Admin User', 'admin@test.com'),
(1, '98765432109', 'AYŞE', 'KAYA', 'BAŞAKŞEHIR', 'BAŞAK MAH', 'Başak Mahallesi 2. Cadde No:15', '0534 567 89 12', 'NORMAL', 'YENİ HİZMET TALEBİ', 'KÜLTÜR VE SOSYAL İŞLER MÜDÜRLÜĞÜ', 'Sosyal Tesis Talebim', 'Mahallemize yeni bir park yapılması talebi.', 'İŞLEMDE', 'Admin User', 'admin@test.com'),
(1, '11223344556', 'MEHMET', 'ÖZTÜRK', 'EYÜPSULTAN', 'AKŞEMSETTIN MAH', 'Akşemsettin Mah. 5. Sokak No:8', '0535 678 90 23', 'DÜŞÜK', 'BİLGİ TALEBİ', 'FEN İŞLERİ MÜDÜRLÜĞÜ', 'Yol Çalışması Bilgisi', 'Sokağımızdaki yol çalışması ne zaman bitecek?', 'TAMAMLANDI', 'Admin User', 'admin@test.com');

-- Not: Yukarıdaki şifreler 'password' kelimesinin hash'idir 

-- Aktivite/İşlem Geçmişi tablosu
CREATE TABLE IF NOT EXISTS activities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    action_type ENUM('CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT') NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id INT,
    description TEXT NOT NULL,
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_action_type (action_type),
    INDEX idx_table_name (table_name),
    INDEX idx_record_id (record_id),
    INDEX idx_created_at (created_at)
);

-- Test aktivite kayıtları ekle

-- Randevular tablosu
CREATE TABLE IF NOT EXISTS appointments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    attendee_id INT,
    description TEXT,
    color VARCHAR(7) DEFAULT '#3C02AA',
    location VARCHAR(255),
    notification_email BOOLEAN DEFAULT FALSE,
    notification_sms BOOLEAN DEFAULT FALSE,
    status ENUM('SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED') DEFAULT 'SCHEDULED',
    type ENUM('MEETING', 'APPOINTMENT', 'EVENT', 'CALL') DEFAULT 'MEETING',
    priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') DEFAULT 'MEDIUM',
    reminder_value INT DEFAULT 15,
    reminder_unit ENUM('MINUTES', 'HOURS', 'DAYS') DEFAULT 'MINUTES',
    google_event_id VARCHAR(255) NULL,
    source ENUM('SYSTEM', 'GOOGLE') DEFAULT 'SYSTEM',
    visible_to_all BOOLEAN DEFAULT FALSE,
    visible_to_users JSON,
    invitees JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (attendee_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_attendee_id (attendee_id),
    INDEX idx_date (date),
    INDEX idx_start_time (start_time),
    INDEX idx_status (status),
    INDEX idx_type (type),
    INDEX idx_priority (priority),
    INDEX idx_google_event_id (google_event_id)
);

-- Randevu hatırlatmaları tablosu
CREATE TABLE IF NOT EXISTS appointment_reminders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT NOT NULL,
    reminder_time DATETIME NOT NULL,
    status ENUM('scheduled', 'sent', 'failed', 'cancelled') DEFAULT 'scheduled',
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    INDEX idx_appointment_id (appointment_id),
    INDEX idx_reminder_time (reminder_time),
    INDEX idx_status (status)
);

-- Test randevu kayıtları ekle
INSERT INTO appointments (user_id, title, date, start_time, end_time, attendee_id, description, color, status) VALUES
(1, 'Bilgi İşlem Müdürlüğü Sunum', '2024-01-22', '09:00:00', '11:30:00', 2, 'Yeni sistem sunumu', '#29CC39', 'SCHEDULED'),
(1, 'Fen İşleri Müdürlüğü koordinasyon toplantısı', '2024-01-22', '11:00:00', '12:00:00', 2, 'Koordinasyon toplantısı', '#FF6633', 'SCHEDULED'),
(1, 'Muhtarlar Toplantısı', '2024-01-23', '10:00:00', '11:00:00', 3, 'Aylık muhtarlar toplantısı', '#FF6633', 'SCHEDULED'),
(1, 'İl meclis Üyesi Toplantısı', '2024-01-23', '11:00:00', '12:30:00', 3, 'İl meclis görüşmesi', '#FFCB33', 'SCHEDULED'),
(1, 'Hizmet Tesisi Programı', '2024-01-24', '13:00:00', '14:00:00', 2, 'Hizmet tesisi açılışı', '#33BFFF', 'SCHEDULED'),
(1, 'Belediye Açılış Tesisleri', '2024-01-25', '11:00:00', '14:00:00', 3, 'Yeni tesis açılışları', '#FF8C33', 'SCHEDULED'),
(1, 'Sultangazi Gastronomi Programı', '2024-01-25', '15:00:00', '17:30:00', 3, 'Gastronomi etkinliği', '#E62E7B', 'SCHEDULED'),
(1, 'Sultangazi Federasyonu Programı', '2024-01-25', '17:00:00', '19:00:00', 2, 'Federasyon toplantısı', '#33BFFF', 'SCHEDULED'),
(1, 'Ankara Külliye Programı', '2024-01-26', '11:00:00', '14:00:00', 3, 'Külliye ziyareti', '#2EE6CA', 'SCHEDULED');
INSERT INTO activities (user_id, user_name, user_email, action_type, table_name, record_id, description, ip_address) VALUES
(1, 'Admin User', 'admin@test.com', 'LOGIN', 'users', 1, 'Kullanıcı sisteme giriş yaptı', '192.168.1.1'),
(1, 'Admin User', 'admin@test.com', 'CREATE', 'contacts', 1, 'Yeni kişi eklendi: YAKUP YILMAZ', '192.168.1.1'),
(1, 'Admin User', 'admin@test.com', 'UPDATE', 'contacts', 1, 'Kişi bilgileri güncellendi: YAKUP YILMAZ', '192.168.1.1'),
(1, 'Admin User', 'admin@test.com', 'CREATE', 'messages', 1, 'Yeni mesaj gönderildi: Mutluluk Mesajı', '192.168.1.1'),
(1, 'Admin User', 'admin@test.com', 'CREATE', 'requests', 1, 'Yeni talep oluşturuldu: İnternet Bağlantı Sorunu', '192.168.1.1'),
(1, 'Admin User', 'admin@test.com', 'UPDATE', 'requests', 3, 'Talep durumu güncellendi: TAMAMLANDI', '192.168.1.1');

-- Tasks tablosu
CREATE TABLE IF NOT EXISTS tasks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assignee_id INT,
    assignee_name VARCHAR(100),
    start_date DATE,
    end_date DATE,
    status ENUM('Beklemede', 'Devam Ediyor', 'Tamamlandı', 'İptal Edildi') DEFAULT 'Beklemede',
    priority ENUM('Düşük', 'Normal', 'Yüksek', 'Kritik') DEFAULT 'Normal',
    approval ENUM('ONAY BEKLİYOR', 'ONAYLANDI', 'REDDEDİLDİ') DEFAULT 'ONAY BEKLİYOR',
    category VARCHAR(100),
    notes TEXT,
    created_by_name VARCHAR(100),
    created_by_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tasks tablosu için indeksler
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_start_date ON tasks(start_date);
CREATE INDEX idx_tasks_end_date ON tasks(end_date);

-- Chat Odaları tablosu
CREATE TABLE IF NOT EXISTS chat_rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by INT NOT NULL,
    participant_id INT,
    is_group BOOLEAN DEFAULT FALSE,
    avatar VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_private_chat (created_by, participant_id)
);

-- Chat Odası Katılımcıları tablosu
CREATE TABLE IF NOT EXISTS chat_room_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('admin', 'member') DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_online BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_room_user (room_id, user_id),
    INDEX idx_room_id (room_id),
    INDEX idx_user_id (user_id),
    INDEX idx_is_online (is_online)
);

-- Chat Mesajları tablosu
CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    sender_id INT NOT NULL,
    message TEXT NOT NULL,
    message_type ENUM('text', 'image', 'file', 'system') DEFAULT 'text',
    file_url VARCHAR(500),
    file_name VARCHAR(255),
    file_size INT,
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMP NULL,
    reply_to_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reply_to_id) REFERENCES chat_messages(id) ON DELETE SET NULL,
    INDEX idx_room_id (room_id),
    INDEX idx_sender_id (sender_id),
    INDEX idx_created_at (created_at),
    INDEX idx_reply_to_id (reply_to_id)
);

-- Mesaj Okunma Durumu tablosu
CREATE TABLE IF NOT EXISTS message_read_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    user_id INT NOT NULL,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_message_user (message_id, user_id),
    INDEX idx_message_id (message_id),
    INDEX idx_user_id (user_id)
);

-- Test chat odaları ekle
INSERT INTO chat_rooms (name, description, created_by, is_group) VALUES
('Genel Sohbet', 'Genel sohbet odası', 1, TRUE),
('Proje Ekibi', 'Proje ekibi için özel oda', 1, TRUE),
('Duyurular', 'Önemli duyurular için', 1, TRUE);

-- Test chat odası katılımcıları ekle
INSERT INTO chat_room_participants (room_id, user_id, role, is_online) VALUES
(1, 1, 'admin', TRUE),
(1, 2, 'member', TRUE),
(1, 3, 'member', FALSE),
(2, 1, 'admin', TRUE),
(2, 2, 'member', TRUE),
(3, 1, 'admin', TRUE);

-- Test chat mesajları ekle
INSERT INTO chat_messages (room_id, sender_id, message, message_type) VALUES
(1, 1, 'Merhaba herkese! Yeni mesajlaşma sistemi aktif.', 'text'),
(1, 2, 'Harika! Çok güzel görünüyor.', 'text'),
(1, 1, 'Teşekkürler! Daha fazla özellik ekleyeceğiz.', 'text'),
(2, 1, 'Proje toplantısı yarın saat 14:00\'da.', 'text'),
(2, 2, 'Tamam, hazır olacağım.', 'text'),
(3, 1, 'Sistem bakımı bu gece 02:00-04:00 arası yapılacak.', 'text');

-- Chat Ayarları tablosu - Kullanıcıların chat ayarlarını yönetir
CREATE TABLE IF NOT EXISTS chat_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    contact_user_id INT NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_muted BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    pinned_at TIMESTAMP NULL,
    muted_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_contact (user_id, contact_user_id),
    INDEX idx_user_id (user_id),
    INDEX idx_contact_user_id (contact_user_id),
    INDEX idx_is_pinned (is_pinned),
    INDEX idx_is_muted (is_muted),
    INDEX idx_is_deleted (is_deleted)
); 

-- SMS gönderim logları tablosu
CREATE TABLE IF NOT EXISTS sms_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone_number VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    list_name VARCHAR(255) NOT NULL,
    sending_title VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255) DEFAULT '',
    contact_category VARCHAR(100) DEFAULT '',
    status ENUM('sent', 'failed', 'pending') NOT NULL DEFAULT 'pending',
    response_data TEXT NULL,
    error_message TEXT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_phone_number (phone_number),
    INDEX idx_status (status),
    INDEX idx_sent_at (sent_at),
    INDEX idx_list_name (list_name)
);

-- Bildirimler tablosu
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('cv_added', 'cv_updated', 'cv_deleted', 'appointment_created', 'appointment_updated', 'appointment_reminder', 'task_assigned', 'message_received', 'system', 'info', 'success', 'warning', 'error') NOT NULL DEFAULT 'info',
    related_id INT NULL,
    related_table VARCHAR(50) NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_type (type),
    INDEX idx_is_read (is_read),
    INDEX idx_created_at (created_at),
    INDEX idx_related_id (related_id)
); 

-- CV Sample Data (user_id = 1 için)
INSERT INTO cvs (user_id, kayit_tarihi, adi, soyadi, meslek, referans, email, telefon, referans_kisi, durum, notlar) VALUES
(1, '2024-01-01', 'ÖMER', 'GÖK', 'BAŞKAN ASISTANI', '0533 236 66 64', 'omergok@sultangazibelediyesi.tr', '0555 123 45 67', 'AHMET YILMAZ', 'İŞ ARIYOR', 'Deneyimli başkan asistanı'),
(1, '2024-01-01', 'OSMAN', 'SEVİL', 'BİLGİ İŞLEM', '0533 236 66 64', 'osmansevil@sultangazibelediyesi.tr', '0555 234 56 78', 'MEHMET CAN', 'İŞ BULUNDU', 'IT alanında uzman'),
(1, '2024-01-01', 'MELİH', 'AYDIN', 'BAŞKAN ASISTANI', '0533 236 66 64', 'melih@sultangazibelediyesi.tr', '0555 345 67 89', 'AYHAN YİĞİT', 'YETİŞTİRİLDİ', 'Yönetim deneyimi var'),
(1, '2024-01-01', 'BİROL', 'BANZAROĞLU', 'BİLGİSAYAR TEKNİSYENİ', '0533 236 66 64', 'birolbanzaroglu@sultangazibelediyesi.tr', '0555 456 78 90', 'MURAT YILDIRIM', 'İŞ BULUNDU', 'Donanım konusunda uzman'),
(1, '2024-01-01', 'AYHAN', 'YILMAZ', 'BİLGİSAYAR TEKNİSYENİ', '0533 236 66 64', 'ayhanyilmaz@sultangazibelediyesi.tr', '0555 567 89 01', 'YAŞAR KARA', 'BEKLEMEDE', 'Yazılım geliştirme deneyimi'),
(1, '2024-01-01', 'YAŞAR', 'AKBAŞ', 'SUNUCU YÖNETİCİSİ', '0533 236 66 64', 'yasarakbas@sultangazibelediyesi.tr', '0555 678 90 12', 'ENGİN ÖZDEMİR', 'İŞLENMEDE', 'Sistem yönetimi konusunda deneyimli'),
(1, '2024-01-01', 'MESUT', 'BİLGİN', 'BİLGİSAYAR İŞLETMENİ', '0533 236 66 64', 'mesutbilgin@sultangazibelediyesi.tr', '0555 789 01 23', 'ZEYNEP GÜLER', 'İŞLENMEDE', 'Veri analizi konusunda tecrübeli'),
(1, '2024-01-01', 'MESUT', 'ÇALIŞKAN', 'BİLGİSAYAR MÜHENDİSİ', '0533 236 66 64', 'mesutcaliskan@sultangazibelediyesi.tr', '0555 890 12 34', 'ELİF KARAHAN', 'GÖLDAĞ', 'Proje yönetimi deneyimi'),
(1, '2024-01-01', 'AHMET', 'ÖZDEMİR', 'BİLGİSAYAR MÜHENDİSİ', '0533 236 66 64', 'ahmetozdemir@gmail.com', '0555 901 23 45', 'BERKAY YILDIZ', 'DEĞERLENDİRİLİYOR', 'Mobil uygulama geliştirici'),
(1, '2024-01-01', 'MEHMET', 'YILMAZ', 'ŞOFÖR', '0533 236 66 64', 'mehmetyilmaz@gmail.com', '0555 012 34 56', 'İREM KOCAMAN', 'YETİŞTİRİLECEK', 'B sınıfı ehliyet sahibi'),
(1, '2024-01-01', 'AHMET', 'KARADENİZ', 'TEKNİK SERVİS', '0533 236 66 64', 'ahmetkaradeniz@gmail.com', '0555 123 45 67', 'ONUR ŞAHİN', 'YETİŞTİRİLDİ', 'Elektrik elektronik teknisyeni'),
(1, '2024-01-02', 'FATİH', 'ÖZTÜRK', 'GRAFİK TASARIMCI', '0533 987 65 43', 'fatih.ozturk@gmail.com', '0555 234 56 78', 'SEDA KAYA', 'İŞ ARIYOR', 'Adobe programlarında uzman'),
(1, '2024-01-02', 'ZEYNEP', 'KORKMAZ', 'İNSAN KAYNAKLARI', '0533 876 54 32', 'zeynep.korkmaz@outlook.com', '0555 345 67 89', 'OĞUZ DEMİR', 'BEKLEMEDE', 'İK süreçlerinde deneyimli'),
(1, '2024-01-03', 'MUSTAFA', 'GÜVEN', 'MİMAR', '0533 765 43 21', 'mustafa.guven@gmail.com', '0555 456 78 90', 'DİLEK YILMAZ', 'İŞ ARIYOR', 'AutoCAD ve 3D Max kullanımı'),
(1, '2024-01-03', 'ELİF', 'DOĞAN', 'MUHASEBECİ', '0533 654 32 10', 'elif.dogan@hotmail.com', '0555 567 89 01', 'KEMAL AKSU', 'İŞLENMEDE', 'Bordro ve SGK işlemleri');