import { useEffect, useState } from 'react';
import { Square, Volume2 } from 'lucide-react';

/** Read an answer aloud with an on-device voice only, so the text never leaves the browser. */
function localVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter(v => v.localService);
  return voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
}

export default function ReadAloud({ text }: { text: string }) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(() => localVoice());
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => setVoice(localVoice());
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', update);
      window.speechSynthesis.cancel();
    };
  }, []);

  if (!voice || !text.trim()) return null;

  const toggle = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    // Drop citation labels and markdown symbols so they aren't read out
    const utterance = new SpeechSynthesisUtterance(text.replace(/\[S\d+(?:\s*,\s*S\d+)*\]/g, '').replace(/[*_`#>]/g, ''));
    utterance.voice = voice;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={speaking ? 'Stop reading' : 'Read aloud (on-device voice)'}
      aria-pressed={speaking}
      className={`px-2 py-1 rounded-lg text-[11px] flex items-center gap-1 border transition-colors ${
        speaking ? 'text-blue-300 border-blue-500/40 bg-blue-500/10' : 'text-[#888888] border-transparent hover:text-white hover:border-[#333333]'
      }`}
    >
      {speaking ? <Square className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
      <span>{speaking ? 'Stop' : 'Listen'}</span>
    </button>
  );
}
