import axios from 'axios';

// In production (Render), use full backend URL; locally, use relative path with proxy
const API_BASE_URL = process.env.REACT_APP_API_URL
    ? `${process.env.REACT_APP_API_URL}/api`
    : '/api';
const DEFAULT_ACTIVITY_DAYS = 7;

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 30000
});

// Request interceptor - add auth token to all requests
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
    },
    (error) => {
        console.error('Request error:', error);
        return Promise.reject(error);
    }
);

// Response interceptor for error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response) {
            console.error('Server error:', error.response.status, error.response.data);

            // If 401, token might be expired - clear auth
            if (error.response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                // Optionally reload to show login
                // window.location.reload();
            }
        } else if (error.request) {
            console.error('Network error: No response received');
        } else {
            console.error('Request error:', error.message);
        }
        return Promise.reject(error);
    }
);

export const adminAPI = {
    getResults: (params = {}) =>
        api.get('/admin/results', { params }),

    getResult: (id) =>
        api.get(`/admin/results/${id}`),

    reviewResult: (id, data) =>
        api.post(`/admin/review/${id}`, data),

    bulkReview: (data) =>
        api.post('/admin/review/bulk', data),

    getStats: (params = {}) =>
        api.get('/admin/stats/overview', { params }),

    getActivity: (days = DEFAULT_ACTIVITY_DAYS) =>
        api.get('/admin/stats/activity', { params: { days } })
};

export default api;
