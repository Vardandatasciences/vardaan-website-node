const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs-extra');
const { parsePhoneNumber } = require('libphonenumber-js');
const mime = require('mime-types');
require('dotenv').config();

// Import custom modules
const { RenderS3Client } = require('./s3Client');
const { submitLapsecPricing, submitProductPricing, getCurrency } = require('./pricingService');

const app = express();
const PORT = process.env.PORT || 5000;

// Configure CORS
const ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000", 
    "http://localhost:3001",
    "https://vardaandatasciences.dbk39rik9ypyn.amplifyapp.com",
    process.env.FRONTEND_URL || '',
    process.env.PRODUCTION_URL || '',
    "https://your-app.netlify.app",
    "https://your-app.vercel.app", 
    "https://your-domain.com",
    "https://www.your-domain.com"
].filter(origin => origin);

app.use(cors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files (commented out for backend-only deployment)
// app.use('/static', express.static(path.join(__dirname, '../../build/static')));
// app.use('/assets', express.static(path.join(__dirname, '../../build/assets')));

// Database configuration
const DB_CONFIG = {
    host: 'vardaanwebsites.c1womgmu83di.ap-south-1.rds.amazonaws.com',
    user: 'admin',
    password: 'vardaanwebservices',
    database: 'vardaan_ds',
    port: 3306,
    charset: 'utf8mb4'
};

// Create connection pool
let dbPool;
try {
    dbPool = mysql.createPool({
        ...DB_CONFIG,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log("✅ MySQL connection pool initialized");
} catch (error) {
    console.error("❌ MySQL connection failed:", error);
}

// Email configuration
const EMAIL_CONFIG = {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_HOST_USER || 'rupinirudroju@gmail.com',
        pass: process.env.EMAIL_HOST_PASSWORD || 'wzcu fnyh dssu laeb'
    }
};

const EMAIL_RECEIVER = process.env.EMAIL_RECEIVER || 'vinnurudroju28@gmail.com';

// Initialize S3 client
let s3Client;
try {
    console.log("🔧 Initializing S3 client...");
    console.log("  Render URL: https://aws-microservice.onrender.com");
    console.log("  Database config:", {
        host: DB_CONFIG.host,
        user: DB_CONFIG.user,
        database: DB_CONFIG.database,
        port: DB_CONFIG.port
    });
    
    s3Client = new RenderS3Client("https://aws-microservice.onrender.com", DB_CONFIG);
    console.log("✅ S3 client initialized successfully");
    
    // Test the client immediately
    s3Client.testConnection().then(result => {
        if (result.overall_success) {
            console.log("✅ S3 client connection test passed");
        } else {
            console.log("⚠️  S3 client connection test issues:");
            if (result.render_error) console.log("  Render:", result.render_error);
            if (result.mysql_error) console.log("  MySQL:", result.mysql_error);
        }
    }).catch(error => {
        console.error("❌ S3 client connection test failed:", error.message);
    });
    
} catch (error) {
    console.error("❌ S3 client initialization failed:", error.message);
    console.error("❌ Stack trace:", error.stack);
    s3Client = null;
}

// Utility functions
const sendHtmlEmail = async (toEmail, subject, htmlContent, textContent = null) => {
    try {
        const transporter = nodemailer.createTransporter(EMAIL_CONFIG);
        
        const mailOptions = {
            from: EMAIL_CONFIG.auth.user,
            to: toEmail,
            subject: subject,
            text: textContent || htmlContent.replace(/<[^>]*>/g, ''),
            html: htmlContent
        };
        
        await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent successfully to ${toEmail}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to send email to ${toEmail}:`, error);
        return false;
    }
};

const validateEmail = (email) => {
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailPattern.test(email);
};

const validatePhone = (phoneNumber, countryCode) => {
    try {
        const parsed = parsePhoneNumber(phoneNumber, countryCode);
        return parsed && parsed.isValid();
    } catch (error) {
        return false;
    }
};

// Multer configuration for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Cache control middleware
app.use((req, res, next) => {
    if (req.path.startsWith('/static/') || req.path.startsWith('/assets/')) {
        res.set('Cache-Control', 'public, max-age=31536000');
    } else if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
        res.set('Cache-Control', 'public, max-age=86400');
    } else {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    next();
});

// Routes

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Vardaan DS Unified API',
        version: '2.0.0',
        endpoints: {
            'POST /api/contact': 'Submit a contact form',
            'GET /api/contacts': 'Get all contact submissions (admin)',
            'GET /api/health': 'Health check',
            'GET /api/management-team': 'Get management team data',
            'GET /api/media': 'Get media files by category and type',
            'GET /api/media/categories': 'Get all available media categories',
            'GET /api/media/stats': 'Get media library statistics',
            'GET /api/media/debug': 'Debug endpoint for all media files',
            'GET /api/job-listings': 'Get active job listings',
            'POST /api/job-application': 'Submit job application with resume',
            'GET /api/nav-categories': 'Get navigation categories',
            'GET /api/nav-items': 'Get navigation items',
            'POST /api/lapsec-pricing': 'Submit Lapsec pricing inquiry',
            'POST /api/product-pricing': 'Submit general product pricing inquiry',
            'POST /api/subscribe-email': 'Subscribe to email newsletter',
            'GET /api/get-currency': 'Get currency based on IP',
            'GET /api/s3-operations': 'Get S3 file operations history',
            'GET /api/s3-stats': 'Get S3 operations statistics',
            'GET /api/s3-test': 'Test S3 connection and health'
        },
        status: 'running',
        integrated_services: [
            'Contact Management',
            'Management Team API',
            'Media Library API',
            'Job Applications',
            'Navigation Management',
            'Product Pricing',
            'Email Subscriptions',
            'Static File Serving'
        ]
    });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    let dbStatus = 'disconnected';
    let s3Status = 'disconnected';
    
    try {
        if (dbPool) {
            await dbPool.execute('SELECT 1');
            dbStatus = 'connected';
        }
    } catch (error) {
        console.error('Database health check failed:', error);
    }
    
    try {
        if (s3Client) {
            const testResult = await s3Client.testConnection();
            s3Status = testResult.overall_success ? 'connected' : 'failed';
        }
    } catch (error) {
        console.error('S3 health check failed:', error);
    }

    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        port: PORT,
        database: dbStatus,
        s3_service: s3Status,
        environment: process.env.NODE_ENV || 'development'
    });
});

// Import and use pricing routes
app.get('/api/get-currency', getCurrency);
app.post('/api/lapsec-pricing', submitLapsecPricing);
app.post('/api/product-pricing', submitProductPricing);

// S3 Operations tracking endpoints
app.get('/api/s3-operations', async (req, res) => {
    try {
        const { user_id, limit = 20 } = req.query;
        
        if (!s3Client) {
            return res.status(503).json({
                success: false,
                message: 'S3 client not available'
            });
        }
        
        const history = await s3Client.getOperationHistory(user_id, parseInt(limit));
        
        res.json({
            success: true,
            operations: history,
            count: history.length
        });
        
    } catch (error) {
        console.error('S3 operations history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch operations history',
            error: error.message
        });
    }
});

app.get('/api/s3-stats', async (req, res) => {
    try {
        if (!s3Client) {
            return res.status(503).json({
                success: false,
                message: 'S3 client not available'
            });
        }
        
        const stats = await s3Client.getOperationStats();
        
        res.json({
            success: true,
            stats: stats
        });
        
    } catch (error) {
        console.error('S3 stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch S3 statistics',
            error: error.message
        });
    }
});

app.get('/api/s3-test', async (req, res) => {
    try {
        if (!s3Client) {
            return res.status(503).json({
                success: false,
                message: 'S3 client not initialized'
            });
        }
        
        const testResult = await s3Client.testConnection();
        
        res.json({
            success: testResult.overall_success,
            test_results: testResult
        });
        
    } catch (error) {
        console.error('S3 test error:', error);
        res.status(500).json({
            success: false,
            message: 'S3 test failed',
            error: error.message
        });
    }
});

// Contact form submission
app.post('/api/contact', async (req, res) => {
    let connection;
    
    try {
        const data = req.body;
        
        if (!data) {
            return res.status(400).json({
                success: false,
                message: 'No data provided'
            });
        }
        
        // Validate required fields
        const requiredFields = ['fullname', 'email', 'subject', 'message'];
        for (const field of requiredFields) {
            if (!data[field]) {
                return res.status(400).json({
                    success: false,
                    message: `Missing required field: ${field}`
                });
            }
        }
        
        const { fullname, email, phone = '', subject: rawSubject, otherSubject = '', message } = data;
        
        // Handle "others" subject case
        const subject = rawSubject.toLowerCase() === 'others' && otherSubject ? otherSubject : rawSubject;
        
        // Validate email format
        if (!validateEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }
        
        // Get database connection
        connection = await dbPool.getConnection();
        
        // Create table if not exists
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS contact_us (
                contact_id INT AUTO_INCREMENT PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone_number VARCHAR(20),
                subject VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Insert data
        const [result] = await connection.execute(
            'INSERT INTO contact_us (full_name, email, phone_number, subject, message) VALUES (?, ?, ?, ?, ?)',
            [fullname, email, phone, subject, message]
        );
        
        const contactId = result.insertId;
        
        // Send admin notification email
        const adminHtml = `
            <h2>New Contact Form Submission Received</h2>
            <p><strong>Contact ID:</strong> ${contactId}</p>
            <p><strong>Full Name:</strong> ${fullname}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Message:</strong> ${message}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
        `;
        
        await sendHtmlEmail(EMAIL_RECEIVER, 'New Contact Form Submission Received', adminHtml);
        
        // Send confirmation email to customer
        const customerHtml = `
            <h2>Thank You for Contacting Vardaan Data Sciences!</h2>
            <p>Dear ${fullname},</p>
            <p>Thank you for contacting Vardaan Data Sciences! We have received your message and appreciate you taking the time to reach out to us.</p>
            <p><strong>Your inquiry details:</strong></p>
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Message:</strong> ${message}</p>
            <p>Our team will review your message and get back to you within 24-48 hours.</p>
            <p>Best regards,<br>The Vardaan Data Sciences Team</p>
        `;
        
        await sendHtmlEmail(email, 'Thank You for Contacting Vardaan Data Sciences!', customerHtml);
        
        res.status(201).json({
            success: true,
            message: 'Contact form submitted successfully',
            contact_id: contactId
        });
        
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({
            success: false,
            message: 'An unexpected error occurred'
        });
    } finally {
        if (connection) connection.release();
    }
});

// Get all contacts (admin)
app.get('/api/contacts', async (req, res) => {
    let connection;
    
    try {
        connection = await dbPool.getConnection();
        const [rows] = await connection.execute('SELECT * FROM contact_us ORDER BY created_at DESC');
        
        res.json({
            success: true,
            contacts: rows
        });
        
    } catch (error) {
        console.error('Get contacts error:', error);
        res.status(500).json({
            success: false,
            message: 'Database error occurred'
        });
    } finally {
        if (connection) connection.release();
    }
});

// Job listings
app.get('/api/job-listings', async (req, res) => {
    let connection;
    
    try {
        connection = await dbPool.getConnection();
        
        // Create table if not exists
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS job_listings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                category VARCHAR(100) NOT NULL,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                location VARCHAR(255),
                salary VARCHAR(100),
                tags TEXT,
                status ENUM('A', 'I') DEFAULT 'A',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        const [rows] = await connection.execute('SELECT id, category, type, title, description, tags FROM job_listings WHERE status = "A"');
        
        res.json({
            success: true,
            jobs: rows
        });
        
    } catch (error) {
        console.error('Job listings error:', error);
        res.status(500).json({
            success: false,
            message: 'Database error occurred'
        });
    } finally {
        if (connection) connection.release();
    }
});

// Navigation categories
app.get('/api/nav-categories', async (req, res) => {
    let connection;
    
    try {
        connection = await dbPool.getConnection();
        
        // Create table if not exists
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS nav_categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                display_order INT DEFAULT 0,
                status ENUM('A', 'I') DEFAULT 'A',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        const [rows] = await connection.execute('SELECT * FROM nav_categories ORDER BY display_order ASC');
        
        res.json({
            success: true,
            categories: rows
        });
        
    } catch (error) {
        console.error('Navigation categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Database error occurred'
        });
    } finally {
        if (connection) connection.release();
    }
});

// Navigation items
app.get('/api/nav-items', async (req, res) => {
    let connection;
    
    try {
        connection = await dbPool.getConnection();
        
        // Create table if not exists
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS nav_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                category_id INT,
                name VARCHAR(100) NOT NULL,
                url VARCHAR(255) NOT NULL,
                display_order INT DEFAULT 0,
                status ENUM('A', 'I') DEFAULT 'A',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES nav_categories(id) ON DELETE SET NULL
            )
        `);
        
        const [rows] = await connection.execute('SELECT * FROM nav_items WHERE status = "A" ORDER BY category_id ASC, display_order ASC');
        
        res.json({
            success: true,
            items: rows
        });
        
    } catch (error) {
        console.error('Navigation items error:', error);
        res.status(500).json({
            success: false,
            message: 'Database error occurred'
        });
    } finally {
        if (connection) connection.release();
    }
});

