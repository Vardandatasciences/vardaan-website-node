const mysql = require('mysql2/promise');
const axios = require('axios');
const { parsePhoneNumber } = require('libphonenumber-js');
const nodemailer = require('nodemailer');

// Currency conversion rates (USD to other currencies)
const CURRENCY_RATES = {
    'INR': 83.0,  // 1 USD = 83 INR (approximate)
};

// Database configuration
const DB_CONFIG = {
    host: 'vardaanwebsites.c1womgmu83di.ap-south-1.rds.amazonaws.com',
    user: 'admin',
    password: 'vardaanwebservices',
    database: 'vardaan_ds',
    port: 3306,
    charset: 'utf8mb4'
};

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

// Create connection pool
let dbPool;
try {
    dbPool = mysql.createPool({
        ...DB_CONFIG,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log("✅ Pricing Service: MySQL connection pool initialized");
} catch (error) {
    console.error("❌ Pricing Service: MySQL connection failed:", error);
}

// Utility functions
const getClientIP = (req) => {
    let ip = null;
    if (req.headers['x-forwarded-for']) {
        ip = req.headers['x-forwarded-for'].split(',')[0];
    } else {
        ip = req.connection.remoteAddress || req.socket.remoteAddress || 
            (req.connection.socket ? req.connection.socket.remoteAddress : null);
    }
    
    console.log(`Detected IP address: ${ip}`);
    return ip;
};

const getCountryFromIP = async (ipAddress) => {
    try {
        console.log(`Fetching country for IP: ${ipAddress}`);
        const response = await axios.get(`https://ipapi.co/${ipAddress}/json/`);
        console.log('IP API response:', response.data);
        return response.data.country_code;
    } catch (error) {
        console.error('Error getting country from IP:', error);
        return null;
    }
};

const getCurrencyForCountry = (countryCode) => {
    if (countryCode === 'IN') {
        return 'INR';
    }
    return 'USD'; // Default currency
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

// Currency endpoint
const getCurrency = async (req, res) => {
    try {
        const ipAddress = getClientIP(req);
        console.log(`Processing currency for IP: ${ipAddress}`);
        
        // For localhost/development testing
        if (ipAddress === '127.0.0.1' || ipAddress === 'localhost' || ipAddress === '::1') {
            console.log("Localhost detected, using INR for testing");
            return res.json({
                success: true,
                currency: 'INR',
                rate: CURRENCY_RATES.INR
            });
        }
        
        const countryCode = await getCountryFromIP(ipAddress);
        console.log(`Detected country code: ${countryCode}`);
        const currency = getCurrencyForCountry(countryCode);
        console.log(`Selected currency: ${currency}`);
        
        return res.json({
            success: true,
            currency: currency,
            rate: CURRENCY_RATES[currency] || 1  // 1 for USD
        });
    } catch (error) {
        console.error('Error in getCurrency:', error);
        return res.json({
            success: false,
            message: 'Failed to determine currency',
            currency: 'USD',  // Default to USD
            rate: 1
        });
    }
};

// Lapsec pricing submission
const submitLapsecPricing = async (req, res) => {
    let connection;
    
    try {
        const data = req.body;

        // Required fields validation
        const requiredFields = ['name', 'business_email', 'company', 'phone', 'country', 'enquiry', 'product_code', 'product_name'];
        for (const field of requiredFields) {
            if (!data[field]) {
                return res.status(400).json({
                    success: false,
                    message: `${field.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} is required`
                });
            }
        }

        // Email validation
        if (!validateEmail(data.business_email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid business email address'
            });
        }

        // Phone validation with country
        if (!validatePhone(data.phone, data.country)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid phone number for your country'
            });
        }

        // Connect to database
        connection = await dbPool.getConnection();

        // Create table if not exists
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS product_pricing_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_code VARCHAR(50),
                product_name VARCHAR(255),
                name VARCHAR(255) NOT NULL,
                business_email VARCHAR(255) NOT NULL,
                company VARCHAR(255) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                employees VARCHAR(50),
                country VARCHAR(100) NOT NULL,
                enquiry TEXT NOT NULL,
                pricing_amount DECIMAL(10,2) DEFAULT 0,
                currency VARCHAR(10) DEFAULT 'USD',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert data into product_pricing_request table
        const [result] = await connection.execute(`
            INSERT INTO product_pricing_requests 
            (product_code, product_name, name, business_email, company, phone, employees, country, enquiry, pricing_amount, currency, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            data.product_code,
            data.product_name,
            data.name,
            data.business_email,
            data.company,
            data.phone,
            data.employees || '',  // Optional field
            data.country,
            data.enquiry,
            data.pricing_amount || 0,  // Optional field
            data.currency || 'USD',    // Optional field with default
            new Date()
        ]);

        // Send admin notification email
        const adminSubject = `New Lapsec Pricing Inquiry from ${data.name}`;
        const adminHtml = `
        <html><body>
        <h2>New Lapsec Pricing Inquiry</h2>
        <ul>
            <li><b>Name:</b> ${data.name}</li>
            <li><b>Email:</b> ${data.business_email}</li>
            <li><b>Company:</b> ${data.company}</li>
            <li><b>Phone:</b> ${data.phone}</li>
            <li><b>Country:</b> ${data.country}</li>
            <li><b>Employees:</b> ${data.employees || ''}</li>
            <li><b>Enquiry:</b> ${data.enquiry}</li>
            <li><b>Product:</b> ${data.product_name} (${data.product_code})</li>
        </ul>
        </body></html>
        `;
        
        const adminText = `
New Lapsec Pricing Inquiry

Name: ${data.name}
Email: ${data.business_email}
Company: ${data.company}
Phone: ${data.phone}
Country: ${data.country}
Employees: ${data.employees || ''}
Enquiry: ${data.enquiry}
Product: ${data.product_name} (${data.product_code})
        `;
        
        await sendHtmlEmail(EMAIL_RECEIVER, adminSubject, adminHtml, adminText);

        // Send confirmation email to customer
        const customerSubject = 'Thank You for Your Lapsec Pricing Inquiry!';
        const customerHtml = `
        <html><body>
        <h2>Thank You for Contacting Vardaan Data Sciences!</h2>
        <p>Dear ${data.name},<br>
        Thank you for your interest in our Lapsec product. We have received your inquiry and our team will contact you soon.<br>
        <b>Your Details:</b><br>
        <ul>
            <li><b>Company:</b> ${data.company}</li>
            <li><b>Phone:</b> ${data.phone}</li>
            <li><b>Country:</b> ${data.country}</li>
            <li><b>Employees:</b> ${data.employees || ''}</li>
            <li><b>Enquiry:</b> ${data.enquiry}</li>
            <li><b>Product:</b> ${data.product_name} (${data.product_code})</li>
        </ul>
        </p>
        <p>Best regards,<br>Vardaan Data Sciences Team</p>
        </body></html>
        `;
        
        const customerText = `
Dear ${data.name},

Thank you for your interest in our Lapsec product. We have received your inquiry and our team will contact you soon.

Company: ${data.company}
Phone: ${data.phone}
Country: ${data.country}
Employees: ${data.employees || ''}
Enquiry: ${data.enquiry}
Product: ${data.product_name} (${data.product_code})

Best regards,
Vardaan Data Sciences Team
        `;
        
        await sendHtmlEmail(data.business_email, customerSubject, customerHtml, customerText);

        return res.status(201).json({
            success: true,
            message: 'Pricing inquiry submitted successfully. Our team will contact you soon!'
        });

    } catch (error) {
        console.error('Lapsec pricing error:', error);
        if (error.code && error.code.startsWith('ER_')) {
            return res.status(500).json({
                success: false,
                message: `Database error: ${error.message}`
            });
        }
        return res.status(500).json({
            success: false,
            message: `Server error: ${error.message}`
        });
    } finally {
        if (connection) connection.release();
    }
};

// Product pricing submission (generalized)
const submitProductPricing = async (req, res) => {
    let connection;
    
    try {
        console.log(`Received product pricing request: ${req.method} ${req.url}`);
        console.log('Request headers:', req.headers);
        
        const data = req.body;
        console.log('Request data:', data);
        
        if (!data) {
            return res.status(400).json({
                success: false,
                message: 'No JSON data provided'
            });
        }

        // Required fields validation
        const requiredFields = ['name', 'business_email', 'company', 'phone', 'country', 'enquiry', 'product_code', 'product_name'];
        for (const field of requiredFields) {
            if (!data[field]) {
                return res.status(400).json({
                    success: false,
                    message: `${field.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} is required`
                });
            }
        }

        // Email validation
        if (!validateEmail(data.business_email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid business email address'
            });
        }

        // Phone validation with country
        if (!validatePhone(data.phone, data.country)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid phone number for your country'
            });
        }

        // Connect to database
        connection = await dbPool.getConnection();

        // Create table if not exists
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS product_pricing_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_code VARCHAR(50),
                product_name VARCHAR(255),
                name VARCHAR(255) NOT NULL,
                business_email VARCHAR(255) NOT NULL,
                company VARCHAR(255) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                employees VARCHAR(50),
                country VARCHAR(100) NOT NULL,
                enquiry TEXT NOT NULL,
                pricing_amount DECIMAL(10,2) DEFAULT 0,
                currency VARCHAR(10) DEFAULT 'USD',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert data into product_pricing_request table
        const [result] = await connection.execute(`
            INSERT INTO product_pricing_requests 
            (product_code, product_name, name, business_email, company, phone, employees, country, enquiry, pricing_amount, currency, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            data.product_code,
            data.product_name,
            data.name,
            data.business_email,
            data.company,
            data.phone,
            data.employees || '',  // Optional field
            data.country,
            data.enquiry,
            data.pricing_amount || 0,  // Optional field
            data.currency || 'USD',    // Optional field with default
            new Date()
        ]);
        
        // Get the inserted record ID
        const recordId = result.insertId;
        console.log(`Successfully inserted record with ID: ${recordId}`);

        // Send admin notification email
        const adminSubject = `New Product Pricing Inquiry from ${data.name}`;
        const adminHtml = `
        <html><body>
        <h2>New Product Pricing Inquiry</h2>
        <ul>
            <li><b>Name:</b> ${data.name}</li>
            <li><b>Email:</b> ${data.business_email}</li>
            <li><b>Company:</b> ${data.company}</li>
            <li><b>Phone:</b> ${data.phone}</li>
            <li><b>Country:</b> ${data.country}</li>
            <li><b>Employees:</b> ${data.employees || ''}</li>
            <li><b>Enquiry:</b> ${data.enquiry}</li>
            <li><b>Product:</b> ${data.product_name} (${data.product_code})</li>
        </ul>
        </body></html>
        `;
        
        const adminText = `
New Product Pricing Inquiry

Name: ${data.name}
Email: ${data.business_email}
Company: ${data.company}
Phone: ${data.phone}
Country: ${data.country}
Employees: ${data.employees || ''}
Enquiry: ${data.enquiry}
Product: ${data.product_name} (${data.product_code})
        `;
        
        await sendHtmlEmail(EMAIL_RECEIVER, adminSubject, adminHtml, adminText);

        // Send confirmation email to customer
        const customerSubject = `Thank You for Your ${data.product_name} Pricing Inquiry!`;
        const customerHtml = `
        <html><body>
        <h2>Thank You for Contacting Vardaan Data Sciences!</h2>
        <p>Dear ${data.name},<br>
        Thank you for your interest in our ${data.product_name} product. We have received your inquiry and our team will contact you soon.<br>
        <b>Your Details:</b><br>
        <ul>
            <li><b>Company:</b> ${data.company}</li>
            <li><b>Phone:</b> ${data.phone}</li>
            <li><b>Country:</b> ${data.country}</li>
            <li><b>Employees:</b> ${data.employees || ''}</li>
            <li><b>Enquiry:</b> ${data.enquiry}</li>
            <li><b>Product:</b> ${data.product_name} (${data.product_code})</li>
        </ul>
        </p>
        <p>Best regards,<br>Vardaan Data Sciences Team</p>
        </body></html>
        `;
        
        const customerText = `
Dear ${data.name},

Thank you for your interest in our ${data.product_name} product. We have received your inquiry and our team will contact you soon.

Company: ${data.company}
Phone: ${data.phone}
Country: ${data.country}
Employees: ${data.employees || ''}
Enquiry: ${data.enquiry}
Product: ${data.product_name} (${data.product_code})

Best regards,
Vardaan Data Sciences Team
        `;
        
        await sendHtmlEmail(data.business_email, customerSubject, customerHtml, customerText);

        return res.status(201).json({
            success: true,
            message: `${data.product_name} pricing inquiry submitted successfully. Our team will contact you soon!`,
            record_id: recordId
        });

    } catch (error) {
        console.error('Product pricing error:', error);
        if (error.code && error.code.startsWith('ER_')) {
            return res.status(500).json({
                success: false,
                message: `Database error: ${error.message}`
            });
        }
        return res.status(500).json({
            success: false,
            message: `Server error: ${error.message}`
        });
    } finally {
        if (connection) connection.release();
    }
};

module.exports = {
    getCurrency,
    submitLapsecPricing,
    submitProductPricing,
    validateEmail,
    validatePhone,
    sendHtmlEmail
}; 