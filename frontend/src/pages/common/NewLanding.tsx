import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowUp } from 'lucide-react';
import { Logo } from '../../components/ui/Logo';

/* The mark's geometry, shared by the hero figure (see components/ui/Logo.tsx) */
const MARK = (
  <>
    <circle cx="4.75" cy="3.85" r="3.85" />
    <rect x="0.5" y="8.1" width="5.2" height="13.9" rx="0.6" />
    <rect x="0.5" y="8.1" width="11" height="5.5" rx="0.6" />
    <circle cx="18.6" cy="9.75" r="3.85" />
    <rect x="12.1" y="14.1" width="10.9" height="5.5" rx="0.6" />
    <rect x="17.8" y="14.1" width="5.2" height="11.2" rx="0.6" />
  </>
);

const rise = (delay: number) => ({ animation: `rise 900ms var(--ease-out-expo) ${delay}ms both` });

/** Plus-shaped registration mark in SVG units */
const Cross = ({ x, y }: { x: number; y: number }) => (
  <g stroke="currentColor" strokeWidth="1" opacity="0.7">
    <line x1={x - 7} y1={y} x2={x + 7} y2={y} />
    <line x1={x} y1={y - 7} x2={x} y2={y + 7} />
  </g>
);

/** A leader line that draws itself, ending in a small ring at the thing it labels */
const Leader = ({ d, len, delay, ring }: { d: string; len: number; delay: number; ring: [number, number] }) => (
  <g>
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.2"
      style={{ strokeDasharray: len, ['--len' as string]: len, animation: `draw 1100ms var(--ease-out-expo) ${delay}ms both` }} />
    <circle cx={ring[0]} cy={ring[1]} r="5" fill="#073dea" stroke="currentColor" strokeWidth="1.2" style={rise(delay)} />
  </g>
);

function HeroFigure() {
  // Phones crop the wide figure to its centre instead of shrinking the whole thing
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  // Mark scaled x21 and centred; the citation's top crosses both figures' legs, never the reaching arm
  const s = 21, ox = 390, oy = 50;
  const p = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];
  const tutorHead = p(4.75, 3.85), youHead = p(18.6, 9.75), hands = p(11.8, 13.85);
  return (
    <svg viewBox="0 0 1200 800" preserveAspectRatio={narrow ? 'xMidYMid slice' : 'xMidYMid meet'} className="w-full h-full text-white overflow-visible" role="img"
      aria-label="Figure: the Cobble mark, two people, one helping the other up a step, crossed by a large 24 × 7 availability figure">
      <defs>
        <mask id="mark-mask"><g transform={`translate(${ox} ${oy}) scale(${s})`} fill="#fff">{MARK}</g></mask>
      </defs>

      <text x="340" y="56" className="font-display" fontSize="13" letterSpacing="1.2" fill="currentColor" style={rise(200)}>■ FIG. 01 · COBBLE</text>
      <Cross x={340} y={76} /><Cross x={860} y={76} /><Cross x={340} y={712} /><Cross x={860} y={712} />

      {/* Animate the outer group: a CSS transform on the inner one would replace its SVG scale */}
      <g style={rise(100)}><g transform={`translate(${ox} ${oy}) scale(${s})`} fill="currentColor">{MARK}</g></g>

      {/* Giant citation: white on blue, blue where it crosses the white figure */}
      <g className="font-display" fontSize="165" fontWeight="500" letterSpacing="-5" textAnchor="middle" style={rise(350)}>
        <text x="1020" y="666" fill="currentColor">24 × 7</text>
        <text x="1020" y="666" fill="#073dea" mask="url(#mark-mask)">24 × 7</text>
      </g>
      <text x="1250" y="545" className="font-display" fontSize="56" fontWeight="500" fill="currentColor" style={rise(450)}>¹</text>

      <Leader d={`M ${tutorHead[0] - 46} ${tutorHead[1] + 12} L 330 300 L 300 300`} len={260} delay={700} ring={[tutorHead[0] - 46, tutorHead[1] + 12]} />
      <text x="294" y="305" textAnchor="end" className="font-display" fontSize="14" letterSpacing="1.4" fill="currentColor" style={rise(900)}>( TUTOR )</text>

      <Leader d={`M ${youHead[0] + 40} ${youHead[1] - 8} L 860 180 L 900 180`} len={200} delay={850} ring={[youHead[0] + 40, youHead[1] - 8]} />
      <text x="908" y="185" className="font-display" fontSize="14" letterSpacing="1.4" fill="currentColor" style={rise(1050)}>( YOU )</text>

      <Leader d={`M ${hands[0]} ${hands[1] + 6} L 640 340 L 900 340`} len={340} delay={1000} ring={[hands[0], hands[1] + 6]} />
      <text x="908" y="345" className="font-display" fontSize="14" letterSpacing="1.4" fill="currentColor" style={rise(1200)}>( HELP )</text>
    </svg>
  );
}

