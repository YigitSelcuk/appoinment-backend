const emailService = require('../services/emailService');
const db = require('../config/database');

// E-posta konfigürasyonu test endpoint'i
exports.getEmailConfig = async (req, res) => {
    try {
        const testResult = await emailService.testConnection();
        res.json({
            success: true,
            message: 'E-posta konfigürasyonu kontrol edildi',
            data: testResult
        });
    } catch (error) {
        console.error('E-posta konfigürasyon hatası:', error);
        res.status(500).json({
            success: false,
            message: 'E-posta konfigürasyonu kontrol edilemedi',
            error: error.message
        });
    }
};

// Tek e-posta gönder
exports.sendEmail = async (req, res) => {
    try {
        const { to, subject, htmlContent, textContent } = req.body;
        
        if (!to || !subject || !htmlContent) {
            return res.status(400).json({
                success: false,
                message: 'Gerekli alanlar eksik: to, subject, htmlContent'
            });
        }

        const result = await emailService.sendEmail(to, subject, htmlContent, textContent);
        
        // E-posta gönderim kaydını veritabanına kaydet
        await db.execute(
            'INSERT INTO email_logs (user_id, recipient, subject, status, sent_at) VALUES (?, ?, ?, ?, NOW())',
            [req.user.id, to, subject, 'sent']
        );

        res.json({
            success: true,
            message: 'E-posta başarıyla gönderildi',
            data: result
        });
    } catch (error) {
        console.error('E-posta gönderme hatası:', error);
        
        // Hata kaydını veritabanına kaydet
        try {
            await db.execute(
                'INSERT INTO email_logs (user_id, recipient, subject, status, error_message, sent_at) VALUES (?, ?, ?, ?, ?, NOW())',
                [req.user.id, req.body.to, req.body.subject, 'failed', error.message]
            );
        } catch (dbError) {
            console.error('E-posta log kaydetme hatası:', dbError);
        }

        res.status(500).json({
            success: false,
            message: 'E-posta gönderilirken hata oluştu',
            error: error.message
        });
    }
};

// Randevu bildirimi e-postası gönder
exports.sendAppointmentNotification = async (req, res) => {
    try {
        const { appointmentData, recipientEmail, notificationType } = req.body;
        
        if (!appointmentData || !recipientEmail) {
            return res.status(400).json({
                success: false,
                message: 'Gerekli alanlar eksik: appointmentData, recipientEmail'
            });
        }

        const result = await emailService.sendAppointmentNotification(
            appointmentData, 
            recipientEmail, 
            notificationType || 'created'
        );
        
        // E-posta gönderim kaydını veritabanına kaydet
        await db.execute(
            'INSERT INTO email_logs (user_id, recipient, subject, email_type, appointment_id, status, sent_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [
                req.user.id, 
                recipientEmail, 
                `Randevu Bildirimi: ${appointmentData.title}`,
                'appointment_notification',
                appointmentData.id || null,
                'sent'
            ]
        );

        res.json({
            success: true,
            message: 'Randevu bildirimi e-postası başarıyla gönderildi',
            data: result
        });
    } catch (error) {
        console.error('Randevu bildirimi e-postası gönderme hatası:', error);
        
        // Hata kaydını veritabanına kaydet
        try {
            await db.execute(
                'INSERT INTO email_logs (user_id, recipient, subject, email_type, appointment_id, status, error_message, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
                [
                    req.user.id, 
                    req.body.recipientEmail, 
                    `Randevu Bildirimi: ${req.body.appointmentData?.title || 'Bilinmeyen'}`,
                    'appointment_notification',
                    req.body.appointmentData?.id || null,
                    'failed',
                    error.message
                ]
            );
        } catch (dbError) {
            console.error('E-posta log kaydetme hatası:', dbError);
        }

        res.status(500).json({
            success: false,
            message: 'Randevu bildirimi e-postası gönderilirken hata oluştu',
            error: error.message
        });
    }
};

// E-posta geçmişini getir
exports.getEmailHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20, status, email_type } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE user_id = ?';
        let queryParams = [userId];

        if (status) {
            whereClause += ' AND status = ?';
            queryParams.push(status);
        }

        if (email_type) {
            whereClause += ' AND email_type = ?';
            queryParams.push(email_type);
        }

        const [rows] = await db.execute(
            `SELECT id, recipient, subject, email_type, appointment_id, status, error_message, sent_at 
             FROM email_logs 
             ${whereClause} 
             ORDER BY sent_at DESC 
             LIMIT ? OFFSET ?`,
            [...queryParams, parseInt(limit), parseInt(offset)]
        );

        const [countResult] = await db.execute(
            `SELECT COUNT(*) as total FROM email_logs ${whereClause}`,
            queryParams
        );

        res.json({
            success: true,
            message: 'E-posta geçmişi başarıyla getirildi',
            data: {
                emails: rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult[0].total,
                    totalPages: Math.ceil(countResult[0].total / limit)
                }
            }
        });
    } catch (error) {
        console.error('E-posta geçmişi getirme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'E-posta geçmişi getirilirken hata oluştu',
            error: error.message
        });
    }
};

// E-posta istatistikleri
exports.getEmailStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate } = req.query;

        let dateFilter = '';
        let queryParams = [userId];

        if (startDate && endDate) {
            dateFilter = 'AND DATE(sent_at) BETWEEN ? AND ?';
            queryParams.push(startDate, endDate);
        }

        const [stats] = await db.execute(
            `SELECT 
                COUNT(*) as total_emails,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_emails,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_emails,
                SUM(CASE WHEN email_type = 'appointment_notification' THEN 1 ELSE 0 END) as appointment_notifications
             FROM email_logs 
             WHERE user_id = ? ${dateFilter}`,
            queryParams
        );

        const [typeStats] = await db.execute(
            `SELECT 
                email_type,
                COUNT(*) as count,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_count
             FROM email_logs 
             WHERE user_id = ? ${dateFilter}
             GROUP BY email_type`,
            queryParams
        );

        res.json({
            success: true,
            message: 'E-posta istatistikleri başarıyla getirildi',
            data: {
                overview: stats[0],
                byType: typeStats
            }
        });
    } catch (error) {
        console.error('E-posta istatistikleri getirme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'E-posta istatistikleri getirilirken hata oluştu',
            error: error.message
        });
    }
};