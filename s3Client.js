const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const mysql = require('mysql2/promise');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');

class RenderS3Client {
    constructor(apiBaseUrl = "https://aws-microservice.onrender.com", mysqlConfig = null) {
        this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
        this.dbPool = null;
        
        if (mysqlConfig) {
            this._setupMySQLDatabase(mysqlConfig);
        } else {
            this._setupDefaultMySQL();
        }
    }
    
    _setupDefaultMySQL() {
        try {
            const mysqlConfig = {
                host: 'vardaanwebsites.c1womgmu83di.ap-south-1.rds.amazonaws.com',
                user: 'admin',
                password: 'vardaanwebservices',
                database: 'vardaan_ds',
                port: 3306,
                charset: 'utf8mb4'
            };
            this._setupMySQLDatabase(mysqlConfig);
        } catch (error) {
            console.error('MySQL setup with RDS failed:', error);
            this.dbPool = null;
        }
    }
    
    _setupMySQLDatabase(mysqlConfig) {
        try {
            this.dbPool = mysql.createPool({
                ...mysqlConfig,
                waitForConnections: true,
                connectionLimit: 5,
                queueLimit: 0
            });
            
            console.log("✅ MySQL connection pool initialized successfully");
            this._createTableIfNotExists();
        } catch (error) {
            console.error("❌ MySQL connection failed:", error);
            this.dbPool = null;
        }
    }
    
