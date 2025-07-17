# Vardaan Data Sciences Backend API

This is the backend API for Vardaan Data Sciences website, providing contact forms, pricing inquiries, file uploads, and other services.

## Features

- Contact form submissions
- Product pricing inquiries
- Job applications with resume upload
- Email subscriptions
- Management team data
- Media library management
- File upload/download via S3
- Email notifications

## Deployment Instructions

### Backend Deployment (Required First)

Your Node.js backend needs to be deployed to a platform that supports Node.js. **Netlify is for frontend only.**

#### Option 1: Render (Recommended - Free)

1. **Create Render Account**
   - Go to [render.com](https://render.com)
   - Sign up for free account

2. **Deploy Backend**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: `vardaan-ds-backend`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Plan**: Free

3. **Set Environment Variables**
   - Go to your service → Environment
   - Add all variables from `env.example`
   - Update `FRONTEND_URL` to your Netlify domain

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment (5-10 minutes)

#### Option 2: Railway (Alternative - Free)

1. Go to [railway.app](https://railway.app)
2. Connect GitHub repository
3. Deploy automatically
4. Set environment variables

### Frontend Deployment (Netlify)

After your backend is deployed:

1. **Update Frontend API URL**
   - In your React app, update API base URL to your deployed backend
   - Example: `https://your-backend-name.onrender.com`

2. **Deploy to Netlify**
   - Push your React code to GitHub
   - Go to [netlify.com](https://netlify.com)
   - Click "New site from Git"
   - Connect your React repository
   - Build settings:
     - **Build command**: `npm run build`
     - **Publish directory**: `build`

3. **Update CORS in Backend**
   - Add your Netlify domain to CORS allowed origins
   - Update `FRONTEND_URL` environment variable

## Environment Variables

Copy `env.example` to `.env` and configure:

```bash
# Required for deployment
PORT=5000
FRONTEND_URL=https://your-netlify-domain.netlify.app

# Database (already configured)
DB_HOST=vardaanwebsites.c1womgmu83di.ap-south-1.rds.amazonaws.com
DB_USER=admin
DB_PASSWORD=vardaanwebservices
DB_NAME=vardaan_ds

# Email (already configured)
EMAIL_HOST_USER=rupinirudroju@gmail.com
EMAIL_HOST_PASSWORD=wzcu fnyh dssu laeb
EMAIL_RECEIVER=vinnurudroju28@gmail.com
```

## API Endpoints

- `POST /api/contact` - Contact form submission
- `POST /api/lapsec-pricing` - Lapsec pricing inquiry
- `POST /api/product-pricing` - Product pricing inquiry
- `POST /api/job-application` - Job application with resume
- `POST /api/subscribe-email` - Email subscription
- `GET /api/management-team` - Management team data
- `GET /api/media` - Media library
- `GET /api/get-currency` - Currency detection

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

## File Structure

```
Node/
├── server.js          # Main Express server
├── contactService.js  # Contact form handling
├── pricingService.js  # Pricing inquiries
├── s3Client.js       # File upload/download
├── index.js          # Service exports
├── package.json      # Dependencies
└── env.example      # Environment variables template
```

## Important Notes

1. **Backend must be deployed first** before frontend
2. **Update CORS settings** in backend after frontend deployment
3. **Environment variables** must be set in deployment platform
4. **Database connection** is already configured for AWS RDS
5. **Email service** is already configured for Gmail SMTP

## Troubleshooting

### Common Issues:

1. **CORS Errors**: Update `FRONTEND_URL` in backend environment variables
2. **Database Connection**: Check if RDS instance is accessible
3. **Email Not Sending**: Verify Gmail app password is correct
4. **File Uploads**: Ensure S3/Render service is running

### Support

For deployment issues, check:
- Render/Railway logs for backend errors
- Netlify build logs for frontend errors
- Browser console for API connection issues 