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

// Serve static files
app.use('/static', express.static(path.join(__dirname, '../../build/static')));
app.use('/assets', express.static(path.join(__dirname, '../../build/assets')));

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
    s3Client = new RenderS3Client("https://aws-microservice.onrender.com", DB_CONFIG);
    console.log("✅ S3 client initialized");
} catch (error) {
    console.error("❌ S3 client initialization failed:", error);
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
            'POST /api/lapsec-pricing': 'Submit Lapsec pricing inquiry',
            'POST /api/product-pricing': 'Submit general product pricing inquiry',
            'POST /api/subscribe-email': 'Subscribe to email newsletter',
            'GET /api/get-currency': 'Get currency based on IP'
        },
        status: 'running',
        integrated_services: [
            'Contact Management',
            'Management Team API',
            'Media Library API',
            'Job Applications',
            'Product Pricing',
            'Email Subscriptions',
            'Static File Serving'
        ]
    });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    let dbStatus = 'disconnected';
    try {
        if (dbPool) {
            await dbPool.execute('SELECT 1');
            dbStatus = 'connected';
        }
    } catch (error) {
        console.error('Database health check failed:', error);
    }

    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: dbStatus,
        media_database: dbStatus
    });
});

// Import and use pricing routes
app.get('/api/get-currency', getCurrency);
app.post('/api/lapsec-pricing', submitLapsecPricing);
app.post('/api/product-pricing', submitProductPricing);

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
        
        // Upload resume to S3
        const uploadResult = await s3Client.upload(req.file.path, email, req.file.originalname);
        
        if (!uploadResult.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to upload resume to S3',
                error: uploadResult.error
            });
        }
        
        const s3Url = uploadResult.file_info.url;
        
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
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status ENUM('pending', 'reviewed', 'shortlisted', 'rejected') DEFAULT 'pending'
            )
        `);
        
        const [result] = await connection.execute(
            'INSERT INTO job_applications (job_title, first_name, last_name, email, phone_number, resume_file_path) VALUES (?, ?, ?, ?, ?, ?)',
            [jobTitle, firstName, lastName, email, phone, s3Url]
        );
        
        const appId = result.insertId;
        
        // Clean up uploaded file
        try {
            await fs.remove(req.file.path);
        } catch (cleanupError) {
            console.warn('Failed to cleanup temp file:', cleanupError);
        }
        
        // Send notification emails
        const adminHtml = `
            <h2>New Job Application Received</h2>
            <p><strong>Application ID:</strong> ${appId}</p>
            <p><strong>Job Title:</strong> ${jobTitle || 'General Application'}</p>
            <p><strong>Applicant Name:</strong> ${firstName} ${lastName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>Resume:</strong> <a href="${s3Url}">Download Resume</a></p>
            <p><strong>Submitted Date:</strong> ${new Date().toLocaleString()}</p>
        `;
        
        await sendHtmlEmail(EMAIL_RECEIVER, `New Job Application Received - ${jobTitle || 'General Application'}`, adminHtml);
        
        const applicantHtml = `
            <h1>Thank You!</h1>
            <p>Your application has been successfully submitted</p>
            <p><strong>Application ID:</strong> ${appId}</p>
            <p><strong>Job Title:</strong> ${jobTitle || 'General Application'}</p>
            <p><strong>Submitted Date:</strong> ${new Date().toLocaleString()}</p>
            <p>Our HR team will review your application within 2-3 business days.</p>
            <p>Best regards,<br>The Vardaan Data Sciences Team</p>
        `;
        
        await sendHtmlEmail(email, 'Thank You for Your Job Application - Vardaan Data Sciences', applicantHtml);
        
        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            application_id: appId
        });
        
    } catch (error) {
        console.error('Job application error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred',
            error: error.message
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

// Serve React app for all other routes
app.get('*', (req, res) => {
    // If it's an API route that doesn't exist, return 404
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ 
            success: false, 
            message: 'API endpoint not found' 
        });
    }
    
    // For all other routes, serve the React app
    const buildPath = path.join(__dirname, '../../build');
    if (fs.existsSync(path.join(buildPath, 'index.html'))) {
        res.sendFile(path.join(buildPath, 'index.html'));
    } else {
        res.status(404).json({ 
            error: 'React app not found. Please run npm run build first.' 
        });
    }
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
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`✅ Backend integrated with frontend build process`);
    console.log(`📁 Serving static files from build directory`);
    console.log(`🌐 API endpoints available at http://localhost:${PORT}/api/*`);
});

module.exports = app; 