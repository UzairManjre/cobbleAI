import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useGraphStore } from '../../store/graphStore';
import { useAuthStore } from '../../store/authStore';
import KnowledgeGraph from '../../components/graph/KnowledgeGraph';
import TutorChat from '../../components/graph/TutorChat';
import NodeInfo from '../../components/graph/NodeInfo';
import ConceptNavigator from '../../components/graph/ConceptNavigator';
import MapNotReady from '../../components/graph/MapNotReady';
import { Button } from '../../components/ui/Button';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Loader2, Network, X } from 'lucide-react';

const MAP_PREF = 'cobble.study.showMap';

function readMapPref(): boolean {
  try { return localStorage.getItem(MAP_PREF) === '1'; } catch { return false; }
}

/** Pill segmented control: sunken track, white thumb (DESIGN: segmented control). */
function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex items-center gap-0.5 p-0.5 rounded-full bg-sunken">
      {options.map(o => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-8 px-4 rounded-full font-display text-sm tracking-[-0.01em] transition-colors duration-200 ${
            value === o.value ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-ink-3 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function StudyMode() {
  const { courseId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { role } = useAuthStore();

  const {
    nodes, currentNodeId, visitedNodes, masteredNodes, navigateToNode,
    isLoading, error, fetchCourseGraph, setCurrentNode, toggleMastered,
  } = useGraphStore();

  const [showGenerator, setShowGenerator] = useState(true);
  const [isCheckingGraph, setIsCheckingGraph] = useState(false);
  // The map is a way to find your bearings, not the lesson: closed until the student asks for it
  const [showMap, setShowMap] = useState(readMapPref);
  const [mobilePane, setMobilePane] = useState<'concept' | 'tutor'>('concept');
  const [studyTab, setStudyTab] = useState<'teach' | 'review'>('teach');
  const [isCardFlipped, setIsCardFlipped] = useState(false);

  const toggleMap = () => {
    setShowMap(v => {
      try { localStorage.setItem(MAP_PREF, v ? '0' : '1'); } catch { /* private mode: not remembered */ }
      return !v;
    });
  };

  // Handle node query parameter from StudyPlan / map. Only once per ?node= value: asking a question
  // toggles isLoading, and re-navigating then aborted the streaming answer and cleared the chat.
  const handledNodeParam = useRef<string | null>(null);
  useEffect(() => {
    const nodeId = searchParams.get('node');
    if (nodeId && nodeId !== handledNodeParam.current && nodes.length > 0 && !isLoading) {
      handledNodeParam.current = nodeId;
      setCurrentNode(nodeId);
      navigateToNode(nodeId);
    }
  }, [nodes.length, isLoading, searchParams, setCurrentNode, navigateToNode]);

  useEffect(() => {
    if (courseId) initStudySession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => { setIsCardFlipped(false); }, [currentNodeId]);

  const initStudySession = async () => {
    setIsCheckingGraph(true);
    try {
      await fetchCourseGraph(courseId!);
      const state = useGraphStore.getState();
      if (state.nodes && state.nodes.length > 0) {
        setShowGenerator(false);
        // A rebuilt map can drop the concept the student was on: start from the first one then
        if (!state.nodes.some(n => n.id === state.currentNodeId)) setCurrentNode(state.nodes[0].id);
      }
    } catch (err) {
      console.log('No existing graph found, showing generator:', err);
    } finally {
      setIsCheckingGraph(false);
    }
  };

  const currentIndex = nodes.findIndex(n => n.id === currentNodeId);
  const currentNode = nodes[currentIndex] || nodes[0];
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < nodes.length - 1;
  const goNext = () => { if (canGoNext) navigateToNode(nodes[currentIndex + 1].id); };
  const goPrevious = () => { if (canGoPrevious) navigateToNode(nodes[currentIndex - 1].id); };

  if (isCheckingGraph) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center gap-3 text-ink-3">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading your concepts</span>
      </div>
    );
  }

  if (error && nodes.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <div className="max-w-sm text-center space-y-4">
          <h2 className="font-display text-xl tracking-[-0.025em]">The concept map didn't load</h2>
          <p className="text-sm text-ink-3">{error}</p>
          <Button onClick={() => initStudySession()}>Try again</Button>
        </div>
      </div>
    );
  }

  if (showGenerator) {
    // No concept map yet: the same status card the 3D map shows (build progress, or what has to happen first)
    return (
      <div className="flex items-center justify-center px-8 py-16">
        {courseId && (
          <MapNotReady
            courseId={courseId}
            role={role}
            onReady={() => initStudySession()}
            onBack={() => navigate(`/courses/${courseId}`)}
          />
        )}
      </div>
    );
  }

  const activeNodeId = nodes.some(n => n.id === currentNodeId) ? currentNodeId : (nodes[0]?.id ?? null);
  if (!activeNodeId) {
    return <div className="min-h-[60vh] flex items-center justify-center text-sm text-ink-3">No concept to study yet.</div>;
  }

  const isMastered = !!currentNode && masteredNodes.includes(currentNode.id);
  const teach = studyTab === 'teach';

  return (
    // Full window, like the 3D map: the app's centred page layout leaves the study tools cramped
    <div className="fixed inset-0 z-[60] bg-canvas text-ink flex flex-col">

      <header className="h-16 border-b border-line flex items-center gap-3 px-3 md:px-5 shrink-0">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 md:flex-1">
          <button
            onClick={() => navigate(`/courses/${courseId}`)}
            aria-label="Back to the course"
            className="w-9 h-9 rounded-full flex items-center justify-center text-ink-3 hover:text-ink hover:bg-sunken transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <ConceptNavigator nodes={nodes} currentIndex={Math.max(currentIndex, 0)} onPick={navigateToNode} />
        </div>

        <div className="ml-auto md:ml-0 shrink-0">
        <Segmented
          label="Study mode"
          value={studyTab}
          onChange={setStudyTab}
          options={[{ value: 'teach', label: 'Learn' }, { value: 'review', label: 'Review' }]}
        />
        </div>

        <div className="hidden md:flex items-center justify-end gap-4 flex-1 min-w-0">
          <p className="hidden md:block annot text-ink-3 tabular-nums whitespace-nowrap"
            title={`${visitedNodes.length} of ${nodes.length} concepts opened, ${masteredNodes.length} marked mastered`}>
            {masteredNodes.length} mastered · {visitedNodes.length}/{nodes.length} seen
          </p>
          {teach && (
            <button
              onClick={toggleMap}
              aria-pressed={showMap}
              className={`hidden lg:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-display transition-colors ${
                showMap ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink hover:bg-sunken'
              }`}
            >
              {showMap ? <X className="w-3.5 h-3.5" /> : <Network className="w-3.5 h-3.5" />}
              Map
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Concept (Learn) or flashcard (Review) */}
        <main className={`min-h-0 min-w-0 flex-1 overflow-y-auto ${mobilePane === 'concept' ? 'block' : 'hidden lg:block'}`}>
          {teach ? (
            <NodeInfo nodeId={activeNodeId} onNavigate={navigateToNode} />
          ) : currentNode && (
            <div className="max-w-xl mx-auto px-6 py-12 md:py-20 min-h-full flex flex-col">
              <div className="flex items-center justify-between">
                <span className="annot text-ink-3 tabular-nums">Card {currentIndex + 1} of {nodes.length}</span>
                {isMastered && <span className="annot text-ink-3 flex items-center gap-1"><Check className="w-3 h-3" /> Mastered</span>}
              </div>

              <div className="flex-1 flex flex-col justify-center py-10">
                <h2 className="font-display text-3xl md:text-4xl tracking-[-0.03em] leading-[1.05] text-balance">{currentNode.label}</h2>
                {!isCardFlipped ? (
                  <>
                    <p className="mt-4 text-ink-3">Say the definition, how it works and where it's used. Then check yourself.</p>
                    <div className="mt-8">
                      <Button onClick={() => setIsCardFlipped(true)}>Show the answer</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-5 text-[17px] leading-relaxed text-ink-2">{currentNode.description}</p>
                    <div className="mt-10 border-t border-line pt-6">
                      <p className="text-sm text-ink-3 mb-3">How well did you know it?</p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={goNext}>Not yet</Button>
                        <Button variant="outline" size="sm" onClick={goNext}>Partly</Button>
                        <Button size="sm" onClick={() => { if (!isMastered) toggleMastered(currentNode.id); goNext(); }}>
                          <Check className="w-3.5 h-3.5" /> Knew it
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-line pt-4 text-sm">
                <button onClick={goPrevious} disabled={!canGoPrevious}
                  className="inline-flex items-center gap-1 text-ink-3 hover:text-ink disabled:opacity-30">
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <button onClick={goNext} disabled={!canGoNext}
                  className="inline-flex items-center gap-1 text-ink-3 hover:text-ink disabled:opacity-30">
                  Skip <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </main>

        {teach && showMap && (
          <section aria-label="Concept map" className="hidden lg:block flex-1 min-w-0 border-l border-line relative">
            <KnowledgeGraph onNodeClick={navigateToNode} />
            <button
              onClick={() => navigate(`/courses/${courseId}/map`)}
              className="absolute top-3 right-3 z-20 h-8 px-3 rounded-full bg-surface border border-line-strong text-xs font-display text-ink-2 hover:border-ink"
            >
              Open in 3D
            </button>
          </section>
        )}

        <aside aria-label="Tutor"
          className={`min-h-0 flex-col border-l border-line bg-surface lg:w-[420px] 2xl:w-[480px] lg:shrink-0 ${
            mobilePane === 'tutor' ? 'flex flex-1' : 'hidden lg:flex'}`}>
          <TutorChat key={`${studyTab}-${activeNodeId}`} nodeId={activeNodeId} mode={studyTab} />
        </aside>
      </div>

      {error && (
        <div role="alert" className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm max-w-md z-50">
          {error}
        </div>
      )}

      {/* Phone: one pane at a time */}
      <div className="lg:hidden border-t border-line p-2 flex justify-center shrink-0">
        <Segmented
          label="Pane"
          value={mobilePane}
          onChange={setMobilePane}
          options={[{ value: 'concept', label: teach ? 'Concept' : 'Card' }, { value: 'tutor', label: 'Tutor' }]}
        />
      </div>
    </div>
  );
}
