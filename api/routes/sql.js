const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

// Configuración de la base de datos (usando variables de entorno)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Middleware para verificar JWT
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu_secret_key');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
};

// Middleware para validar y sanitizar queries SQL
const validateQuery = (req, res, next) => {
    const { query } = req.body;
    
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query no proporcionada o inválida' });
    }

    const upperQuery = query.trim().toUpperCase();
    
    // ✅ Permitir solo SELECT, INSERT, UPDATE, DELETE (pero con restricciones)
    const allowedOperations = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
    const operation = upperQuery.split(' ')[0];
    
    if (!allowedOperations.includes(operation)) {
        return res.status(403).json({ error: `Operación no permitida: ${operation}` });
    }
    
    // ⚠️ Restricciones de seguridad adicionales
    const dangerousPatterns = [
        /DROP\s+TABLE/i,
        /TRUNCATE\s+TABLE/i,
        /ALTER\s+TABLE/i,
        /CREATE\s+TABLE/i,
        /DELETE\s+FROM\s+\w+\s+WHERE\s+1\s*=\s*1/i,  // DELETE sin condición real
        /UPDATE\s+\w+\s+SET\s+\w+\s*=\s*\w+\s+WHERE\s+1\s*=\s*1/i  // UPDATE sin condición real
    ];
    
    for (const pattern of dangerousPatterns) {
        if (pattern.test(query)) {
            return res.status(403).json({ error: 'Query peligrosa detectada' });
        }
    }
    
    // Para DELETE y UPDATE sin WHERE, rechazar
    if (operation === 'DELETE' && !upperQuery.includes('WHERE')) {
        return res.status(403).json({ error: 'DELETE sin WHERE no permitido' });
    }
    
    if (operation === 'UPDATE' && !upperQuery.includes('WHERE')) {
        return res.status(403).json({ error: 'UPDATE sin WHERE no permitido' });
    }
    
    next();
};

// Endpoint principal: /api/sql/query
router.post('/query', verifyToken, validateQuery, async (req, res) => {
    const { query } = req.body;
    const startTime = Date.now();
    
    try {
        // Ejecutar la consulta
        const result = await pool.query(query);
        
        // Formatear respuesta como espera Android
        const response = {
            rows: result.rows,
            rowCount: result.rowCount,
            command: result.command,
            fields: result.fields ? result.fields.map(f => ({ name: f.name })) : [],
            executionTimeMs: Date.now() - startTime
        };
        
        // Log para debugging
        console.log(`SQL ejecutado (${response.executionTimeMs}ms): ${query.substring(0, 100)}${query.length > 100 ? '...' : ''}`);
        
        res.json(response);
        
    } catch (error) {
        console.error('Error en consulta SQL:', error);
        res.status(500).json({ 
            error: 'Error al ejecutar consulta',
            details: error.message,
            query: query.substring(0, 200)
        });
    }
});

// Endpoint para queries específicas de ubicaciones (más restrictivo)
router.post('/location', verifyToken, async (req, res) => {
    const { query } = req.body;
    
    // Solo permitir INSERT/UPDATE/DELETE en ubicaciones_usuarios
    const allowedTables = ['ubicaciones_usuarios'];
    const hasAllowedTable = allowedTables.some(table => 
        query.toLowerCase().includes(table.toLowerCase())
    );
    
    if (!hasAllowedTable) {
        return res.status(403).json({ error: 'Operación no permitida en esta tabla' });
    }
    
    try {
        const result = await pool.query(query);
        res.json({ rows: result.rows, rowCount: result.rowCount });
    } catch (error) {
        console.error('Error en consulta de ubicación:', error);
        res.status(500).json({ error: 'Error al ejecutar consulta' });
    }
});

module.exports = router;