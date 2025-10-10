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

    // Yeni randevu e-posta şablonu
    generateAppointmentCreatedEmail(appointmentData) {
        const { title, date, startTime, endTime, location, description, attendee } = appointmentData;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #FF6B35; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
                .appointment-details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
                .detail-row { margin: 10px 0; }
                .label { font-weight: bold; color: #FF6B35; }
                .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🗓️ Yeni Randevu Oluşturuldu</h1>
                </div>
                <div class="content">
                    <p>Merhaba,</p>
                    <p>Sizin için yeni bir randevu oluşturulmuştur. Detaylar aşağıdadır:</p>
                    
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
                    
                    <p>Randevunuzu unutmayın! Herhangi bir değişiklik olması durumunda size bilgi verilecektir.</p>
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

    // Randevu güncelleme e-posta şablonu
    generateAppointmentUpdatedEmail(appointmentData) {
        const { title, date, startTime, endTime, location, description, attendee, changes } = appointmentData;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #3C02AA; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
                .appointment-details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
                .detail-row { margin: 10px 0; }
                .label { font-weight: bold; color: #3C02AA; }
                .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📝 Randevu Güncellendi</h1>
                </div>
                <div class="content">
                    <p>Merhaba,</p>
                    <p>Randevunuz güncellenmiştir. Yeni detaylar aşağıdadır:</p>
                    
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
                    
                    ${changes ? `
                    <div class="appointment-details">
                        <h3 style="color: #3C02AA; margin-bottom: 10px;">📋 Yapılan Değişiklikler:</h3>
                        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px;">
                            <pre style="margin: 0; font-family: Arial, sans-serif; white-space: pre-wrap;">${changes}</pre>
                        </div>
                    </div>
                    ` : ''}
                    
                    <p>Lütfen yeni randevu detaylarını not alın.</p>
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

    // Randevu iptal e-posta şablonu
    generateAppointmentCancelledEmail(appointmentData) {
        const { title, date, startTime, endTime } = appointmentData;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
                .appointment-details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
                .detail-row { margin: 10px 0; }
                .label { font-weight: bold; color: #dc3545; }
                .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>❌ Randevu İptal Edildi</h1>
                </div>
                <div class="content">
                    <p>Merhaba,</p>
                    <p>Aşağıdaki randevunuz iptal edilmiştir:</p>
                    
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
                    </div>
                    
                    <p>Yeni bir randevu oluşturmak için lütfen sistem ile iletişime geçin.</p>
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
                    <h1>⏰ Randevu Hatırlatması</h1>
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
                    <p>© 2024 Randevu Yönetim Sistemi</p>
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