// Job application submission
app.post('/api/job-application', upload.single('resume'), async (req, res) => {
    let connection;
    
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Resume file is required'
            });
        }
        
        const { firstName, lastName, email, phone, jobTitle = '' } = req.body;
        
        if (!firstName || !lastName || !email || !phone) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }
        
        // Validate file type (optional but recommended)
        const allowedExtensions = ['.pdf', '.doc', '.docx'];
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
        if (!allowedExtensions.includes(fileExtension)) {
            // Clean up uploaded file
            try {
                await fs.remove(req.file.path);
            } catch (cleanupError) {
                console.warn('Failed to cleanup invalid file:', cleanupError);
            }
            
            return res.status(400).json({
                success: false,
                message: 'Invalid file type. Only PDF, DOC, and DOCX files are allowed.'
            });
        }
        
        console.log(`📤 Processing job application for ${firstName} ${lastName} - ${email}`);
        console.log(`📄 Resume: ${req.file.originalname} (${req.file.size} bytes)`);
        
        // Check if S3 client is available
        if (!s3Client) {
            throw new Error('S3 client not initialized. Please check server startup logs.');
        }
        
        console.log('🌐 S3 client available, starting upload...');
        
        // Upload resume to S3 with category for better organization
        const uploadResult = await s3Client.upload(
            req.file.path, 
            email, 
            req.file.originalname, 
            'job-applications'
        );
        
        if (!uploadResult.success) {
            // Clean up uploaded file on failure
            try {
                await fs.remove(req.file.path);
            } catch (cleanupError) {
                console.warn('Failed to cleanup temp file after upload failure:', cleanupError);
            }
            
            return res.status(500).json({
                success: false,
                message: 'Failed to upload resume to S3',
                error: uploadResult.error,
                operation_id: uploadResult.operation_id
            });
        }
        
        const s3Url = uploadResult.file_info.url;
        const s3Key = uploadResult.file_info.s3Key;
        
        console.log(`✅ Resume uploaded to S3: ${s3Url}`);
        
        // Save to database
        connection = await dbPool.getConnection();
        
        // Create table if not exists
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS job_applications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_title VARCHAR(255),
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone_number VARCHAR(20) NOT NULL,
                resume_file_path TEXT NOT NULL,
                resume_s3_key VARCHAR(1000),
                resume_original_name VARCHAR(500),
                file_size BIGINT,
                s3_operation_id INT,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status ENUM('pending', 'reviewed', 'shortlisted', 'rejected') DEFAULT 'pending',
                
                INDEX idx_email (email),
                INDEX idx_status (status),
                INDEX idx_submitted_at (submitted_at)
            )
        `);
        
        const [result] = await connection.execute(
            'INSERT INTO job_applications (job_title, first_name, last_name, email, phone_number, resume_file_path, resume_s3_key, resume_original_name, file_size, s3_operation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [jobTitle, firstName, lastName, email, phone, s3Url, s3Key, req.file.originalname, req.file.size, uploadResult.operation_id]
        );
        
        const appId = result.insertId;
        
        console.log(`💾 Job application saved to database with ID: ${appId}`);
        
        // Clean up uploaded file
        try {
            await fs.remove(req.file.path);
        } catch (cleanupError) {
            console.warn('Failed to cleanup temp file:', cleanupError);
        }
        
        // Send notification emails
        const adminSubject = `New Job Application Received - ${jobTitle || 'General Application'}`;
        const adminHtml = `
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #3570f7; border-bottom: 2px solid #3570f7; padding-bottom: 10px;">
                    New Job Application Received
                </h2>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #222;">Application Details</h3>
                    <p><strong>Application ID:</strong> ${appId}</p>
                    <p><strong>S3 Operation ID:</strong> ${uploadResult.operation_id}</p>
                    <p><strong>Job Title:</strong> ${jobTitle || 'General Application'}</p>
                    <p><strong>Applicant Name:</strong> ${firstName} ${lastName}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Phone:</strong> ${phone}</p>
                    <p><strong>Resume File:</strong> ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)</p>
                    <p><strong>Resume URL:</strong> <a href="${s3Url}" style="color: #3570f7;" target="_blank">Download Resume</a></p>
                    <p><strong>S3 Key:</strong> <code style="background: #f1f1f1; padding: 2px 4px; border-radius: 3px;">${s3Key}</code></p>
                    <p><strong>Submitted Date:</strong> ${new Date().toLocaleString()}</p>
                </div>
                <div style="background: #e8f5e8; padding: 15px; border-radius: 5px; border-left: 4px solid #4caf50; margin: 20px 0;">
                    <p style="margin: 0;"><strong>✅ File Upload Status:</strong> Successfully uploaded to S3 cloud storage</p>
                    <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">Platform: ${uploadResult.platform} | Database: ${uploadResult.database}</p>
                </div>
                <p style="background: #e3f2fd; padding: 15px; border-radius: 5px; border-left: 4px solid #2196f3;">
                    <strong>Action Required:</strong> Please review this application and respond to the candidate as soon as possible.
                </p>
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
                    <p>This is an automated notification from the Vardaan Data Sciences job application system.</p>
                    <p>File stored securely in AWS S3 with full operation tracking.</p>
                </div>
            </div>
        </body>
        </html>
        `;
        const adminText = `
