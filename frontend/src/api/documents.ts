import api from './client';

// Documents API
export const documentsApi = {
  upload: async (courseId: string, files: FileList, onProgress?: (fraction: number) => void) => {
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
    
    // XHR (not fetch) so large lecture recordings can report upload progress.
    // Content-Type is left to the browser so the multipart boundary is correct.
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
      };
      xhr.onload = () => {
        let data: { detail?: string } | null = null;
        try { data = JSON.parse(xhr.responseText); } catch { data = null; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error((data && typeof data.detail === 'string' && data.detail) || 'Upload failed'));
      };
      xhr.onerror = () => reject(new Error('Upload failed: network error'));
      xhr.send(formData);
    });
  },
  
  list: (courseId: string) => {
    return api.get(`/documents/list/${courseId}`);
  },
  
  delete: (docId: string) => {
    return api.delete(`/documents/${docId}`);
  },
  
  // The backend takes the course as a form field
  cleanupDuplicates: (courseId: string) => {
    const form = new FormData();
    form.append('course_id', courseId);
    return api.post('/documents/cleanup-duplicates', form);
  },
};

export default documentsApi;
