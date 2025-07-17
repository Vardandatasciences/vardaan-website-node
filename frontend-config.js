// Frontend Configuration for Vardaan DS
// Update this file in your React frontend project

// Development (local) configuration
const DEV_CONFIG = {
  API_BASE_URL: 'http://localhost:5000',
  S3_BASE_URL: 'https://aws-microservice.onrender.com'
};

// Production configuration (update with your deployed backend URL)
const PROD_CONFIG = {
  API_BASE_URL: 'https://vardaan-website-node.onrender.com', // UPDATE THIS
  S3_BASE_URL: 'https://aws-microservice.onrender.com'
};

// Use production config if not in development
const isDevelopment = process.env.NODE_ENV === 'development';
const config = isDevelopment ? DEV_CONFIG : PROD_CONFIG;

export default config;

// Usage in your React components:
// import config from './frontend-config';
// 
// // API calls
// const response = await fetch(`${config.API_BASE_URL}/api/contact`, {
//   method: 'POST',
//   headers: { 'Content-Type': 'application/json' },
//   body: JSON.stringify(formData)
// });

// Example API service functions:
export const apiService = {
  // Contact form
  submitContact: async (formData) => {
    const response = await fetch(`${config.API_BASE_URL}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    return response.json();
  },

  // Pricing inquiry
  submitPricing: async (formData) => {
    const response = await fetch(`${config.API_BASE_URL}/api/product-pricing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    return response.json();
  },

  // Job application
  submitJobApplication: async (formData) => {
    const response = await fetch(`${config.API_BASE_URL}/api/job-application`, {
      method: 'POST',
      body: formData // FormData for file upload
    });
    return response.json();
  },

  // Get management team
  getManagementTeam: async () => {
    const response = await fetch(`${config.API_BASE_URL}/api/management-team`);
    return response.json();
  },

  // Get currency
  getCurrency: async () => {
    const response = await fetch(`${config.API_BASE_URL}/api/get-currency`);
    return response.json();
  }
};

// Instructions for updating your React frontend:
/*
1. Copy this file to your React project
2. Update PROD_CONFIG.API_BASE_URL with your deployed backend URL
3. Replace your existing API calls with apiService functions
4. Example usage in components:

import { apiService } from './frontend-config';

const handleContactSubmit = async (formData) => {
  try {
    const result = await apiService.submitContact(formData);
    if (result.success) {
      // Handle success
    } else {
      // Handle error
    }
  } catch (error) {
    console.error('API Error:', error);
  }
};
*/ 