A new job application has been received:

Application ID: ${appId}
S3 Operation ID: ${uploadResult.operation_id}
Job Title: ${jobTitle || 'General Application'}
Applicant Name: ${firstName} ${lastName}
Email: ${email}
Phone: ${phone}
Resume File: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)
Resume URL: ${s3Url}
S3 Key: ${s3Key}
Date: ${new Date().toLocaleString()}

File Upload Status: ✅ Successfully uploaded to S3 cloud storage
Platform: ${uploadResult.platform} | Database: ${uploadResult.database}

Please review this application and respond to the candidate as soon as possible.

This file is stored securely in AWS S3 with full operation tracking.
        `;
        
        await sendHtmlEmail(EMAIL_RECEIVER, adminSubject, adminHtml, adminText);
        
        // Send confirmation email to applicant
        const applicantSubject = 'Thank You for Your Job Application - Vardaan Data Sciences';
        const applicantHtml = `
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #3570f7; margin-bottom: 10px;">Thank You!</h1>
                    <p style="font-size: 18px; color: #666;">Your application has been successfully submitted</p>
                </div>
                
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #222;">Application Details</h3>
                    <p><strong>Application ID:</strong> ${appId}</p>
                    <p><strong>Job Title:</strong> ${jobTitle || 'General Application'}</p>
                    <p><strong>Resume File:</strong> ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)</p>
                    <p><strong>Submitted Date:</strong> ${new Date().toLocaleString()}</p>
                    <p><strong>Resume Link:</strong> <a href="${s3Url}" style="color: #3570f7;" target="_blank">Access Your Resume</a></p>
                </div>
                
                <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #2e7d32;">✅ File Upload Confirmation</h3>
                    <p style="margin: 0;">Your resume has been securely uploaded to our cloud storage system.</p>
                    <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">Upload ID: ${uploadResult.operation_id} | Platform: ${uploadResult.platform}</p>
                </div>
                
                <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #2e7d32;">What happens next?</h3>
                    <ol style="margin: 0; padding-left: 20px;">
                        <li>Our HR team will review your application within 2-3 business days</li>
                        <li>If your profile matches our requirements, we will contact you for the next steps</li>
                        <li>You may be invited for an initial screening call or technical assessment</li>
                        <li>We will keep you updated throughout the process</li>
                    </ol>
                </div>
                
                <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #856404;">Important Notes</h3>
                    <ul style="margin: 0; padding-left: 20px;">
                        <li>Please ensure your contact information (email and phone) is current</li>
                        <li>You can access your resume anytime using the link provided above</li>
                        <li>If you have any questions, please reply to this email or contact us at info@vardaanglobal.com</li>
                    </ul>
                </div>
                
                <p style="text-align: center; margin-top: 30px; font-style: italic; color: #666;">
                    We're excited about the possibility of having you join our team and contribute to our mission of transforming businesses through data-driven insights.
                </p>
                
                <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; font-weight: bold;">Best regards,</p>
                    <p style="margin: 5px 0;">The Vardaan Data Sciences Team</p>
                </div>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center;">
                    <p style="margin: 5px 0;"><strong>Vardaan Data Sciences Pvt Ltd</strong></p>
                    <p style="margin: 5px 0;">Aurum, 1st Floor, Plot No 57, Jayabheri Enclave</p>
                    <p style="margin: 5px 0;">Gachibowli Hyderabad-500032 INDIA</p>
                    <p style="margin: 5px 0;">Phone: +91 40-35171118, +91 40-35171119</p>
                    <p style="margin: 5px 0;">Email: info@vardaanglobal.com</p>
                </div>
            </div>
        </body>
        </html>
        `;
        const applicantText = `
