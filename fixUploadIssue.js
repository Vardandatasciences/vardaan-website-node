#!/usr/bin/env node

/**
 * Quick Fix Script for S3 Upload Issues
 * This script helps diagnose and fix common S3 upload problems
 */

const path = require('path');
const fs = require('fs-extra');

console.log('🔧 S3 Upload Quick Fix Script');
console.log('=============================\n');

async function fixUploadDirectory() {
    console.log('📁 Fixing upload directory...');
    
    try {
        const uploadsDir = path.join(__dirname, '../../uploads');
        await fs.ensureDir(uploadsDir);
        
        // Test write permissions
        const testFile = path.join(uploadsDir, 'test.tmp');
        await fs.writeFile(testFile, 'test');
        await fs.remove(testFile);
        
        console.log(`✅ Upload directory is ready: ${uploadsDir}`);
        return true;
    } catch (error) {
        console.log(`❌ Upload directory issue: ${error.message}`);
        return false;
    }
}

async function installMissingDependencies() {
    console.log('📦 Checking dependencies...');
    
    const requiredModules = ['form-data', 'axios', 'mysql2', 'fs-extra', 'mime-types', 'uuid', 'multer'];
    const missing = [];
    
    for (const module of requiredModules) {
        try {
            require(module);
            console.log(`  ✅ ${module}`);
        } catch (error) {
            console.log(`  ❌ ${module} - MISSING`);
            missing.push(module);
        }
    }
    
    if (missing.length > 0) {
        console.log(`\n❌ Missing dependencies: ${missing.join(', ')}`);
        console.log(`\n💡 Run this command to install them:`);
        console.log(`npm install ${missing.join(' ')}`);
        return false;
    }
    
    console.log('\n✅ All dependencies are installed');
    return true;
}

async function quickS3Test() {
    console.log('🧪 Quick S3 test...');
    
    try {
        // Test if we can load the S3 client
        const { createRenderMySQLClient } = require('./s3Client');
        console.log('  ✅ S3 client module loaded');
        
        // Try creating a client
        const client = createRenderMySQLClient();
        console.log('  ✅ S3 client created');
        
        // Test connection with shorter timeout
        console.log('  🔗 Testing connection...');
        const result = await Promise.race([
            client.testConnection(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
        ]);
        
        if (result.overall_success) {
            console.log('  ✅ S3 connection successful');
            return true;
        } else {
            console.log('  ⚠️  S3 connection issues:');
            if (result.render_error) console.log(`    Render: ${result.render_error}`);
            if (result.mysql_error) console.log(`    MySQL: ${result.mysql_error}`);
            return false;
        }
        
    } catch (error) {
        console.log(`  ❌ S3 test failed: ${error.message}`);
        return false;
    }
}

async function createTestServer() {
    console.log('🚀 Creating test server to isolate the issue...');
    
    const testServerCode = `
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Simple multer config
const upload = multer({ dest: 'uploads/' });

// Test endpoint
app.post('/test-upload', upload.single('resume'), async (req, res) => {
    try {
        console.log('📄 File received:', req.file);
        console.log('📝 Form data:', req.body);
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        // Test S3 client
        const { createRenderMySQLClient } = require('./s3Client');
        const s3Client = createRenderMySQLClient();
        
        console.log('🌐 Testing S3 upload...');
        const uploadResult = await s3Client.upload(
            req.file.path,
            'test-user',
            req.file.originalname,
            'test-uploads'
        );
        
        if (uploadResult.success) {
            res.json({
                success: true,
                message: 'Upload successful!',
                file_url: uploadResult.file_info.url,
                operation_id: uploadResult.operation_id
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'S3 upload failed',
                error: uploadResult.error
            });
        }
        
    } catch (error) {
        console.error('❌ Test upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});

app.get('/test-health', (req, res) => {
    res.json({ status: 'Test server running', timestamp: new Date().toISOString() });
});

const PORT = 5001;
app.listen(PORT, () => {
    console.log(\`🎯 Test server running on http://localhost:\${PORT}\`);
    console.log('Test endpoints:');
    console.log('  GET  /test-health');
    console.log('  POST /test-upload (with form-data: resume file)');
    console.log('');
    console.log('You can test with curl:');
    console.log(\`curl -F "resume=@path/to/your/file.pdf" http://localhost:\${PORT}/test-upload\`);
});
`;
    
    const testServerPath = path.join(__dirname, 'test-server.js');
    await fs.writeFile(testServerPath, testServerCode);
    
    console.log(`✅ Test server created: ${testServerPath}`);
    console.log('\n💡 To run the test server:');
    console.log('node src/backend/test-server.js');
    
    return true;
}

async function main() {
    console.log('Starting quick fix for S3 upload issues...\n');
    
    // Run fixes
    const results = {
        uploadDir: await fixUploadDirectory(),
        dependencies: await installMissingDependencies(),
        s3Test: await quickS3Test()
    };
    
    // Create test server if there are issues
    if (!results.s3Test) {
        await createTestServer();
    }
    
    console.log('\n📋 QUICK FIX SUMMARY');
    console.log('===================');
    console.log(`Upload Directory: ${results.uploadDir ? '✅ Fixed' : '❌ Issue'}`);
    console.log(`Dependencies: ${results.dependencies ? '✅ OK' : '❌ Missing'}`);
    console.log(`S3 Connection: ${results.s3Test ? '✅ Working' : '❌ Issues'}`);
    
    if (results.uploadDir && results.dependencies && results.s3Test) {
        console.log('\n🎉 All basic checks passed!');
        console.log('\nIf you\'re still having issues:');
        console.log('1. Make sure your server is running: npm run start:backend');
        console.log('2. Check that your frontend is pointing to the right URL');
        console.log('3. Verify CORS settings allow your frontend domain');
        console.log('4. Check the browser network tab for the actual error');
    } else {
        console.log('\n🚨 Issues found. Please fix the items marked with ❌');
        
        if (!results.dependencies) {
            console.log('\n💡 Install missing dependencies first');
        }
        if (!results.uploadDir) {
            console.log('\n💡 Check file permissions and disk space');
        }
        if (!results.s3Test) {
            console.log('\n💡 Try running the test server to isolate the issue');
            console.log('   node src/backend/test-server.js');
        }
    }
    
    console.log('\n🔍 For detailed debugging, run:');
    console.log('node src/backend/debugS3.js');
}

if (require.main === module) {
    main().catch(error => {
        console.error('Quick fix script failed:', error);
        process.exit(1);
    });
}

module.exports = { main }; 
