const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 50,              // Aumentado de 10 a 50 (5x más usuarios)
    queueLimit: 0,
    connectTimeout: 10000,            // Timeout de conexión: 10 segundos
    idleTimeout: 60000,               // Cerrar conexiones inactivas después de 60 seg
    maxIdle: 10,                      // Máximo 10 conexiones inactivas
    enableKeepAlive: true,            // Mantener conexiones vivas
    keepAliveInitialDelay: 0
};

// Crear pool de conexiones
const pool = mysql.createPool(dbConfig);

// Función para probar conexión
const testConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Conectado a MySQL');
        connection.release();
        return true;
    } catch (error) {
        console.error('-Error conectando a MySQL:', error.message);
        return false;
    }
};

module.exports = {
    pool,
    testConnection
};