Dear ${firstName} ${lastName},

Thank you for submitting your job application to Vardaan Data Sciences! We have successfully received your application and appreciate your interest in joining our team.

Application Details:
Application ID: ${appId}
Job Title: ${jobTitle || 'General Application'}
Resume File: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)
Submitted Date: ${new Date().toLocaleString()}
Resume Link: ${s3Url}

✅ File Upload Confirmation:
Your resume has been securely uploaded to our cloud storage system.
Upload ID: ${uploadResult.operation_id} | Platform: ${uploadResult.platform}

What happens next:
1. Our HR team will review your application within 2-3 business days
2. If your profile matches our requirements, we will contact you for the next steps
3. You may be invited for an initial screening call or technical assessment
4. We will keep you updated throughout the process

Important Notes:
• Please ensure your contact information (email and phone) is current
• You can access your resume anytime using the link provided above
• If you have any questions, please reply to this email or contact us at info@vardaanglobal.com

We're excited about the possibility of having you join our team and contribute to our mission of transforming businesses through data-driven insights.

Best regards,
The Vardaan Data Sciences Team

---
Vardaan Data Sciences Pvt Ltd
Aurum, 1st Floor, Plot No 57, Jayabheri Enclave
Gachibowli Hyderabad-500032 INDIA
Phone: +91 40-35171118, +91 40-35171119
Email: info@vardaanglobal.com
        `;
        
        await sendHtmlEmail(email, applicantSubject, applicantHtml, applicantText);
        
        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            application_id: appId,
            s3_operation_id: uploadResult.operation_id,
            resume_url: s3Url,
            resume_s3_key: s3Key,
            file_info: {
                original_name: req.file.originalname,
                size: req.file.size,
                stored_name: uploadResult.file_info.storedName
            },
            upload_platform: uploadResult.platform,
            database_platform: uploadResult.database
        });
        
    } catch (error) {
        console.error('❌ Job application error details:');
        console.error('  Error message:', error.message);
        console.error('  Error stack:', error.stack);
        console.error('  Request body:', req.body);
        console.error('  File info:', req.file ? {
            originalname: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            path: req.file.path
        } : 'No file');
        
        // Clean up uploaded file if it exists
        if (req.file && req.file.path) {
            try {
                await fs.remove(req.file.path);
                console.log('🧹 Cleaned up temp file after error');
            } catch (cleanupError) {
                console.warn('⚠️  Failed to cleanup temp file:', cleanupError.message);
            }
        }
        
        res.status(500).json({
            success: false,
            message: 'Job application submission failed',
            error: error.message,
            details: {
                step: 'Determining failure point...',
                timestamp: new Date().toISOString(),
                hasFile: !!req.file,
                hasS3Client: !!s3Client
            }
        });
    } finally {
        if (connection) connection.release();
    }
});

// Email subscription
app.post('/api/subscribe-email', async (req, res) => {
    let connection;
    
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }
        
        connection = await dbPool.getConnection();
        
        // Create table if not exists
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS email_subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                submitted_date DATE NOT NULL,
                submitted_time TIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        const now = new Date();
        await connection.execute(
            'INSERT INTO email_subscriptions (email, submitted_date, submitted_time) VALUES (?, ?, ?)',
            [email, now.toISOString().split('T')[0], now.toTimeString().split(' ')[0]]
        );
        
        // Send notification emails
        const adminHtml = `
            <h2>New Email Subscription Received</h2>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Date:</strong> ${now.toLocaleString()}</p>
        `;
        
        await sendHtmlEmail(EMAIL_RECEIVER, 'New Email Subscription Received', adminHtml);
        
        const subscriberHtml = `
            <h2>Thank You for Subscribing to Vardaan Data Sciences!</h2>
            <p>Dear Subscriber,</p>
            <p>Thank you for subscribing to Vardaan Data Sciences! We're excited to have you join our community.</p>
            <p>You will now receive updates about our latest insights, industry trends, and innovative products.</p>
            <p>Best regards,<br>The Vardaan Data Sciences Team</p>
        `;
        
        await sendHtmlEmail(email, 'Thank You for Subscribing to Vardaan Data Sciences!', subscriberHtml);
        
        res.json({
            success: true,
            message: 'Email subscribed successfully!'
        });
        
    } catch (error) {
        console.error('Email subscription error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    } finally {
        if (connection) connection.release();
    }
});

// Management Team API endpoint
app.get('/api/management-team', async (req, res) => {
    try {
        let connection = await dbPool.getConnection();
        
        // Create table if not exists
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS management_team (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                subtitle VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                image_url VARCHAR(500) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Check if table is empty, insert sample data
        const [countResult] = await connection.execute('SELECT COUNT(*) as count FROM management_team');
        
        if (countResult[0].count === 0) {
            // Insert sample management team data
            const sampleData = [
                {
                    name: 'Adarsh',
                    subtitle: 'CEO & Founder',
                    description: 'Adarsh is the visionary leader and founder of Vardaan Data Sciences. With over 15 years of experience in data science and technology, he has been instrumental in driving the company\'s strategic direction and innovative solutions.',
                    image_url: '/assets/AboutVardaan/Adarsh.jpg'
                },
                {
                    name: 'Gopa Sir',
                    subtitle: 'CTO & Technical Director',
                    description: 'Gopa Sir leads our technical initiatives and ensures the highest standards of innovation and quality in all our products and services.',
                    image_url: '/assets/AboutVardaan/GopaSir.JPG'
                },
                {
                    name: 'Ramana',
                    subtitle: 'Head of Operations',
                    description: 'Ramana oversees all operational aspects of the company, ensuring smooth delivery of our services and maintaining high client satisfaction.',
                    image_url: '/assets/AboutVardaan/ramana.png'
                },
                {
                    name: 'Srini',
                    subtitle: 'Head of Business Development',
                    description: 'Srini drives our business growth and strategic partnerships, helping expand our market presence and client base.',
                    image_url: '/assets/AboutVardaan/srini.png'
                },
                {
                    name: 'Susheel',
                    subtitle: 'Head of Technology',
                    description: 'Susheel leads our technology initiatives and ensures we stay at the forefront of technological advancements.',
                    image_url: '/assets/AboutVardaan/Susheel.png'
                },
                {
                    name: 'Vivek',
                    subtitle: 'Head of Analytics',
                    description: 'Vivek specializes in advanced analytics and data science, driving insights that help our clients make informed decisions.',
                    image_url: '/assets/AboutVardaan/vivek.png'
                }
            ];
            
            for (const member of sampleData) {
                await connection.execute(
                    'INSERT INTO management_team (name, subtitle, description, image_url) VALUES (?, ?, ?, ?)',
                    [member.name, member.subtitle, member.description, member.image_url]
                );
            }
        }
        
        const [rows] = await connection.execute('SELECT * FROM management_team ORDER BY id ASC');
        connection.release();
        
        res.json({
            success: true,
            team: rows
        });
        
    } catch (error) {
        console.error('Management team error:', error);
        res.status(500).json({
            success: false,
            message: 'Database error occurred',
            error: error.message
        });
    }
});

// Media API routes (from the original media API integration)
app.get('/api/media', async (req, res) => {
    try {
        const { category, type: fileType } = req.query;
        
        let connection = await dbPool.getConnection();
        
        let query = "SELECT * FROM media_library WHERE 1=1";
        const params = [];
        
        if (category) {
            query += " AND category = ?";
            params.push(category);
        }
        
        if (fileType) {
            query += " AND file_type = ?";
            params.push(fileType);
        }
        
        query += " ORDER BY uploaded_at DESC";
        
        const [rows] = await connection.execute(query, params);
        connection.release();
        
        res.json({
            success: true,
            data: rows,
            count: rows.length
        });
        
    } catch (error) {
        console.error('Media API error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/media/categories', async (req, res) => {
    try {
        let connection = await dbPool.getConnection();
        const [rows] = await connection.execute("SELECT DISTINCT category FROM media_library ORDER BY category");
        connection.release();
        
        const categories = rows.map(row => row.category);
        
        res.json({
            success: true,
            categories: categories
        });
        
    } catch (error) {
        console.error('Media categories error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/media/stats', async (req, res) => {
    try {
        let connection = await dbPool.getConnection();
        
        // Get stats by category and type
        const [stats] = await connection.execute(`
            SELECT 
                category,
                file_type,
                COUNT(*) as count
            FROM media_library 
            GROUP BY category, file_type
            ORDER BY category, file_type
        `);
        
        // Get total counts
        const [totalResult] = await connection.execute("SELECT COUNT(*) as total FROM media_library");
        const [imagesResult] = await connection.execute("SELECT COUNT(*) as images FROM media_library WHERE file_type = 'image'");
        const [videosResult] = await connection.execute("SELECT COUNT(*) as videos FROM media_library WHERE file_type = 'video'");
        
        connection.release();
        
        res.json({
            success: true,
            stats: {
                total: totalResult[0].total,
                images: imagesResult[0].images,
                videos: videosResult[0].videos,
                by_category: stats
            }
        });
        
    } catch (error) {
        console.error('Media stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/media/debug', async (req, res) => {
    try {
        let connection = await dbPool.getConnection();
        const [rows] = await connection.execute("SELECT * FROM media_library ORDER BY category, file_type, original_name");
        connection.release();
        
        res.json({
            success: true,
            media: rows,
            count: rows.length
        });
        
    } catch (error) {
        console.error('Media debug error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API-only routes (for backend deployment)
app.get('*', (req, res) => {
    // If it's an API route that doesn't exist, return 404
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ 
            success: false, 
            message: 'API endpoint not found' 
        });
    }
    
    // For all other routes, return API info
    res.json({
        message: 'Vardaan DS API Server',
        status: 'running',
        note: 'This is a backend API server. Frontend should be deployed separately.',
        available_endpoints: [
            '/api/contact',
            '/api/health',
            '/api/management-team',
            '/api/media',
            '/api/job-listings',
            '/api/job-application',
            '/api/nav-categories',
            '/api/nav-items',
            '/api/lapsec-pricing',
            '/api/product-pricing',
            '/api/subscribe-email',
            '/api/get-currency'
        ]
    });
});

// Error handlers
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ Backend API server ready`);
    console.log(`🌐 API endpoints available at /api/*`);
    console.log(`📊 Health check: /api/health`);
});

module.exports = app; 
