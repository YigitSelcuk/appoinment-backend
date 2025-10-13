const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        // .env dosyasından e-posta konfigürasyonu
        this.transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT),
            secure: process.env.EMAIL_SECURE === 'true', 
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS 
            },
            tls: {
                rejectUnauthorized: false
            }
        });
    }

    // E-posta gönderme fonksiyonu
    async sendEmail(to, subject, htmlContent, textContent = null) {
        try {
            const mailOptions = {
                from: {
                    name: process.env.EMAIL_FROM_NAME,
                    address: process.env.EMAIL_FROM || process.env.EMAIL_USER
                },
                to: to,
                subject: subject,
                html: htmlContent,
                text: textContent || this.stripHtml(htmlContent)
            };

            console.log('E-posta gönderiliyor:', { to, subject });
            const result = await this.transporter.sendMail(mailOptions);
            console.log('E-posta başarıyla gönderildi:', result.messageId);
            
            return {
                success: true,
                messageId: result.messageId,
                message: 'E-posta başarıyla gönderildi'
            };
        } catch (error) {
            console.error('E-posta gönderme hatası:', error);
            throw new Error(`E-posta gönderilirken hata oluştu: ${error.message}`);
        }
    }

    // Randevu bildirimi e-postası
    async sendAppointmentNotification(appointmentData, recipientEmail, notificationType = 'created') {
        try {
            const { title, date, startTime, endTime, location, description } = appointmentData;
            
            let subject, htmlContent;
            
            switch (notificationType) {
                case 'created':
                    subject = `Yeni Randevu: ${title}`;
                    htmlContent = this.generateAppointmentCreatedEmail(appointmentData);
                    break;
                case 'updated':
                    subject = `Randevu Güncellendi: ${title}`;
                    htmlContent = this.generateAppointmentUpdatedEmail(appointmentData);
                    break;
                case 'cancelled':
                    subject = `Randevu İptal Edildi: ${title}`;
                    htmlContent = this.generateAppointmentCancelledEmail(appointmentData);
                    break;
                case 'reminder':
                    subject = `Randevu Hatırlatması: ${title}`;
                    htmlContent = this.generateAppointmentReminderEmail(appointmentData);
                    break;
                default:
                    subject = `Randevu Bildirimi: ${title}`;
                    htmlContent = this.generateAppointmentCreatedEmail(appointmentData);
            }

            return await this.sendEmail(recipientEmail, subject, htmlContent);
        } catch (error) {
            console.error('Randevu bildirimi e-postası gönderme hatası:', error);
            throw error;
        }
    }

    // Yeni randevu e-posta şablonu - SULTANGAZİ Belediyesi
    generateAppointmentCreatedEmail(appointmentData) {
        const { title, date, startTime, endTime, location, description, attendee } = appointmentData;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    margin: 0; 
                    padding: 0; 
                    background-color: #f5f5f5;
                }
                .container { 
                    max-width: 650px; 
                    width: 100%;
                    margin: 20px auto; 
                    background: white; 
                    border-radius: 12px; 
                    overflow: hidden; 
                    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                    box-sizing: border-box;
                }
                .header { 
                    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); 
                    color: white; 
                    padding: 30px 20px; 
                    text-align: center; 
                    position: relative;
                }
                .header::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="80" cy="40" r="1.5" fill="rgba(255,255,255,0.1)"/><circle cx="40" cy="80" r="1" fill="rgba(255,255,255,0.1)"/></svg>');
                }
                .header h1 { 
                    margin: 0; 
                    font-size: 28px; 
                    font-weight: 600; 
                    position: relative; 
                    z-index: 1;
                }
                .header .subtitle { 
                    margin: 8px 0 0 0; 
                    font-size: 16px; 
                    opacity: 0.9; 
                    position: relative; 
                    z-index: 1;
                }
                .content { 
                    padding: 30px; 
                    background: white;
                }
                .greeting { 
                    font-size: 18px; 
                    margin-bottom: 20px; 
                    color: #2c3e50;
                }
                .appointment-card { 
                    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); 
                    border: 2px solid #e3f2fd; 
                    border-radius: 12px; 
                    padding: 25px; 
                    margin: 25px 0; 
                    position: relative;
                }
                .appointment-card::before {
                    content: '📅';
                    position: absolute;
                    top: -10px;
                    left: 20px;
                    background: white;
                    padding: 5px 10px;
                    border-radius: 20px;
                    font-size: 20px;
                }
                .detail-row { 
                    margin: 15px 0; 
                    display: flex; 
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid #eee;
                }
                .detail-row:last-child { border-bottom: none; }
                .label { 
                    font-weight: 600; 
                    color: #1e3c72; 
                    min-width: 120px; 
                    font-size: 14px;
                }
                .value { 
                    color: #2c3e50; 
                    font-size: 15px; 
                    flex: 1;
                }
                .important-notice {
                    background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
                    border-left: 4px solid #ff9800;
                    padding: 20px;
                    margin: 25px 0;
                    border-radius: 8px;
                }
                .important-notice h3 {
                    margin: 0 0 10px 0;
                    color: #e65100;
                    font-size: 16px;
                }
                .contact-info {
                    background: #f1f8e9;
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                    border-left: 4px solid #4caf50;
                }
                .footer { 
                    background: #263238; 
                    color: #b0bec5; 
                    text-align: center; 
                    padding: 25px; 
                    font-size: 13px;
                }
                .footer .logo {
                    color: #81c784;
                    font-weight: 600;
                    font-size: 16px;
                    margin-bottom: 10px;
                }
                .footer .divider {
                    height: 2px;
                    background: #37474f;
                    margin: 15px auto;
                    width: 100px;
                }
                @media (max-width: 768px) {
                    .container {
                        padding: 10px;
                    }
                    .appointment-card {
                        padding: 15px;
                        margin: 15px 0;
                    }
                    .detail-row {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 5px;
                        padding: 6px 0;
                    }
                    .label {
                        min-width: auto;
                        font-size: 12px;
                    }
                    .value {
                        font-size: 13px;
                    }
                    .header h1 {
                        font-size: 24px;
                    }
                    .subtitle {
                        font-size: 12px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Randevu Oluşturuldu</h1>
                    <div class="subtitle">SULTANGAZİ BELEDİYESİ RANDEVU SİSTEMİ</div>
                </div>
                <div class="content">
                    <div class="greeting">Sayın Vatandaşımız,</div>
                    <p>SULTANGAZİ Belediyesi Randevu Sistemi üzerinden talebiniz doğrultusunda randevunuz başarıyla oluşturulmuştur. Randevu detaylarınız aşağıda belirtilmiştir:</p>
                    
                    <div class="appointment-card">
                        <div class="detail-row">
                            <span class="label">📋 Randevu Konusu:</span>
                            <span class="value">${title}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">📅 Tarih:</span>
                            <span class="value">${this.formatDate(date)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">🕐 Saat:</span>
                            <span class="value">${startTime} - ${endTime}</span>
                        </div>
                        ${location ? `<div class="detail-row"><span class="label">📍 Konum:</span><span class="value">${location}</span></div>` : ''}
                        ${attendee ? `<div class="detail-row"><span class="label">👤 Yetkili Personel:</span><span class="value">${attendee}</span></div>` : ''}
                        ${description ? `<div class="detail-row"><span class="label">📝 Açıklama:</span><span class="value">${description}</span></div>` : ''}
                    </div>
          
                </div>
                <div class="footer">
                    <div class="logo">SULTANGAZİ BELEDİYESİ</div>
                    <div class="divider"></div>
                    <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                    <p>© 2025 SULTANGAZİ Belediyesi - Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // Randevu güncelleme e-posta şablonu
    // Randevu güncellendi e-posta şablonu - SULTANGAZİ Belediyesi
    generateAppointmentUpdatedEmail(appointmentData) {
        const { title, date, startTime, endTime, location, description, attendee, changes } = appointmentData;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    margin: 0; 
                    padding: 0; 
                    background-color: #f5f5f5;
                }
                .container { 
                    max-width: 650px; 
                    margin: 20px auto; 
                    background: white; 
                    border-radius: 12px; 
                    overflow: hidden; 
                    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                }
                .header { 
                    background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%); 
                    color: white; 
                    padding: 30px 20px; 
                    text-align: center; 
                    position: relative;
                }
                .header::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="80" cy="40" r="1.5" fill="rgba(255,255,255,0.1)"/><circle cx="40" cy="80" r="1" fill="rgba(255,255,255,0.1)"/></svg>');
                }
                .header h1 { 
                    margin: 0; 
                    font-size: 28px; 
                    font-weight: 600; 
                    position: relative; 
                    z-index: 1;
                }
                .header .subtitle { 
                    margin: 8px 0 0 0; 
                    font-size: 16px; 
                    opacity: 0.9; 
                    position: relative; 
                    z-index: 1;
                }
                .content { 
                    padding: 30px; 
                    background: white;
                }
                .greeting { 
                    font-size: 18px; 
                    margin-bottom: 20px; 
                    color: #2c3e50;
                }
                .update-notice {
                    background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
                    border: 2px solid #42a5f5;
                    border-radius: 12px;
                    padding: 25px;
                    margin: 25px 0;
                    text-align: center;
                }
                .update-notice h2 {
                    color: #1565c0;
                    margin: 0 0 15px 0;
                    font-size: 22px;
                }
                .update-notice p {
                    color: #1976d2;
                    font-size: 16px;
                    margin: 0;
                    font-weight: 500;
                }
                .appointment-details { 
                    background: linear-gradient(135deg, #f1f8e9 0%, #dcedc8 100%); 
                    border-left: 4px solid #4caf50;
                    padding: 25px; 
                    border-radius: 8px; 
                    margin: 25px 0;
                }
                .appointment-details h3 {
                    margin: 0 0 20px 0;
                    color: #2e7d32;
                    font-size: 18px;
                }
                .detail-row { 
                    margin: 12px 0; 
                    display: flex; 
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid rgba(0,0,0,0.1);
                }
                .detail-row:last-child { border-bottom: none; }
                .label { 
                    font-weight: 600; 
                    color: #2e7d32; 
                    min-width: 120px; 
                    font-size: 14px;
                }
                .value { 
                    color: #2c3e50; 
                    font-size: 14px; 
                    flex: 1;
                }
                .changes-section {
                    background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
                    border-left: 4px solid #ff9800;
                    padding: 25px;
                    margin: 25px 0;
                    border-radius: 8px;
                }
                .changes-section h3 {
                    margin: 0 0 15px 0;
                    color: #e65100;
                    font-size: 18px;
                }
                .changes-content {
                    background: white;
                    border: 1px solid #ffcc02;
                    padding: 20px;
                    border-radius: 8px;
                    font-family: 'Courier New', monospace;
                    font-size: 13px;
                    line-height: 1.5;
                    white-space: pre-wrap;
                    color: #bf360c;
                }
                .important-info {
                    background: linear-gradient(135deg, #e8f5e8 0%, #c8e6c9 100%);
                    border-left: 4px solid #4caf50;
                    padding: 20px;
                    margin: 25px 0;
                    border-radius: 8px;
                }
                .important-info h3 {
                    margin: 0 0 10px 0;
                    color: #2e7d32;
                    font-size: 16px;
                }
                .contact-info {
                    background: #f1f8e9;
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                    border-left: 4px solid #4caf50;
                }
                .footer { 
                    background: #263238; 
                    color: #b0bec5; 
                    text-align: center; 
                    padding: 25px; 
                    font-size: 13px;
                }
                .footer .logo {
                    color: #81c784;
                    font-weight: 600;
                    font-size: 16px;
                    margin-bottom: 10px;
                }
                .footer .divider {
                    height: 1px;
                    background: #37474f;
                    margin: 15px auto;
                    width: 100px;
                }
                @media (max-width: 768px) {
                    .container { padding: 10px; }
                    .header { padding: 15px; }
                    .header h1 { font-size: 20px; }
                    .content { padding: 15px; }
                    .appointment-details { padding: 15px; margin: 15px 0; }
                    .detail-row { 
                        flex-direction: column; 
                        align-items: flex-start; 
                        gap: 5px; 
                        padding: 6px 0; 
                    }
                    .label { font-size: 12px; }
                    .value { font-size: 13px; }
                    .update-notice { padding: 20px; margin: 15px 0; }
                    .update-notice h2 { font-size: 18px; }
                    .important-info, .contact-info { padding: 15px; margin: 15px 0; }
                    .footer { padding: 15px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📝 Randevu Güncellendi</h1>
                    <div class="subtitle">SULTANGAZİ BELEDİYESİ RANDEVU SİSTEMİ</div>
                </div>
                <div class="content">
                    <div class="greeting">Sayın Vatandaşımız,</div>
                    
                    <div class="update-notice">
                        <h2>📋 RANDEVU BİLGİLERİ GÜNCELLENDİ</h2>
                        <p>Randevunuzda bazı değişiklikler yapılmıştır. Güncel bilgileri aşağıda bulabilirsiniz.</p>
                    </div>
                    
                    <div class="appointment-details">
                        <h3>📅 Güncel Randevu Bilgileri</h3>
                        <div class="detail-row">
                            <span class="label">📋 Konu:</span>
                            <span class="value">${title}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">📅 Tarih:</span>
                            <span class="value">${this.formatDate(date)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">🕐 Saat:</span>
                            <span class="value">${startTime} - ${endTime}</span>
                        </div>
                        ${location ? `<div class="detail-row"><span class="label">📍 Konum:</span><span class="value">${location}</span></div>` : ''}
                        ${attendee ? `<div class="detail-row"><span class="label">👤 Yetkili:</span><span class="value">${attendee}</span></div>` : ''}
                        ${description ? `<div class="detail-row"><span class="label">📝 Açıklama:</span><span class="value">${description}</span></div>` : ''}
                    </div>
                    
                    ${changes ? `
                    <div class="changes-section">
                        <h3>🔄 Yapılan Değişiklikler</h3>
                        <div class="changes-content">${changes}</div>
                    </div>
                    ` : ''}
                    
                    <div class="important-info">
                        <h3>⚠️ Önemli Hatırlatmalar</h3>
                        <ul style="margin: 0; padding-left: 20px;">
                            <li><strong>Güncel randevu bilgilerini</strong> takvimize kaydetmeyi unutmayın.</li>
                            <li>Randevunuza <strong>15 dakika öncesinde</strong> gelmenizi rica ederiz.</li>
                            <li>Yanınızda <strong>kimlik belgenizi</strong> bulundurmanız gerekmektedir.</li>
                            <li>Başka bir değişiklik gerekirse <strong>en az 2 saat öncesinden</strong> bildirim yapınız.</li>
                        </ul>
                    </div>

                    <div class="contact-info">
                        <h3 style="margin: 0 0 10px 0; color: #2e7d32;">📞 İletişim Bilgileri</h3>
                        <p style="margin: 5px 0;"><strong>Telefon:</strong> 0212 XXX XX XX</p>
                        <p style="margin: 5px 0;"><strong>E-posta:</strong> randevu@sultangazi.bel.tr</p>
                        <p style="margin: 5px 0;"><strong>Adres:</strong> SULTANGAZİ Belediyesi, Sultangazi/İstanbul</p>
                        <p style="margin: 5px 0;"><strong>Çalışma Saatleri:</strong> Pazartesi-Cuma 08:30-17:30</p>
                    </div>
                    
                    <p style="color: #546e7a; font-style: italic; text-align: center; margin-top: 20px;">
                        Güncel bilgiler için teşekkür ederiz.
                    </p>
                </div>
                <div class="footer">
                    <div class="logo">SULTANGAZİ BELEDİYESİ</div>
                    <div class="divider"></div>
                    <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                    <p>© 2024 SULTANGAZİ Belediyesi - Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // Randevu iptal e-posta şablonu - SULTANGAZİ Belediyesi
    generateAppointmentCancelledEmail(appointmentData) {
        const { title, date, startTime, endTime, location, description, attendee, cancellationReason } = appointmentData;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    margin: 0; 
                    padding: 0; 
                    background-color: #f5f5f5;
                }
                .container { 
                    max-width: 650px; 
                    margin: 20px auto; 
                    background: white; 
                    border-radius: 12px; 
                    overflow: hidden; 
                    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                }
                .header { 
                    background: linear-gradient(135deg, #d32f2f 0%, #f44336 100%); 
                    color: white; 
                    padding: 30px 20px; 
                    text-align: center; 
                    position: relative;
                }
                .header::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="80" cy="40" r="1.5" fill="rgba(255,255,255,0.1)"/><circle cx="40" cy="80" r="1" fill="rgba(255,255,255,0.1)"/></svg>');
                }
                .header h1 { 
                    margin: 0; 
                    font-size: 28px; 
                    font-weight: 600; 
                    position: relative; 
                    z-index: 1;
                }
                .header .subtitle { 
                    margin: 8px 0 0 0; 
                    font-size: 16px; 
                    opacity: 0.9; 
                    position: relative; 
                    z-index: 1;
                }
                .content { 
                    padding: 30px; 
                    background: white;
                }
                .greeting { 
                    font-size: 18px; 
                    margin-bottom: 20px; 
                    color: #2c3e50;
                }
                .cancellation-notice {
                    background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
                    border: 3px solid #ef5350;
                    border-radius: 16px;
                    padding: 30px;
                    margin: 30px 0;
                    text-align: center;
                    box-shadow: 0 8px 25px rgba(239, 83, 80, 0.2);
                    position: relative;
                    overflow: hidden;
                }
                .cancellation-notice::before {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
                    animation: shimmer 3s ease-in-out infinite;
                }
                @keyframes shimmer {
                    0%, 100% { transform: rotate(0deg); }
                    50% { transform: rotate(180deg); }
                }
                .cancellation-notice h2 {
                    color: #c62828;
                    margin: 0 0 15px 0;
                    font-size: 26px;
                    font-weight: 700;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
                    position: relative;
                    z-index: 1;
                }
                .cancellation-notice p {
                    color: #d32f2f;
                    font-size: 18px;
                    margin: 0;
                    font-weight: 600;
                    position: relative;
                    z-index: 1;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
                }
                .appointment-card { 
                    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); 
                    border: 2px solid #ffcdd2; 
                    border-radius: 12px; 
                    padding: 25px; 
                    margin: 25px 0; 
                    position: relative;
                }
                .appointment-card::before {
                    content: '❌';
                    position: absolute;
                    top: -10px;
                    left: 20px;
                    background: white;
                    padding: 5px 10px;
                    border-radius: 20px;
                    font-size: 20px;
                }
                .detail-row { 
                    margin: 15px 0; 
                    display: flex; 
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid #eee;
                }
                .detail-row:last-child { border-bottom: none; }
                .label { 
                    font-weight: 600; 
                    color: #d32f2f; 
                    min-width: 120px; 
                    font-size: 14px;
                }
                .value { 
                    color: #2c3e50; 
                    font-size: 15px; 
                    flex: 1;
                }
                .reason-box {
                    background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
                    border-left: 4px solid #ff9800;
                    padding: 20px;
                    margin: 25px 0;
                    border-radius: 8px;
                }
                .reason-box h3 {
                    margin: 0 0 10px 0;
                    color: #e65100;
                    font-size: 16px;
                }
                .next-steps {
                    background: #e8f5e8;
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                    border-left: 4px solid #4caf50;
                }
                .next-steps h3 {
                    margin: 0 0 15px 0;
                    color: #2e7d32;
                    font-size: 18px;
                }
                .steps-list {
                    margin: 0;
                    padding-left: 20px;
                    color: #2e7d32;
                }
                .steps-list li {
                    margin: 8px 0;
                    font-weight: 500;
                }
                .contact-info {
                    background: #f1f8e9;
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                    border-left: 4px solid #4caf50;
                }
                .apology-section {
                    background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                    text-align: center;
                    border: 1px solid #2196f3;
                }
                .footer { 
                    background: #263238; 
                    color: #b0bec5; 
                    text-align: center; 
                    padding: 25px; 
                    font-size: 13px;
                }
                .footer .logo {
                    color: #81c784;
                    font-weight: 600;
                    font-size: 16px;
                    margin-bottom: 10px;
                }
                .footer .divider {
                    height: 1px;
                    background: #37474f;
                    margin: 15px auto;
                    width: 100px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Randevu İptal Edildi</h1>
                    <div class="subtitle">SULTANGAZİ BELEDİYESİ RANDEVU SİSTEMİ</div>
                </div>
                <div class="content">
                    <div class="greeting">Sayın Vatandaşımız,</div>
                    
                    <div class="cancellation-notice">
                        <h2>RANDEVU İPTAL BİLDİRİMİ</h2>
                        <p>Aşağıda detayları belirtilen randevunuz iptal edilmiştir.</p>
                    </div>
                    
                    <div class="appointment-card">
                        <div class="detail-row">
                            <span class="label">📋 Randevu Konusu:</span>
                            <span class="value">${title}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">📅 Tarih:</span>
                            <span class="value">${this.formatDate(date)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">🕐 Saat:</span>
                            <span class="value">${startTime} - ${endTime}</span>
                        </div>
                        ${location ? `<div class="detail-row"><span class="label">📍 Konum:</span><span class="value">${location}</span></div>` : ''}
                        ${attendee ? `<div class="detail-row"><span class="label">👤 Yetkili Personel:</span><span class="value">${attendee}</span></div>` : ''}
                        ${description ? `<div class="detail-row"><span class="label">📝 Açıklama:</span><span class="value">${description}</span></div>` : ''}
                    </div>
                </div>
                <div class="footer">
                    <div class="logo">SULTANGAZİ BELEDİYESİ</div>
                    <div class="divider"></div>
                    <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                    <p>© 2025 SULTANGAZİ Belediyesi - Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // Randevu yeniden planlandı e-posta şablonu - SULTANGAZİ Belediyesi
    generateAppointmentRescheduledEmail(appointmentData) {
        const { title, date, startTime, endTime, location, description, attendee, oldDate, oldStartTime, oldEndTime, rescheduleReason } = appointmentData;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    margin: 0; 
                    padding: 0; 
                    background-color: #f5f5f5;
                }
                .container { 
                    max-width: 650px; 
                    margin: 20px auto; 
                    background: white; 
                    border-radius: 12px; 
                    overflow: hidden; 
                    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                }
                .header { 
                    background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); 
                    color: white; 
                    padding: 30px 20px; 
                    text-align: center; 
                    position: relative;
                }
                .header::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="80" cy="40" r="1.5" fill="rgba(255,255,255,0.1)"/><circle cx="40" cy="80" r="1" fill="rgba(255,255,255,0.1)"/></svg>');
                }
                .header h1 { 
                    margin: 0; 
                    font-size: 28px; 
                    font-weight: 600; 
                    position: relative; 
                    z-index: 1;
                }
                .header .subtitle { 
                    margin: 8px 0 0 0; 
                    font-size: 16px; 
                    opacity: 0.9; 
                    position: relative; 
                    z-index: 1;
                }
                .content { 
                    padding: 30px; 
                    background: white;
                }
                .greeting { 
                    font-size: 18px; 
                    margin-bottom: 20px; 
                    color: #2c3e50;
                }
                .reschedule-notice {
                    background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
                    border: 3px solid #ffb74d;
                    border-radius: 16px;
                    padding: 30px;
                    margin: 30px 0;
                    text-align: center;
                    box-shadow: 0 8px 25px rgba(255, 183, 77, 0.3);
                    position: relative;
                    overflow: hidden;
                }
                .reschedule-notice::before {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%);
                    animation: shimmer-orange 3s ease-in-out infinite;
                }
                @keyframes shimmer-orange {
                    0%, 100% { transform: rotate(0deg); }
                    50% { transform: rotate(180deg); }
                }
                .reschedule-notice h2 {
                    color: #e65100;
                    margin: 0 0 15px 0;
                    font-size: 26px;
                    font-weight: 700;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
                    position: relative;
                    z-index: 1;
                }
                .reschedule-notice p {
                    color: #ef6c00;
                    font-size: 18px;
                    margin: 0;
                    font-weight: 600;
                    position: relative;
                    z-index: 1;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
                }
                .comparison-container {
                    width: 100%;
                    margin: 25px 0;
                    border-collapse: collapse;
                    table-layout: fixed;
                }
                .old-appointment, .new-appointment {
                    border-radius: 12px;
                    padding: 15px;
                    position: relative;
                    box-sizing: border-box;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                    width: 50%;
                }
                .old-appointment {
                    background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
                    border: 2px solid #ef5350;
                }
                .new-appointment {
                    background: linear-gradient(135deg, #e8f5e8 0%, #c8e6c9 100%);
                    border: 2px solid #66bb6a;
                }
                .old-appointment::before {
                    content: '❌';
                    position: absolute;
                    top: -10px;
                    left: 20px;
                    background: white;
                    padding: 5px 10px;
                    border-radius: 20px;
                    font-size: 16px;
                }
                .new-appointment::before {
                    content: '✅';
                    position: absolute;
                    top: -10px;
                    left: 20px;
                    background: white;
                    padding: 5px 10px;
                    border-radius: 20px;
                    font-size: 16px;
                }
                .appointment-section h3 {
                    margin: 0 0 15px 0;
                    font-size: 18px;
                }
                .old-appointment h3 { color: #c62828; }
                .new-appointment h3 { color: #2e7d32; }
                .detail-row { 
                    margin: 12px 0; 
                    display: flex; 
                    align-items: center;
                    padding: 6px 0;
                    border-bottom: 1px solid rgba(0,0,0,0.1);
                    flex-wrap: wrap;
                    word-break: break-word;
                }
                .detail-row:last-child { border-bottom: none; }
                .label { 
                    font-weight: 600; 
                    min-width: 80px; 
                    font-size: 13px;
                    margin-right: 8px;
                    flex-shrink: 0;
                }
                .old-appointment .label { color: #c62828; }
                .new-appointment .label { color: #2e7d32; }
                .value { 
                    color: #2c3e50; 
                    font-size: 14px; 
                    flex: 1;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                    max-width: calc(100% - 88px);
                }
                .reason-box {
                    background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
                    border-left: 4px solid #2196f3;
                    padding: 20px;
                    margin: 25px 0;
                    border-radius: 8px;
                }
                .reason-box h3 {
                    margin: 0 0 10px 0;
                    color: #1565c0;
                    font-size: 16px;
                }
                .important-info {
                    background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
                    border-left: 4px solid #ff9800;
                    padding: 20px;
                    margin: 25px 0;
                    border-radius: 8px;
                }
                .important-info h3 {
                    margin: 0 0 10px 0;
                    color: #e65100;
                    font-size: 16px;
                }
                .contact-info {
                    background: #f1f8e9;
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                    border-left: 4px solid #4caf50;
                }
                .footer { 
                    background: #263238; 
                    color: #b0bec5; 
                    text-align: center; 
                    padding: 25px; 
                    font-size: 13px;
                }
                .footer .logo {
                    color: #81c784;
                    font-weight: 600;
                    font-size: 16px;
                    margin-bottom: 10px;
                }
                .footer .divider {
                    height: 1px;
                    background: #37474f;
                    margin: 15px auto;
                    width: 100px;
                }
                @media (max-width: 768px) {
                    .container {
                        padding: 10px;
                        margin: 0;
                    }
                    .comparison-container {
                        margin: 15px 0;
                    }
                    .comparison-container tr {
                        display: block;
                        width: 100%;
                    }
                    .comparison-container td {
                        display: block;
                        width: 100% !important;
                        padding: 12px 0 !important;
                        margin-bottom: 15px;
                    }
                    .old-appointment, .new-appointment {
                        width: 100% !important;
                        padding: 12px;
                        margin: 0 0 15px 0;
                    }
                    .detail-row {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 3px;
                        margin-bottom: 8px;
                    }
                    .label {
                        min-width: auto;
                        font-size: 11px;
                        font-weight: 600;
                    }
                    .value {
                        font-size: 12px;
                        word-break: break-word;
                        max-width: 100%;
                    }
                }
                @media (max-width: 480px) {
                    .container {
                        padding: 5px;
                    }
                    .content {
                        padding: 15px;
                    }
                    .comparison-container td {
                        padding: 8px 0 !important;
                    }
                    .old-appointment, .new-appointment {
                        padding: 10px;
                        margin: 0 0 10px 0;
                    }
                    .label {
                        font-size: 10px;
                    }
                    .value {
                        font-size: 11px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Randevu Yeniden Planlandı</h1>
                    <div class="subtitle">SULTANGAZİ BELEDİYESİ RANDEVU SİSTEMİ</div>
                </div>
                <div class="content">
                    <div class="greeting">Sayın Vatandaşımız,</div>
                    
                    <div class="reschedule-notice">
                        <h2>📅 RANDEVU TARİH DEĞİŞİKLİĞİ</h2>
                        <p>Randevunuz yeni bir tarihe ertelenmiştir. Aşağıda eski ve yeni randevu detaylarını görebilirsiniz.</p>
                    </div>
                    
                    <table class="comparison-container" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td class="old-appointment appointment-section" style="width: 50%; vertical-align: top; padding-right: 10px;">
                                <h3>Eski Randevu Bilgileri</h3>
                                <div class="detail-row">
                                    <span class="label">📅 Tarih:</span>
                                    <span class="value">${oldDate ? this.formatDate(oldDate) : 'Belirtilmemiş'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="label">🕐 Saat:</span>
                                    <span class="value">${oldStartTime && oldEndTime ? `${oldStartTime} - ${oldEndTime}` : 'Belirtilmemiş'}</span>
                                </div>
                            </td>
                            
                            <td class="new-appointment appointment-section" style="width: 50%; vertical-align: top; padding-left: 10px;">
                                <h3>Yeni Randevu Bilgileri</h3>
                                <div class="detail-row">
                                    <span class="label">📋 Konu:</span>
                                    <span class="value">${title}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="label">📅 Tarih:</span>
                                    <span class="value">${this.formatDate(date)}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="label">🕐 Saat:</span>
                                    <span class="value">${startTime} - ${endTime}</span>
                                </div>
                                ${location ? `<div class="detail-row"><span class="label">📍 Konum:</span><span class="value">${location}</span></div>` : ''}
                                ${attendee ? `<div class="detail-row"><span class="label">👤 Yetkili:</span><span class="value">${attendee}</span></div>` : ''}
                            </td>
                        </tr>
                    </table>
                 
                </div>
                <div class="footer">
                    <div class="logo">SULTANGAZİ BELEDİYESİ</div>
                    <div class="divider"></div>
                    <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                    <p>© 2025 SULTANGAZİ Belediyesi - Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // Randevu hatırlatması e-posta şablonu
    generateAppointmentReminderEmail(appointmentData) {
        const { title, date, startTime, endTime, location, description, attendee } = appointmentData;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #ffc107; color: #333; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
                .appointment-details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
                .detail-row { margin: 10px 0; }
                .label { font-weight: bold; color: #ffc107; }
                .reminder-notice { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
                .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Randevu Hatırlatması</h1>
                </div>
                <div class="content">
                    <p>Merhaba,</p>
                    <div class="reminder-notice">
                        <strong>🔔 Yaklaşan randevunuz için hatırlatma!</strong>
                    </div>
                    <p>Aşağıdaki randevunuz yaklaşıyor:</p>
                    
                    <div class="appointment-details">
                        <div class="detail-row">
                            <span class="label">Randevu Başlığı:</span> ${title}
                        </div>
                        <div class="detail-row">
                            <span class="label">Tarih:</span> ${this.formatDate(date)}
                        </div>
                        <div class="detail-row">
                            <span class="label">Saat:</span> ${startTime} - ${endTime}
                        </div>
                        ${location ? `<div class="detail-row"><span class="label">Konum:</span> ${location}</div>` : ''}
                        ${attendee ? `<div class="detail-row"><span class="label">Katılımcı:</span> ${attendee}</div>` : ''}
                        ${description ? `<div class="detail-row"><span class="label">Açıklama:</span> ${description}</div>` : ''}
                    </div>
                    
                    <p>Randevunuzu unutmayın! Zamanında hazır olmanızı rica ederiz.</p>
                </div>
                <div class="footer">
                    <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                    <p>© 2025 Randevu Yönetim Sistemi</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // Randevu hatırlatma e-posta şablonu
    generateAppointmentReminderEmail(appointmentData) {
        const { title, date, startTime, endTime, location, description, attendee } = appointmentData;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #ffc107; color: #333; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
                .appointment-details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
                .detail-row { margin: 10px 0; }
                .label { font-weight: bold; color: #ffc107; }
                .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⏰ Randevu Hatırlatması</h1>
                </div>
                <div class="content">
                    <p>Merhaba,</p>
                    <p>Yaklaşan randevunuzu hatırlatmak istiyoruz:</p>
                    
                    <div class="appointment-details">
                        <div class="detail-row">
                            <span class="label">Randevu Başlığı:</span> ${title}
                        </div>
                        <div class="detail-row">
                            <span class="label">Tarih:</span> ${this.formatDate(date)}
                        </div>
                        <div class="detail-row">
                            <span class="label">Saat:</span> ${startTime} - ${endTime}
                        </div>
                        ${location ? `<div class="detail-row"><span class="label">Konum:</span> ${location}</div>` : ''}
                        ${attendee ? `<div class="detail-row"><span class="label">Katılımcı:</span> ${attendee}</div>` : ''}
                        ${description ? `<div class="detail-row"><span class="label">Açıklama:</span> ${description}</div>` : ''}
                    </div>
                    
                    <p>Randevunuzu unutmayın!</p>
                </div>
                <div class="footer">
                    <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                    <p>© 2024 Randevu Yönetim Sistemi</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generateAppointmentConfirmedEmail(appointmentData) {
        const { title, date, startTime, endTime, location, description, attendee } = appointmentData;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Randevu Onaylandı</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; position: relative; }
                .header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%); animation: shimmer-green 2s infinite; }
                @keyframes shimmer-green { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
                .header h1 { margin: 0; font-size: 28px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); position: relative; z-index: 2; }
                .logo { width: 80px; height: 80px; margin: 0 auto 15px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
                .content { padding: 30px; }
                .greeting { font-size: 18px; color: #333; margin-bottom: 20px; }
                .confirmation-notice { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 25px; border-radius: 12px; text-align: center; margin: 25px 0; border: 3px solid #1e7e34; box-shadow: 0 8px 16px rgba(40, 167, 69, 0.3); position: relative; overflow: hidden; }
                .confirmation-notice::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%); animation: shimmer-green 2s infinite; }
                .confirmation-notice h2 { margin: 0 0 10px 0; font-size: 24px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); position: relative; z-index: 2; }
                .confirmation-notice p { margin: 0; font-size: 16px; font-weight: 500; text-shadow: 1px 1px 2px rgba(0,0,0,0.2); position: relative; z-index: 2; }
                .appointment-card { background-color: #f8f9fa; border: 2px solid #28a745; border-radius: 10px; padding: 20px; margin: 20px 0; }
                .appointment-card h3 { color: #28a745; margin: 0 0 15px 0; font-size: 20px; }
                .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e9ecef; }
                .detail-row:last-child { border-bottom: none; }
                .label { font-weight: bold; color: #495057; }
                .value { color: #6c757d; }
                .important-info { background-color: #e7f3ff; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0; border-radius: 5px; }
                .contact-info { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .contact-info h4 { color: #28a745; margin: 0 0 10px 0; }
                .footer { background-color: #343a40; color: white; padding: 20px; text-align: center; font-size: 12px; }
                @media (max-width: 768px) {
                    .container { padding: 10px; }
                    .header { padding: 15px; }
                    .header h1 { font-size: 20px; }
                    .content { padding: 15px; }
                    .appointment-card { padding: 15px; margin: 15px 0; }
                    .detail-row { 
                        flex-direction: column; 
                        align-items: flex-start; 
                        gap: 5px; 
                        padding: 6px 0; 
                    }
                    .label { font-size: 12px; }
                    .value { font-size: 13px; }
                    .important-info, .contact-info { padding: 15px; margin: 15px 0; }
                    .footer { padding: 15px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#28a745" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <h1>SULTANGAZİ BELEDİYESİ</h1>
                    <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Randevu Yönetim Sistemi</p>
                </div>
                <div class="content">
                    <div class="greeting">Sayın Vatandaşımız,</div>
                    
                    <div class="confirmation-notice">
                        <h2>✓ Randevunuz Onaylandı</h2>
                        <p>Randevunuz başarıyla onaylanmıştır ve kesinleşmiştir.</p>
                    </div>
                    
                    <div class="appointment-card">
                        <h3>${title}</h3>
                        <div class="detail-row">
                            <span class="label">Tarih:</span>
                            <span class="value">${this.formatDate(date)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Saat:</span>
                            <span class="value">${startTime} - ${endTime}</span>
                        </div>
                        ${location ? `<div class="detail-row"><span class="label">Konum:</span><span class="value">${location}</span></div>` : ''}
                        ${attendee ? `<div class="detail-row"><span class="label">Yetkili Personel:</span><span class="value">${attendee}</span></div>` : ''}
                        ${description ? `<div class="detail-row"><span class="label">Açıklama:</span><span class="value">${description}</span></div>` : ''}
                    </div>
                    
                    <div class="important-info">
                        <h4>📋 Önemli Hatırlatmalar:</h4>
                        <ul style="margin: 10px 0; padding-left: 20px;">
                            <li>Randevu saatinizden 15 dakika önce hazır bulunmanız önerilir</li>
                            <li>Yanınızda kimlik belgenizi getirmeyi unutmayın</li>
                            <li>Randevu saatinizde gecikmemeniz önemlidir</li>
                            <li>İptal veya değişiklik için en az 2 saat önceden bildirim yapın</li>
                        </ul>
                    </div>
                    
                    <div class="contact-info">
                        <h4>📞 İletişim Bilgileri</h4>
                        <p><strong>Telefon:</strong> 0212 XXX XX XX</p>
                        <p><strong>E-posta:</strong> info@sultangazi.bel.tr</p>
                        <p><strong>Adres:</strong> SULTANGAZİ Belediyesi, İstanbul</p>
                    </div>
                </div>
                <div class="footer">
                    <p>Bu e-posta SULTANGAZİ Belediyesi Randevu Sistemi tarafından otomatik olarak gönderilmiştir.</p>
                    <p>© 2024 SULTANGAZİ Belediyesi - Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    generateAppointmentCompletedEmail(appointmentData) {
        const { title, date, startTime, endTime, location, description, attendee } = appointmentData;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Randevu Tamamlandı</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #6f42c1 0%, #8e44ad 100%); color: white; padding: 30px; text-align: center; position: relative; }
                .header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%); animation: shimmer-purple 2s infinite; }
                @keyframes shimmer-purple { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
                .header h1 { margin: 0; font-size: 28px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); position: relative; z-index: 2; }
                .logo { width: 80px; height: 80px; margin: 0 auto 15px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
                .content { padding: 30px; }
                .greeting { font-size: 18px; color: #333; margin-bottom: 20px; }
                .completion-notice { background: linear-gradient(135deg, #6f42c1 0%, #8e44ad 100%); color: white; padding: 25px; border-radius: 12px; text-align: center; margin: 25px 0; border: 3px solid #5a2d91; box-shadow: 0 8px 16px rgba(111, 66, 193, 0.3); position: relative; overflow: hidden; }
                .completion-notice::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%); animation: shimmer-purple 2s infinite; }
                .completion-notice h2 { margin: 0 0 10px 0; font-size: 24px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); position: relative; z-index: 2; }
                .completion-notice p { margin: 0; font-size: 16px; font-weight: 500; text-shadow: 1px 1px 2px rgba(0,0,0,0.2); position: relative; z-index: 2; }
                .appointment-card { background-color: #f8f9fa; border: 2px solid #6f42c1; border-radius: 10px; padding: 20px; margin: 20px 0; }
                .appointment-card h3 { color: #6f42c1; margin: 0 0 15px 0; font-size: 20px; }
                .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e9ecef; }
                .detail-row:last-child { border-bottom: none; }
                .label { font-weight: bold; color: #495057; }
                .value { color: #6c757d; }
                .thank-you-section { background-color: #e8f5e8; border-left: 4px solid #28a745; padding: 20px; margin: 20px 0; border-radius: 5px; }
                .feedback-section { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
                .contact-info { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .contact-info h4 { color: #6f42c1; margin: 0 0 10px 0; }
                .footer { background-color: #343a40; color: white; padding: 20px; text-align: center; font-size: 12px; }
                @media (max-width: 768px) {
                    .container { padding: 10px; }
                    .header { padding: 15px; }
                    .header h1 { font-size: 20px; }
                    .content { padding: 15px; }
                    .appointment-card { padding: 15px; margin: 15px 0; }
                    .detail-row { 
                        flex-direction: column; 
                        align-items: flex-start; 
                        gap: 5px; 
                        padding: 6px 0; 
                    }
                    .label { font-size: 12px; }
                    .value { font-size: 13px; }
                    .thank-you-section, .feedback-section, .contact-info { padding: 15px; margin: 15px 0; }
                    .completion-notice { padding: 20px; }
                    .completion-notice h2 { font-size: 20px; }
                    .footer { padding: 15px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5 13l4 4L19 7" stroke="#6f42c1" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <h1>SULTANGAZİ BELEDİYESİ</h1>
                    <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Randevu Yönetim Sistemi</p>
                </div>
                <div class="content">
                    <div class="greeting">Sayın Vatandaşımız,</div>
                    
                    <div class="completion-notice">
                        <h2>✅ Randevunuz Tamamlandı</h2>
                        <p>Randevunuz başarıyla gerçekleştirilmiş ve tamamlanmıştır.</p>
                    </div>
                    
                    <div class="appointment-card">
                        <h3>${title}</h3>
                        <div class="detail-row">
                            <span class="label">Tarih:</span>
                            <span class="value">${this.formatDate(date)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Saat:</span>
                            <span class="value">${startTime} - ${endTime}</span>
                        </div>
                        ${location ? `<div class="detail-row"><span class="label">Konum:</span><span class="value">${location}</span></div>` : ''}
                        ${attendee ? `<div class="detail-row"><span class="label">Yetkili Personel:</span><span class="value">${attendee}</span></div>` : ''}
                        ${description ? `<div class="detail-row"><span class="label">Açıklama:</span><span class="value">${description}</span></div>` : ''}
                    </div>
                    
                    <div class="thank-you-section">
                        <h4>🙏 Teşekkürler!</h4>
                        <p>SULTANGAZİ Belediyesi'ni tercih ettiğiniz için teşekkür ederiz. Hizmetimizden memnun kaldığınızı umuyoruz.</p>
                    </div>
                    
                    <div class="feedback-section">
                        <h4>💬 Geri Bildiriminiz Önemli</h4>
                        <p>Hizmet kalitemizi artırmak için görüş ve önerilerinizi bekliyoruz. Lütfen deneyiminizi bizimle paylaşın.</p>
                    </div>
                    
                    <div class="contact-info">
                        <h4>📞 İletişim Bilgileri</h4>
                        <p><strong>Telefon:</strong> 0212 XXX XX XX</p>
                        <p><strong>E-posta:</strong> info@sultangazi.bel.tr</p>
                        <p><strong>Adres:</strong> SULTANGAZİ Belediyesi, İstanbul</p>
                        <p><strong>Geri Bildirim:</strong> feedback@sultangazi.bel.tr</p>
                    </div>
                </div>
                <div class="footer">
                    <p>Bu e-posta SULTANGAZİ Belediyesi Randevu Sistemi tarafından otomatik olarak gönderilmiştir.</p>
                    <p>© 2024 SULTANGAZİ Belediyesi - Tüm hakları saklıdır.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const options = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            weekday: 'long'
        };
        return date.toLocaleDateString('tr-TR', options);
    }

    stripHtml(html) {
        return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    async testConnection() {
        try {
            await this.transporter.verify();
            console.log('E-posta servisi bağlantısı başarılı');
            return { success: true, message: 'E-posta servisi çalışıyor' };
        } catch (error) {
            console.error('E-posta servisi bağlantı hatası:', error);
            return { success: false, message: error.message };
        }
    }
}

module.exports = new EmailService();