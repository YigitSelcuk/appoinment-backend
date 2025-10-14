# PM2 Kurulum ve Yönetim Komutları

## 🚀 PM2 Kurulumu

### Global PM2 Kurulumu
```bash
npm install -g pm2
```

### PM2 Versiyonunu Kontrol Et
```bash
pm2 --version
```

## 📋 Temel PM2 Komutları

### Uygulamayı Başlat
```bash
# Ecosystem dosyası ile production modunda başlat
pm2 start ecosystem.config.js --env production

# Direkt server.js ile başlat
pm2 start server.js --name "appointment-backend"

# Cluster modunda başlat (CPU çekirdek sayısı kadar instance)
pm2 start server.js -i max --name "appointment-backend"
```

### Uygulama Durumunu Kontrol Et
```bash
# Tüm process'leri listele
pm2 list

# Detaylı bilgi
pm2 show appointment-backend

# Gerçek zamanlı monitoring
pm2 monit
```

### Uygulama Yönetimi
```bash
# Uygulamayı durdur
pm2 stop appointment-backend

# Uygulamayı yeniden başlat
pm2 restart appointment-backend

# Uygulamayı reload et (zero-downtime)
pm2 reload appointment-backend

# Uygulamayı sil
pm2 delete appointment-backend

# Tüm uygulamaları durdur
pm2 stop all

# Tüm uygulamaları sil
pm2 delete all
```

## 📊 Log Yönetimi

### Log'ları Görüntüle
```bash
# Tüm log'ları göster
pm2 logs

# Belirli uygulama log'ları
pm2 logs appointment-backend

# Son 100 satırı göster
pm2 logs appointment-backend --lines 100

# Gerçek zamanlı log takibi
pm2 logs appointment-backend --follow
```

### Log'ları Temizle
```bash
# Tüm log'ları temizle
pm2 flush

# Belirli uygulama log'larını temizle
pm2 flush appointment-backend

# Log'ları yeniden yükle
pm2 reloadLogs
```

## 🔄 Otomatik Başlatma

### Sistem Başlangıcında Otomatik Başlat
```bash
# Startup script oluştur
pm2 startup

# Mevcut process'leri kaydet
pm2 save

# Kaydedilen konfigürasyonu geri yükle
pm2 resurrect
```

### Startup'ı Kaldır
```bash
pm2 unstartup
```

## 📈 Monitoring ve Performance

### CPU ve Memory Kullanımı
```bash
# Gerçek zamanlı monitoring
pm2 monit

# Process bilgileri
pm2 show appointment-backend

# Sistem bilgileri
pm2 info
```

### Memory Restart
```bash
# Memory limitine ulaştığında restart
pm2 start server.js --max-memory-restart 1G
```

## 🔧 Konfigürasyon Yönetimi

### Environment Variables
```bash
# Production environment ile başlat
pm2 start ecosystem.config.js --env production

# Development environment ile başlat
pm2 start ecosystem.config.js --env development
```

### Ecosystem Dosyası Güncelle
```bash
# Ecosystem dosyasını yeniden yükle
pm2 reload ecosystem.config.js --env production

# Ecosystem dosyasını baştan başlat
pm2 start ecosystem.config.js --env production
```

## 🛠️ Troubleshooting

### Uygulama Çalışmıyor
```bash
# Error log'larını kontrol et
pm2 logs appointment-backend --err

# Process durumunu kontrol et
pm2 describe appointment-backend

# Uygulamayı debug modunda başlat
pm2 start server.js --name "appointment-backend" --log-date-format="YYYY-MM-DD HH:mm:ss"
```

### Performance Sorunları
```bash
# Memory kullanımını kontrol et
pm2 monit

# Process'i restart et
pm2 restart appointment-backend

# Cluster modunda çalıştır
pm2 start server.js -i max
```

## 📦 Production Deployment Workflow

### 1. Kod Güncellemesi Sonrası
```bash
# Git'ten son kodu çek
git pull origin main

# Dependencies'leri güncelle
npm install --production

# Uygulamayı reload et (zero-downtime)
pm2 reload appointment-backend
```

### 2. Tam Restart Gerektiğinde
```bash
# Uygulamayı durdur
pm2 stop appointment-backend

# Kodu güncelle
git pull origin main
npm install --production

# Uygulamayı başlat
pm2 start ecosystem.config.js --env production
```

### 3. Rollback İşlemi
```bash
# Önceki commit'e dön
git checkout HEAD~1

# Dependencies'leri güncelle
npm install --production

# Uygulamayı restart et
pm2 restart appointment-backend
```

## 🔐 Güvenlik

### Process İzinleri
```bash
# PM2'yi root olmayan kullanıcı ile çalıştır
sudo -u appuser pm2 start ecosystem.config.js --env production
```

### Log Güvenliği
```bash
# Log dosyalarının izinlerini ayarla
chmod 640 logs/*.log
chown appuser:appgroup logs/*.log
```

## 📋 Günlük Bakım Komutları

### Her Gün Yapılması Gerekenler
```bash
# Log'ları kontrol et
pm2 logs appointment-backend --lines 50

# Memory kullanımını kontrol et
pm2 monit

# Process durumunu kontrol et
pm2 list
```

### Haftalık Bakım
```bash
# Log'ları temizle
pm2 flush

# PM2'yi güncelle
npm update -g pm2

# Process'leri restart et
pm2 restart all
```

## 🚨 Acil Durum Komutları

### Uygulama Yanıt Vermiyor
```bash
# Force restart
pm2 restart appointment-backend --force

# Process'i kill et ve yeniden başlat
pm2 delete appointment-backend
pm2 start ecosystem.config.js --env production
```

### Sistem Kaynakları Tükendi
```bash
# Tüm PM2 process'lerini durdur
pm2 stop all

# Sistem kaynaklarını kontrol et
pm2 monit

# Tek tek başlat
pm2 start appointment-backend
```

## 📞 Destek ve Yardım

### PM2 Yardım
```bash
pm2 --help
pm2 start --help
pm2 logs --help
```

### PM2 Dokümantasyon
- [PM2 Resmi Dokümantasyon](https://pm2.keymetrics.io/docs/)
- [PM2 GitHub](https://github.com/Unitech/pm2)