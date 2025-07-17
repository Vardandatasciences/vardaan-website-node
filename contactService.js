// Contact form service for Firebase Firestore
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { validateContactForm, cleanFormData } from './validation';

// Collection name for contact form submissions
const CONTACTS_COLLECTION = 'contacts';

/**
 * Submit contact form data to Firestore
 * @param {Object} formData - The contact form data
 * @param {string} formData.name - User's name
 * @param {string} formData.email - User's email
 * @param {string} formData.subject - Subject/message content
 * @param {string} formData.additionalSubject - Additional subject
 * @param {string} formData.phoneNumber - User's phone number
 * @param {string} formData.phone - Alternative phone field
 * @param {string} formData.message - User's message
 * @returns {Promise<string>} - Document ID of the created record
 */
export const submitContactForm = async (formData) => {
  try {
    // Validate form data
    const validation = validateContactForm(formData);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Clean and prepare data for Firestore
    const cleanedData = cleanFormData(formData);
    const contactData = {
      ...cleanedData,
      // Add server timestamp
      createdAt: serverTimestamp(),
      // Add status for tracking
      status: 'new',
      // Add source information
      source: 'website_contact_form',
      // Add IP address if available (for analytics)
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'
    };

    // Add document to Firestore
    const docRef = await addDoc(collection(db, CONTACTS_COLLECTION), contactData);
    
    console.log('Contact form submitted successfully with ID:', docRef.id);
    return docRef.id;
    
  } catch (error) {
    console.error('Error submitting contact form:', error);
    throw new Error(`Failed to submit contact form: ${error.message}`);
  }
};

/**
 * Submit service inquiry form data to Firestore
 * @param {Object} formData - The service inquiry form data
 * @returns {Promise<string>} - Document ID of the created record
 */
export const submitServiceInquiry = async (formData) => {
  try {
    // Validate required fields
    if (!formData.name || !formData.email) {
      throw new Error('Name and email are required fields');
    }

    // Prepare data for Firestore
    const inquiryData = {
      ...formData,
      createdAt: serverTimestamp(),
      status: 'new',
      source: 'website_service_inquiry'
    };

    // Add document to service_inquiries collection
    const docRef = await addDoc(collection(db, 'service_inquiries'), inquiryData);
    
    console.log('Service inquiry submitted successfully with ID:', docRef.id);
    return docRef.id;
    
  } catch (error) {
    console.error('Error submitting service inquiry:', error);
    throw new Error(`Failed to submit service inquiry: ${error.message}`);
  }
};

/**
 * Submit training inquiry form data to Firestore
 * @param {Object} formData - The training inquiry form data
 * @returns {Promise<string>} - Document ID of the created record
 */
export const submitTrainingInquiry = async (formData) => {
  try {
    // Validate required fields
    if (!formData.name || !formData.email) {
      throw new Error('Name and email are required fields');
    }

    // Prepare data for Firestore
    const inquiryData = {
      ...formData,
      createdAt: serverTimestamp(),
      status: 'new',
      source: 'website_training_inquiry'
    };

    // Add document to training_inquiries collection
    const docRef = await addDoc(collection(db, 'training_inquiries'), inquiryData);
    
    console.log('Training inquiry submitted successfully with ID:', docRef.id);
    return docRef.id;
    
  } catch (error) {
    console.error('Error submitting training inquiry:', error);
    throw new Error(`Failed to submit training inquiry: ${error.message}`);
  }
}; 