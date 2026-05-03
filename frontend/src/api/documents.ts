import api from './client';

// Documents API
export const documentsApi = {
  upload: (courseId: string, files: FileList) => {
    const formData = new FormData();
    formData.append('course_id', courseId);
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    return api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  list: (courseId: string) => {
    return api.get('/documents/', { params: { course_id: courseId } });
  },
  
  processAllPending: () => {
    return api.post('/documents/process-all-pending');
  },
  
  cleanupDuplicates: () => {
    return api.post('/documents/cleanup-duplicates');
  },
};

export default documentsApi;
