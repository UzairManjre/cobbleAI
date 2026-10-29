import api from './client';

export interface LectureSummary {
  id: string;
  filename: string;
  status: string;
  stage?: string | null;
  progress?: number | null;
  duration_sec?: number | null;
  has_video?: boolean | null;
  created_at: string;
}

export interface TranscriptLine {
  id: number;
  start: number;
  end: number;
  text: string;
  low_confidence: boolean;
}

export interface LectureChapter {
  index: number;
  chapter_id: string;
  start: number;
  end: number;
  title: string;
  summary: string;
  notes: { t: number; text: string }[];
  generated_by: 'llm' | 'fallback';
}

export interface LectureFrame {
  id: string;
  t: number;
  image_url: string;
  ocr_text: string;
  caption: string;
}

export interface ExcludedRange {
  start: number;
  end: number;
  reason?: string | null;
}

export interface LectureDetail {
  id: string;
  course_id: string;
  filename: string;
  status: string;
  stage?: string | null;
  progress?: number | null;
  error_message?: string | null;
  duration_sec?: number | null;
  has_video?: boolean | null;
  media_url?: string | null;
  transcript: { language?: string | null; model?: string | null; real_time_factor?: number | null; segments: TranscriptLine[] };
  chapters: LectureChapter[];
  frames: LectureFrame[];
  excluded_ranges: ExcludedRange[];
  excluded_count: number;
}

// Paths under /api/lectures and /api/files are role-agnostic
export const lecturesApi = {
  listByCourse: (courseId: string) => api.get<LectureSummary[]>(`/api/lectures/course/${courseId}`),
  get: (lectureId: string) => api.get<LectureDetail>(`/api/lectures/${lectureId}`),
  captions: (lectureId: string) => api.get<string>(`/api/lectures/${lectureId}/captions.vtt`, { responseType: 'text' }),
  transcript: (lectureId: string) => api.get<Blob>(`/api/lectures/${lectureId}/transcript.txt`, { responseType: 'blob' }),
  updateExclusions: (lectureId: string, ranges: ExcludedRange[]) =>
    api.put<{ excluded_ranges: ExcludedRange[]; chunk_count: number | null }>(`/api/lectures/${lectureId}/exclusions`, { ranges }),
  fileUrl: (docId: string) =>
    api.get<{ url: string; file_type: string; media_type: string; filename: string }>(`/api/files/${docId}/url`),
};

export default lecturesApi;
