const db = require('../config/database');

const rehberController = {
  getRehberStats: async (req, res) => {
    try {
      const [totalContactsResult] = await db.execute(
        'SELECT COUNT(*) as total_count FROM contacts'
      );
      
      const totalContacts = totalContactsResult[0].total_count || 0;
      
      const query = `
        SELECT 
          DATE_FORMAT(created_at, '%Y-%m-%d') as date,
          COUNT(*) as daily_count,
          COUNT(CASE WHEN category = 'MÜŞTERİ' THEN 1 END) as customers,
          COUNT(CASE WHEN category = 'TEDARİKÇİ' THEN 1 END) as suppliers,
          COUNT(CASE WHEN category = 'DOKTOR' THEN 1 END) as doctors
        FROM contacts 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
        ORDER BY date DESC
        LIMIT 7
      `;
      
      const [results] = await db.execute(query);
      
      const today = new Date();
      const chartData = [];
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayData = results.find(r => r.date === dateStr);
        chartData.push({
          customers: dayData ? parseInt(dayData.customers) : 0,
          suppliers: dayData ? parseInt(dayData.suppliers) : 0,
          doctors: dayData ? parseInt(dayData.doctors) : 0,
          total_contacts: totalContacts,
          weekly_new: dayData ? parseInt(dayData.daily_count) : 0
        });
      }
      
       if (totalContacts === 0) {
         const emptyData = [];
         for (let i = 6; i >= 0; i--) {
           emptyData.push({
             customers: 0,
             suppliers: 0,
             doctors: 0,
             total_contacts: 0,
             weekly_new: 0
           });
         }
         
         return res.json({
           success: true,
           data: emptyData,
           message: 'Henüz rehber verisi bulunmuyor'
         });
       }
      
      res.json({
        success: true,
        data: chartData,
        message: 'Rehber istatistikleri başarıyla alındı'
      });
      
    } catch (error) {
      console.error('Rehber istatistikleri alınırken hata:', error);
      
      const emptyData = [];
      for (let i = 6; i >= 0; i--) {
        emptyData.push({
          customers: 0,
          suppliers: 0,
          doctors: 0,
          total_contacts: 0,
          weekly_new: 0
        });
      }
      
      res.status(500).json({
        success: false,
        data: emptyData,
        message: 'Rehber istatistikleri alınırken hata oluştu'
      });
    }
  }
};

module.exports = rehberController;