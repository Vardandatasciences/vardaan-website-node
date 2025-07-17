const axios = require('axios');

async function testServer() {
    const baseUrl = process.env.TEST_URL || 'http://localhost:5000';
    
    console.log('🧪 Testing server endpoints...');
    console.log(`📍 Testing URL: ${baseUrl}`);
    
    try {
        // Test root endpoint
        console.log('\n1. Testing root endpoint...');
        const rootResponse = await axios.get(`${baseUrl}/`);
        console.log('✅ Root endpoint working:', rootResponse.data.message);
        
        // Test health endpoint
        console.log('\n2. Testing health endpoint...');
        const healthResponse = await axios.get(`${baseUrl}/api/health`);
        console.log('✅ Health endpoint working:', healthResponse.data.status);
        console.log('📊 Database status:', healthResponse.data.database);
        console.log('📊 S3 status:', healthResponse.data.s3_service);
        
        // Test management team endpoint
        console.log('\n3. Testing management team endpoint...');
        const teamResponse = await axios.get(`${baseUrl}/api/management-team`);
        console.log('✅ Management team endpoint working');
        console.log('👥 Team members:', teamResponse.data.team.length);
        
        console.log('\n🎉 All tests passed! Server is working correctly.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        process.exit(1);
    }
}

// Run test if this file is executed directly
if (require.main === module) {
    testServer();
}

module.exports = { testServer }; 