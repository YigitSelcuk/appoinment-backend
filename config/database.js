const mysql = require('mysql2');
const mysql2Promise = require('mysql2/promise');
require('dotenv').config();

// Veritabanı yapılandırması
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3307,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'appointment_app',
  charset: 'utf8mb4',
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false, // Production'da SSL sertifikası kontrolü
    ca: process.env.SSL_CA_PATH ? require('fs').readFileSync(process.env.SSL_CA_PATH) : undefined
  } : false,
  connectionLimit: process.env.NODE_ENV === 'production' ? 20 : 10,
  queueLimit: 0,
  multipleStatements: false,
  timezone: '+03:00', 
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
};

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

const createAsyncConnection = async () => {
  try {
    const connection = await mysql2Promise.createConnection(dbConfig);
    return connection;
  } catch (error) {
    console.error('Async veritabanı bağlantı hatası:', error);
    throw error;
  }
};

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3307,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ,
  charset: 'utf8mb4',
  ssl: false, 
  multipleStatements: false,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+03:00' 
});

const promisePool = mysql2Promise.createPool({
  ...dbConfig,
  waitForConnections: true
});

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

promisePool.query = async (sql, params) => {
  const [rows] = await promisePool.execute(sql, params);
  return rows;
};

module.exports = promisePool;

module.exports.dbConfig = dbConfig;
module.exports.createConnection = createConnection;
module.exports.createAsyncConnection = createAsyncConnection;
module.exports.pool = pool;
module.exports.promisePool = promisePool;
module.exports.testConnection = testConnection;