import api from './client';
import type { FeedbackRating, HintLevel, TutorMessage, TutorMode, TutorPolicyInfo, TutorPolicySettings } from '../types/tutor';

export interface CourseAskBody {
  question: string;
  mode?: TutorMode;
  hint_level?: HintLevel;
  lecture_id?: string;
  video_t?: number;
}

export interface FlaggedAnswer {
  id: string;
  rating: FeedbackRating;
  comment?: string | null;
  status: 'open' | 'resolved';
  question?: string | null;
  answer?: string | null;
  decision?: string | null;
  support?: string | null;
  citations: TutorMessage['citations'];
  node_id?: string | null;
  updated_at: string;
}

// Paths under /api/tutor are role-agnostic (no /api/{role} rewrite)
export const tutorApi = {
  askUrl: (courseId: string) => `/api/tutor/courses/${courseId}/ask`,

  getCourseChat: (courseId: string, lectureId?: string) =>
    api.get<{ messages: TutorMessage[] }>(`/api/tutor/courses/${courseId}/chat`, { params: { lecture_id: lectureId } }),

  /** Ask by voice: the recording is transcribed by a local Whisper model on the server */
  transcribe: (recording: Blob, courseId?: string) => {
    const form = new FormData();
    const ext = recording.type.includes('ogg') ? 'ogg' : recording.type.includes('mp4') ? 'm4a' : 'webm';
    form.append('audio', recording, `question.${ext}`);
    if (courseId) form.append('course_id', courseId);
    return api.post<{ text: string; language: string | null; duration_sec: number; seconds: number }>(
      '/api/tutor/transcribe', form, { timeout: 60000 },
    );
  },

  getPolicy: (courseId: string, nodeId?: string) =>
    api.get<TutorPolicyInfo>(`/api/tutor/courses/${courseId}/policy`, { params: { node_id: nodeId } }),

  getPolicySettings: (courseId: string) =>
    api.get<TutorPolicySettings>(`/api/tutor/courses/${courseId}/policy/settings`),

  updatePolicySettings: (courseId: string, update: Partial<TutorPolicySettings>) =>
    api.put<TutorPolicySettings>(`/api/tutor/courses/${courseId}/policy/settings`, update),

  submitFeedback: (messageId: string, rating: FeedbackRating, comment?: string) =>
    api.post('/api/tutor/feedback', { message_id: messageId, rating, comment }),

  listFeedback: (courseId: string, status: 'open' | 'resolved' | '' = 'open') =>
    api.get<{ items: FlaggedAnswer[] }>(`/api/tutor/courses/${courseId}/feedback`, { params: { status: status || undefined } }),

  updateFeedback: (feedbackId: string, status: 'open' | 'resolved') =>
    api.patch(`/api/tutor/feedback/${feedbackId}`, { status }),
};

export default tutorApi;
