import api from './client';

export interface ConsentStatus {
  research_consent: boolean | null;
  research_consent_at: string | null;
  research_consent_version: string | null;
  current_version: string;
  needs_decision: boolean;
  text: string;
}

export const consentApi = {
  get: () => api.get<ConsentStatus>('/api/consent'),
  set: (consent: boolean) => api.put<ConsentStatus>('/api/consent', { consent }),
};

export default consentApi;