/** A synthetic example of a cited answer, drawn the way the app shows it */
function AnswerFigure() {
  return (
    <figure className="relative">
      <span className="crosshair -left-3 -top-3 text-accent" />
      <span className="crosshair -right-3 -top-3 text-accent" />
      <span className="crosshair -left-3 -bottom-3 text-accent" />
      <span className="crosshair -right-3 -bottom-3 text-accent" />
      <figcaption className="annot text-accent flex justify-between gap-4 mb-5">
        <span>■ FIG. 02 · AN ANSWER</span>
        <span>Example, not real course data</span>
      </figcaption>
      <div className="bg-surface border border-accent-100 rounded-2xl p-6 md:p-8 space-y-7">
        <p className="ml-auto w-fit max-w-[85%] bg-accent text-white rounded-2xl rounded-br-md px-4 py-3 text-[15px]">
          Why does a deeper network overfit faster?
        </p>
        <div className="max-w-[92%] space-y-4">
          <p className="text-[15px] leading-relaxed text-ink-2">
            More layers add parameters, so the model can fit noise in a small training set. Your notes show this as the
            gap between training and validation loss widening after epoch 6, and suggest dropout or early stopping.
          </p>
          <div className="flex flex-wrap gap-2">
            {['Lecture 7 · 18:42', 'regularisation.pdf · p. 14', 'Slide 22'].map(c => (
              <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-accent-100 bg-accent-wash px-3 py-1 text-xs text-accent font-display">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />{c}
              </span>
            ))}
          </div>
        </div>
        <div className="border-t border-line pt-6 space-y-3">
          <p className="ml-auto w-fit max-w-[85%] bg-accent text-white rounded-2xl rounded-br-md px-4 py-3 text-[15px]">
            What will be on the final exam?
          </p>
          <p className="text-[15px] text-ink-3">
            Your course materials don't cover that, so I won't guess. Ask your professor.
          </p>
        </div>
      </div>
    </figure>
  );
}

const STUDENT = [
  ['Learn', 'Work through the concept map, one idea at a time, with a tutor that teaches, quizzes and reviews.'],
  ['Ask', 'Questions answered from your course only, with the page, slide or lecture second it came from.'],
  ['Plan', 'A study plan for the whole course or one topic, built from what you have and have not mastered.'],
  ['Test', 'Your professor’s tests, with a confidence check-in that shows how sure you were versus how right.'],
];
const PROFESSOR = [
  ['Upload', 'Slides, notes and lecture recordings. Recordings are transcribed, captioned and split into chapters.'],
  ['Set limits', 'Choose how much help the tutor gives, and switch to assessment mode during tests.'],
  ['Grade', 'AI-drafted grades with evidence and a confidence score. You approve or override each one.'],
  ['See gaps', 'Clusters of student questions, coverage gaps and the lecture moments that confuse people most.'],
];

