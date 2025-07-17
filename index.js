// Main backend services export file
// This file exports all the backend services for easy importing

// Firebase configuration
export { db, analytics } from './firebase';

// Contact form services
export { 
  submitContactForm, 
  submitServiceInquiry, 
  submitTrainingInquiry 
} from './contactService';

// You can add more services here as needed
// export { someOtherService } from './otherService'; 