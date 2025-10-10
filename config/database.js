const mysql = require('mysql2');
const mysql2Promise = require('mysql2/promise');
require('dotenv').config();

// Veritabanı yapılandırması
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'appointment_app',
  charset: 'utf8mb4',
  ssl: false, // SSL devre dışı
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: false
};

// Senkron bağlantı (callback tabanlı)
const createConnection = () => {
  const connection = mysql.createConnection(dbConfig);
  
  connection.connect((err) => {
    if (err) {
      console.error('Veritabanı bağlantı hatası:', err);
      return;
    }
    console.log('MySQL veritabanına başarıyla bağlandı');
  });
  
  return connection;
};

// Asenkron bağlantı (promise tabanlı)
const createAsyncConnection = async () => {
  try {
    const connection = await mysql2Promise.createConnection(dbConfig);
    return connection;
  } catch (error) {
    console.error('Async veritabanı bağlantı hatası:', error);
    throw error;
  }
};

// Connection pool oluştur (daha verimli)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ,
  charset: 'utf8mb4',
  ssl: false, // SSL devre dışı
  multipleStatements: false,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Promise tabanlı pool
const promisePool = mysql2Promise.createPool({
  ...dbConfig,
  waitForConnections: true
});

// Bağlantıyı test et
const testConnection = async () => {
  try {
    const connection = await createAsyncConnection();
    await connection.execute('SELECT 1');
    await connection.end();
    console.log('Veritabanı bağlantı testi başarılı');
    return true;
  } catch (error) {
    console.error('Veritabanı bağlantı testi başarısız:', error);
    return false;
  }
};

// Default export olarak promisePool'u kullan
module.exports = promisePool;

// Named exports da ekle
module.exports.dbConfig = dbConfig;
module.exports.createConnection = createConnection;
module.exports.createAsyncConnection = createAsyncConnection;
module.exports.pool = pool;
module.exports.promisePool = promisePool;
module.exports.testConnection = testConnection;