export default function NewLanding() {
  return (
    <div className="bg-canvas text-ink overflow-x-hidden">
      {/* ── 1. Drenched first viewport ─────────────────────────────── */}
      <section className="relative min-h-[100dvh] bg-accent text-white selection:bg-white selection:text-accent">
        {/* Running head, three zones */}
        <header className="absolute inset-x-0 top-0 z-20 grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_1fr] items-center gap-6 px-5 md:px-8 h-16 font-display text-[15px] tracking-[-0.02em]">
          <Link to="/" className="justify-self-start" aria-label="Cobble home"><Logo markClassName="h-[22px] w-auto" /></Link>
          <p className="hidden md:block text-white/85">An AI tutor that only answers from your course</p>
          <nav className="justify-self-end flex items-center gap-5">
            <a href="#how" className="hidden sm:inline text-white/85 hover:text-white">How it works</a>
            <Link to="/signin" className="inline-flex items-center gap-1 hover:underline">Sign in <ArrowUpRight size={15} /></Link>
          </nav>
        </header>

        <div className="relative mx-auto max-w-[1440px] min-h-[100dvh] px-5 md:px-8 pt-20 pb-10 grid grid-rows-[auto_1fr_auto] md:block">
          {/* Headline, top left */}
          <div className="md:absolute md:left-8 md:top-28 max-w-[22rem] z-10" style={rise(150)}>
            <h1 className="font-display font-medium text-[clamp(2.4rem,4.2vw,3.6rem)] leading-[0.98] tracking-[-0.04em]">
              answers from your course. nothing else.
            </h1>
          </div>

          {/* Figure fills the field */}
          <div className="relative md:absolute md:inset-0 md:px-[12%] md:pt-14 md:pb-24 -mx-5 md:mx-0 my-4 md:my-0 aspect-square md:aspect-auto">
            <HeroFigure />
          </div>

          {/* Offer and actions, bottom left */}
          <div className="md:absolute md:left-8 md:bottom-12 max-w-[24rem] z-10 space-y-6" style={rise(500)}>
            <p className="text-[17px] leading-snug tracking-[-0.01em]">
              Upload slides, notes and lecture recordings. Cobble tutors your students from them, shows where every
              answer came from, and says so when the material doesn't cover a question.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/signin?mode=signup&role=student" className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 font-display font-medium text-accent hover:bg-accent-50 transition-colors">
                Join a class
              </Link>
              <Link to="/signin?mode=signup&role=professor" className="inline-flex h-12 items-center gap-2 rounded-full border border-white/60 px-6 font-display font-medium text-white hover:bg-white/10 transition-colors">
                Create a class
              </Link>
            </div>
          </div>

          {/* Footnote, bottom right */}
          <p className="md:absolute md:right-8 md:bottom-12 max-w-[20rem] md:text-right annot text-white/75 leading-relaxed mt-8 md:mt-0" style={rise(1300)}>
            ¹ Every answer points to the page, slide or lecture moment it came from. Runs on campus hardware.
          </p>
        </div>
      </section>

      {/* ── 2. The mechanism, on white ─────────────────────────────── */}
      <section id="how" className="scroll-mt-4 px-5 md:px-8 py-24 md:py-36">
        <div className="mx-auto max-w-[1440px] grid md:grid-cols-12 gap-12 md:gap-8 items-start">
          <div className="md:col-span-5 md:sticky md:top-16">
            <h2 className="font-display font-medium text-accent text-[clamp(2.2rem,4.6vw,4.4rem)] leading-[0.95] tracking-[-0.04em]">
              it cites, or it says it doesn't know.
            </h2>
            <p className="mt-8 max-w-md text-lg text-ink-2 leading-relaxed">
              The tutor reads only what your professor uploaded. A citation opens the PDF at the page or the lecture
              at the second. When the materials don't cover a question, the tutor declines instead of guessing.
            </p>
            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 max-w-md border-t border-line pt-6">
              {[['Documents', 'PDF, DOCX, PPTX'], ['Recordings', 'MP4, WebM, MOV, MP3, M4A, WAV'], ['Help levels', 'Nudge, question, step, answer'], ['During tests', 'Full answers can be switched off']].map(([k, v]) => (
                <div key={k}>
                  <dt className="annot text-ink-3">{k}</dt>
                  <dd className="mt-1.5 text-[15px] text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="md:col-start-7 md:col-span-6">
            <AnswerFigure />
          </div>
        </div>
      </section>

      {/* ── 3. Two readers, two lists ──────────────────────────────── */}
      <section className="bg-accent text-white px-5 md:px-8 py-24 md:py-32 selection:bg-white selection:text-accent">
        <div className="mx-auto max-w-[1440px] grid md:grid-cols-2 gap-16 md:gap-10">
          {([['for students', STUDENT, '/signin?mode=signup&role=student', 'Join a class'], ['for professors', PROFESSOR, '/signin?mode=signup&role=professor', 'Create a class']] as const).map(([title, items, href, cta]) => (
            <div key={title}>
              <h2 className="font-display font-medium text-[clamp(2rem,3.6vw,3.25rem)] tracking-[-0.04em] leading-none">{title}</h2>
              <ol className="mt-10 border-t border-white/25">
                {items.map(([k, v]) => (
                  <li key={k} className="grid sm:grid-cols-[9rem_1fr] gap-x-6 gap-y-1 py-5 border-b border-white/25">
                    <span className="font-display text-lg tracking-[-0.02em]">{k}</span>
                    <span className="text-white/85 leading-relaxed">{v}</span>
                  </li>
                ))}
              </ol>
              <Link to={href} className="mt-8 inline-flex items-center gap-1.5 font-display hover:underline">{cta} <ArrowUpRight size={16} /></Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. Where it runs ───────────────────────────────────────── */}
      <section className="px-5 md:px-8 py-24 md:py-36">
        <div className="mx-auto max-w-[1440px]">
          <h2 className="font-display font-medium text-[clamp(2.6rem,7vw,6rem)] leading-[0.92] tracking-[-0.04em] max-w-5xl">
            runs on your campus. <span className="text-accent">your course never leaves it.</span>
          </h2>
          <div className="mt-16 grid sm:grid-cols-3 border-t border-ink">
            {[['Language model', 'Answers, plans and grades are written by a model on the course server.'], ['Speech to text', 'Lectures and voice questions are transcribed locally. No cloud speech service.'], ['Research', 'Opt-in and revocable. Exports use pseudonyms and cover consenting students only.']].map(([k, v]) => (
              <div key={k} className="pt-6 pb-2 sm:pr-8 border-b sm:border-b-0 border-line">
                <p className="font-display text-xl tracking-[-0.02em]">{k}</p>
                <p className="mt-3 text-ink-3 leading-relaxed max-w-xs">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. Close ───────────────────────────────────────────────── */}
      <section className="bg-accent text-white px-5 md:px-8 pt-24 md:pt-32 pb-10 selection:bg-white selection:text-accent">
        <div className="mx-auto max-w-[1440px]">
          <h2 className="font-display font-medium text-[clamp(3rem,10vw,9rem)] leading-[0.88] tracking-[-0.04em]">bring your course.</h2>
          <div className="mt-12 flex flex-wrap gap-3">
            <Link to="/signin?mode=signup&role=professor" className="inline-flex h-12 items-center rounded-full bg-white px-6 font-display font-medium text-accent hover:bg-accent-50 transition-colors">Create a class</Link>
            <Link to="/signin?mode=signup&role=student" className="inline-flex h-12 items-center rounded-full border border-white/60 px-6 font-display font-medium hover:bg-white/10 transition-colors">Join with a code</Link>
            <Link to="/signin" className="inline-flex h-12 items-center px-4 font-display hover:underline">Sign in</Link>
          </div>

          <footer className="mt-28 md:mt-40 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-end gap-6 font-display text-[15px] tracking-[-0.015em] border-t border-white/25 pt-6">
            <div className="space-y-1">
              <Logo markClassName="h-5 w-auto" />
              <p className="text-white/70 text-sm">With thanks to Dr. Sanjay Kumar, Yogesh Chaudhari and Dr Jaideepsinh Raulji.</p>
            </div>
            <a href="#top" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="inline-flex items-center gap-1.5 hover:underline md:justify-self-center">
              Back to the start <ArrowUp size={15} />
            </a>
            <div className="md:justify-self-end md:text-right space-y-1">
              <a href="mailto:support@cobbleai.com" className="hover:underline">support@cobbleai.com</a>
              <p className="text-white/70 text-sm">© 2026 Cobble AI</p>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}