    async _createTableIfNotExists() {
        if (!this.dbPool) return;
        
        let connection;
        try {
            connection = await this.dbPool.getConnection();
            
            // Create unified file_operations table
            await connection.execute(`
                CREATE TABLE IF NOT EXISTS file_operations (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    operation_type ENUM('upload', 'download', 'export') NOT NULL,
                    user_id VARCHAR(255) NOT NULL,
                    file_name VARCHAR(500) NOT NULL,
                    original_name VARCHAR(500),
                    stored_name VARCHAR(500),
                    s3_url TEXT,
                    s3_key VARCHAR(1000),
                    s3_bucket VARCHAR(255),
                    file_type VARCHAR(50),
                    file_size BIGINT,
                    content_type VARCHAR(255),
                    export_format VARCHAR(20),
                    record_count INT,
                    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
                    error TEXT,
                    metadata JSON,
                    platform VARCHAR(50) DEFAULT 'Render',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP NULL,
                    
                    INDEX idx_user_id (user_id),
                    INDEX idx_operation_type (operation_type),
                    INDEX idx_status (status),
                    INDEX idx_created_at (created_at),
                    INDEX idx_file_type (file_type),
                    INDEX idx_platform (platform),
                    INDEX idx_s3_key (s3_key(255))
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            
            // Create media_library table
            await connection.execute(`
                CREATE TABLE IF NOT EXISTS media_library (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    original_name VARCHAR(500) NOT NULL,
                    s3_url TEXT NOT NULL,
                    file_type ENUM('image', 'video') NOT NULL,
                    category VARCHAR(100) NOT NULL,
                    uploaded_by VARCHAR(255) NOT NULL,
                    uploaded_at TIMESTAMP NOT NULL,
                    
                    INDEX idx_category (category),
                    INDEX idx_file_type (file_type),
                    INDEX idx_uploaded_by (uploaded_by),
                    INDEX idx_uploaded_at (uploaded_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            
            console.log("✅ Database tables verified/created successfully");
        } catch (error) {
            console.error("❌ Table creation error:", error);
        } finally {
            if (connection) connection.release();
        }
    }
    
    async _saveOperationRecord(operationType, operationData) {
        if (!this.dbPool) return null;
        
        let connection;
        try {
            connection = await this.dbPool.getConnection();
            
            const now = new Date();
            const query = `
                INSERT INTO file_operations
                (operation_type, user_id, file_name, original_name, stored_name, s3_url, s3_key, s3_bucket,
                 file_type, file_size, content_type, export_format, record_count, status, metadata, platform,
                 created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const params = [
                operationType,
                operationData.user_id,
                operationData.file_name,
                operationData.original_name || null,
                operationData.stored_name || null,
                operationData.s3_url || '',
                operationData.s3_key || '',
                operationData.s3_bucket || '',
                operationData.file_type || null,
                operationData.file_size || null,
                operationData.content_type || null,
                operationData.export_format || null,
                operationData.record_count || null,
                operationData.status || 'pending',
                JSON.stringify(operationData.metadata || {}),
                'Render',
                now,
                now
            ];
            
            const [result] = await connection.execute(query, params);
            console.log(`📝 Operation recorded in MySQL: ID ${result.insertId}`);
            return result.insertId;
        } catch (error) {
            console.error("❌ MySQL save error:", error);
            return null;
        } finally {
            if (connection) connection.release();
        }
    }
    
    async _updateOperationRecord(operationId, operationData) {
        if (!this.dbPool || !operationId) return;
        
        let connection;
        try {
            connection = await this.dbPool.getConnection();
            
            const updateFields = [];
            const updateValues = [];
            
            const fieldMapping = {
                'stored_name': 'stored_name',
                's3_url': 's3_url',
                's3_key': 's3_key',
                's3_bucket': 's3_bucket',
                'file_type': 'file_type',
                'file_size': 'file_size',
                'content_type': 'content_type',
                'export_format': 'export_format',
                'record_count': 'record_count',
                'status': 'status',
                'error': 'error'
            };
            
            for (const [key, dbField] of Object.entries(fieldMapping)) {
                if (key in operationData) {
                    updateFields.push(`${dbField} = ?`);
                    updateValues.push(operationData[key]);
                }
            }
            
            if ('metadata' in operationData) {
                updateFields.push("metadata = ?");
                updateValues.push(JSON.stringify(operationData.metadata));
            }
            
            updateFields.push("updated_at = ?");
            updateValues.push(new Date());
            
            if (operationData.status === 'completed') {
                updateFields.push("completed_at = ?");
                updateValues.push(new Date());
            }
            
            updateValues.push(operationId);
            
            const query = `UPDATE file_operations SET ${updateFields.join(', ')} WHERE id = ?`;
            await connection.execute(query, updateValues);
            
            console.log(`📝 Operation ${operationId} updated in MySQL`);
        } catch (error) {
            console.error("❌ MySQL update error:", error);
        } finally {
            if (connection) connection.release();
        }
    }
    
    async testConnection() {
        const result = {
            render_status: 'unknown',
            mysql_status: 'unknown',
            overall_success: false
        };
        
        // Test Render microservice
        try {
            console.log("🧪 Testing Render microservice connection...");
            const response = await axios.get(`${this.apiBaseUrl}/health`, { timeout: 30000 });
            result.render_status = 'connected';
            result.render_info = response.data;
            console.log("✅ Render microservice: Connected");
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                result.render_status = 'timeout';
                result.render_error = 'Connection timed out (Render may be spinning up)';
                console.log("⏳ Render microservice: Timeout (may be waking up)");
            } else {
                result.render_status = 'failed';
                result.render_error = error.message;
                console.log(`❌ Render microservice: Failed - ${error.message}`);
            }
        }
        
        // Test MySQL database
        try {
            console.log("🧪 Testing MySQL database connection...");
            if (this.dbPool) {
                const connection = await this.dbPool.getConnection();
                await connection.execute("SELECT 1");
                connection.release();
                result.mysql_status = 'connected';
                console.log("✅ MySQL database: Connected");
            } else {
                result.mysql_status = 'not_configured';
                result.mysql_error = 'Database pool not initialized';
                console.log("⚠️  MySQL database: Not configured");
            }
        } catch (error) {
            result.mysql_status = 'failed';
            result.mysql_error = error.message;
            console.log(`❌ MySQL database: Failed - ${error.message}`);
        }
        
        result.overall_success = (
            result.render_status === 'connected' &&
            ['connected', 'not_configured'].includes(result.mysql_status)
        );
        
        return result;
    }
    
    async upload(filePath, userId = "default-user", customFileName = null) {
        let operationId = null;
        
        try {
            // Validate file exists
            if (!await fs.pathExists(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            
            const fileName = customFileName || path.basename(filePath);
            const stats = await fs.stat(filePath);
            const fileSize = stats.size;
            
            console.log(`📤 Uploading ${fileName} (${fileSize} bytes) via Render...`);
            
            // Save initial operation record
            const operationData = {
                user_id: userId,
                file_name: fileName,
                original_name: path.basename(filePath),
                file_type: path.extname(fileName).slice(1).toLowerCase() || '',
                file_size: fileSize,
                content_type: mime.lookup(filePath) || 'application/octet-stream',
                status: 'pending',
                metadata: {
                    original_path: filePath,
                    platform: 'Render',
                    render_url: this.apiBaseUrl
                }
            };
            
            operationId = await this._saveOperationRecord('upload', operationData);
            
            // Upload to Render
            const url = `${this.apiBaseUrl}/api/upload/${userId}/${fileName}`;
            const fileBuffer = await fs.readFile(filePath);
            
            const formData = new FormData();
            const blob = new Blob([fileBuffer], { type: operationData.content_type });
            formData.append('file', blob, fileName);
            
            const response = await axios.post(url, formData, {
                timeout: 300000,
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            
            const result = response.data;
            
            if (result.success) {
                const fileInfo = result.file;
                
                // Update MySQL with success
                if (operationId) {
                    const updateData = {
                        stored_name: fileInfo.storedName,
                        s3_url: fileInfo.url,
                        s3_key: fileInfo.s3Key,
                        s3_bucket: fileInfo.bucket || '',
                        status: 'completed',
                        metadata: {
                            original_path: filePath,
                            platform: 'Render',
                            render_url: this.apiBaseUrl,
                            upload_response: fileInfo
                        }
                    };
                    await this._updateOperationRecord(operationId, updateData);
                }
                
                console.log(`✅ Upload successful! File: ${fileInfo.storedName}`);
                
                return {
                    success: true,
                    operation_id: operationId,
                    file_info: fileInfo,
                    platform: 'Render',
                    database: 'MySQL',
                    message: 'File uploaded successfully to Render/S3'
                };
            } else {
                // Update MySQL with failure
                if (operationId) {
                    await this._updateOperationRecord(operationId, {
                        status: 'failed',
                        error: result.error
                    });
                }
                return result;
            }
        } catch (error) {
            const errorMsg = error.message;
            console.error(`❌ Upload failed: ${errorMsg}`);
            
            if (operationId) {
                await this._updateOperationRecord(operationId, {
                    status: 'failed',
                    error: errorMsg
                });
            }
            
            return {
                success: false,
                operation_id: operationId,
                error: errorMsg
            };
        }
    }
    
    async download(s3Key, fileName, destinationPath = "./downloads", userId = "default-user") {
        let operationId = null;
        
        try {
            console.log(`⬇️  Downloading ${fileName} via Render...`);
            
            // Save initial operation record
            const operationData = {
                user_id: userId,
                file_name: fileName,
                original_name: fileName,
                s3_key: s3Key,
                status: 'pending',
                metadata: {
                    destination_path: destinationPath,
                    platform: 'Render',
                    render_url: this.apiBaseUrl
                }
            };
            
            operationId = await this._saveOperationRecord('download', operationData);
            
            // Get download URL from Render
            const url = `${this.apiBaseUrl}/api/download/${s3Key}/${fileName}`;
            const response = await axios.get(url, { timeout: 60000 });
            
            const downloadInfo = response.data;
            
            if (!downloadInfo.success) {
                throw new Error(`Failed to get download URL: ${downloadInfo.error}`);
            }
            
            // Download file
            const fileResponse = await axios.get(downloadInfo.downloadUrl, {
                timeout: 300000,
                responseType: 'arraybuffer'
            });
            
            // Save locally
            await fs.ensureDir(destinationPath);
            const isDir = (await fs.stat(destinationPath)).isDirectory();
            const localFilePath = isDir ? path.join(destinationPath, fileName) : destinationPath;
            
            await fs.writeFile(localFilePath, fileResponse.data);
            
            // Update MySQL with success
            if (operationId) {
                await this._updateOperationRecord(operationId, {
                    status: 'completed',
                    file_size: fileResponse.data.length,
                    metadata: {
                        destination_path: destinationPath,
                        local_file_path: localFilePath,
                        platform: 'Render',
                        render_url: this.apiBaseUrl,
                        download_info: downloadInfo
                    }
                });
            }
            
            console.log(`✅ Download successful! Saved to: ${localFilePath}`);
            
            return {
                success: true,
                operation_id: operationId,
                file_path: localFilePath,
                file_size: fileResponse.data.length,
                platform: 'Render',
                database: 'MySQL',
                message: 'File downloaded successfully from Render/S3'
            };
        } catch (error) {
            const errorMsg = error.message;
            console.error(`❌ Download failed: ${errorMsg}`);
            
            if (operationId) {
                await this._updateOperationRecord(operationId, {
                    status: 'failed',
                    error: errorMsg
                });
            }
            
            return {
                success: false,
                operation_id: operationId,
                error: errorMsg
            };
        }
    }
    
    async export(data, exportFormat, fileName, userId = "default-user") {
        let operationId = null;
        
        try {
            // Validate format
            const supportedFormats = ['json', 'csv', 'xml', 'txt'];
            if (!supportedFormats.includes(exportFormat.toLowerCase())) {
                throw new Error(`Unsupported format: ${exportFormat}. Supported: ${supportedFormats}`);
            }
            
            const recordCount = Array.isArray(data) ? data.length : 1;
            console.log(`📊 Exporting ${recordCount} records as ${exportFormat.toUpperCase()} via Render...`);
            
            // Save initial operation record
            const operationData = {
                user_id: userId,
                file_name: fileName,
                original_name: fileName,
                export_format: exportFormat,
                record_count: recordCount,
                status: 'pending',
                metadata: {
                    export_format: exportFormat,
                    data_size: JSON.stringify(data).length,
                    platform: 'Render',
                    render_url: this.apiBaseUrl
                }
            };
            
            operationId = await this._saveOperationRecord('export', operationData);
            
            // Export via Render
            const url = `${this.apiBaseUrl}/api/export/${exportFormat}/${userId}/${fileName}`;
            const payload = { data: data };
            
            const response = await axios.post(url, payload, { timeout: 300000 });
            const result = response.data;
            
            if (result.success) {
                const exportInfo = result.export;
                
                // Update MySQL with success
                if (operationId) {
                    const updateData = {
                        stored_name: exportInfo.storedName,
                        s3_url: exportInfo.url,
                        s3_key: exportInfo.s3Key,
                        s3_bucket: exportInfo.bucket || '',
                        file_size: exportInfo.size,
                        content_type: exportInfo.contentType,
                        status: 'completed',
                        metadata: {
                            export_format: exportFormat,
                            data_size: JSON.stringify(data).length,
                            platform: 'Render',
                            render_url: this.apiBaseUrl,
                            export_response: exportInfo
                        }
                    };
                    await this._updateOperationRecord(operationId, updateData);
                }
                
                console.log(`✅ Export successful! File: ${exportInfo.storedName}`);
                
                return {
                    success: true,
                    operation_id: operationId,
                    export_info: exportInfo,
                    platform: 'Render',
                    database: 'MySQL',
                    message: `Data exported successfully as ${exportFormat.toUpperCase()} via Render`
                };
            } else {
                // Update MySQL with failure
                if (operationId) {
                    await this._updateOperationRecord(operationId, {
                        status: 'failed',
                        error: result.error
                    });
                }
                return result;
            }
        } catch (error) {
            const errorMsg = error.message;
            console.error(`❌ Export failed: ${errorMsg}`);
            
            if (operationId) {
                await this._updateOperationRecord(operationId, {
                    status: 'failed',
                    error: errorMsg
                });
            }
            
            return {
                success: false,
                operation_id: operationId,
                error: errorMsg
            };
        }
    }
    
    async getOperationHistory(userId = null, limit = 10) {
        if (!this.dbPool) return [];
        
        let connection;
        try {
            connection = await this.dbPool.getConnection();
            
            let query, params;
            if (userId) {
                query = "SELECT * FROM file_operations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?";
                params = [userId, limit];
            } else {
                query = "SELECT * FROM file_operations ORDER BY created_at DESC LIMIT ?";
                params = [limit];
            }
            
            const [rows] = await connection.execute(query, params);
            
            // Convert date objects to ISO strings
            return rows.map(row => ({
                ...row,
                created_at: row.created_at ? row.created_at.toISOString() : null,
                updated_at: row.updated_at ? row.updated_at.toISOString() : null,
                completed_at: row.completed_at ? row.completed_at.toISOString() : null
            }));
        } catch (error) {
            console.error("❌ MySQL query error:", error);
            return [];
        } finally {
            if (connection) connection.release();
        }
    }
    
    async getOperationStats() {
        if (!this.dbPool) return {};
        
        let connection;
        try {
            connection = await this.dbPool.getConnection();
            
            // Get overall stats
            const [operationStats] = await connection.execute(`
                SELECT
                    operation_type,
                    COUNT(*) as total_count,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                    AVG(file_size) as avg_file_size,
                    SUM(file_size) as total_file_size
                FROM file_operations
                GROUP BY operation_type
            `);
            
            const stats = {
                operations_by_type: operationStats,
                total_operations: 0,
                total_completed: 0,
                total_failed: 0
            };
            
            // Calculate totals
            for (const opStat of operationStats) {
                stats.total_operations += opStat.total_count;
                stats.total_completed += opStat.completed_count;
                stats.total_failed += opStat.failed_count;
            }
            
            // Get recent activity
            const [recentActivity] = await connection.execute(`
                SELECT DATE(created_at) as date, COUNT(*) as operations
                FROM file_operations
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            `);
            
            stats.recent_activity = recentActivity;
            return stats;
        } catch (error) {
            console.error("❌ MySQL stats query error:", error);
            return {};
        } finally {
            if (connection) connection.release();
        }
    }
}

// Helper function to create client
function createRenderMySQLClient(mysqlConfig = null) {
    try {
        if (!mysqlConfig) {
            mysqlConfig = {
                host: process.env.DB_HOST || 'localhost',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || 'root',
                database: process.env.DB_NAME || 'vardaan_ds',
                port: parseInt(process.env.DB_PORT) || 3306
            };
        }
        
        console.log(`🔧 Creating S3 client with MySQL config: ${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`);
        const client = new RenderS3Client("https://aws-microservice.onrender.com", mysqlConfig);
        console.log("✅ S3 client created successfully");
        return client;
    } catch (error) {
        console.error(`❌ S3 client creation failed: ${error.message}`);
        // Try to create client without MySQL
        try {
            const client = new RenderS3Client("https://aws-microservice.onrender.com", null);
            console.log("⚠️  S3 client created without MySQL (fallback mode)");
            return client;
        } catch (fallbackError) {
            console.error(`❌ Fallback S3 client creation failed: ${fallbackError.message}`);
            throw new Error(`S3 client creation failed: ${error.message}, Fallback failed: ${fallbackError.message}`);
        }
    }
}

module.exports = {
    RenderS3Client,
    createRenderMySQLClient
}; 