import axios from 'axios';

// API configuration constants
const API_BASE_URL = '/api';
const DEFAULT_ACTIVITY_DAYS = 7;

// Create axios instance with base configuration
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 30000 // 30 second timeout
});

// Request interceptor for debugging and auth (if needed later)
api.interceptors.request.use(
    (config) => {
        console.log(`API Request: ${config.method.toUpperCase()} ${config.url}`);
        return config;
    },
    (error) => {
        console.error('Request error:', error);
        return Promise.reject(error);
    }
);

// Response interceptor for centralized error handling
api.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        if (error.response) {
            // Server responded with error status
            console.error('API Error:', error.response.status, error.response.data);
        } else if (error.request) {
            // Request made but no response received
            console.error('Network Error: No response from server');
        } else {
            // Error in request setup
            console.error('Request Error:', error.message);
        }
        return Promise.reject(error);
    }
);

// Admin panel API endpoints
export const adminAPI = {
    // Fetch moderation results with optional filters
    getResults: (params = {}) => 
        api.get('/admin/results', { params }),
    
    // Fetch single result by ID
    getResult: (id) => 
        api.get(`/admin/results/${id}`),
    
    // Submit human review for a result
    reviewResult: (id, data) => 
        api.post(`/admin/review/${id}`, data),
    
    // Review multiple results at once
    bulkReview: (data) => 
        api.post('/admin/review/bulk', data),
    
    // Get statistics overview with optional date range
    getStats: (params = {}) => 
        api.get('/admin/stats/overview', { params }),
    
    // Get activity data for the past N days
    getActivity: (days = DEFAULT_ACTIVITY_DAYS) => 
        api.get('/admin/stats/activity', { params: { days } })
};

export default api;
