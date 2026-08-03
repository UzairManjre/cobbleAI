import api from './client';

// Documents API
export const documentsApi = {
  upload: async (courseId: string, files: FileList) => {
    const formData = new FormData();
    formData.append('course_id', courseId);
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    
    // Import useAuthStore dynamically to avoid circular dependencies if any,
    // though the store is already accessible globally.
    const { useAuthStore } = await import('../store/authStore');
    const { API_URL } = await import('./client');
    const state = useAuthStore.getState();
    const role = state.role || 'professor';
    
    // Bypass Axios for file uploads to guarantee correct multipart/form-data boundaries.
    // Vite proxy handles relative paths if API_URL is empty.
    const baseUrl = API_URL || '';
    const url = `${baseUrl}/api/${role}/documents/upload`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.token}`
        // Do NOT set Content-Type here, let the browser set it with the correct boundary!
      },
      body: formData
    });
    
    if (!response.ok) {
      let errorDetail = 'Upload failed';
      try {
        const errorData = await response.json();
        errorDetail = errorData.detail || errorDetail;
      } catch (e) {}
      throw new Error(errorDetail);
    }
    
    return response.json();
  },
  
  list: (courseId: string) => {
    return api.get(`/documents/list/${courseId}`);
  },
  
  delete: (docId: string) => {
    return api.delete(`/documents/${docId}`);
  },
  
  processAllPending: () => {
    return api.post('/documents/process-all-pending');
  },
  
  cleanupDuplicates: () => {
    return api.post('/documents/cleanup-duplicates');
  },
};

export default documentsApi;
