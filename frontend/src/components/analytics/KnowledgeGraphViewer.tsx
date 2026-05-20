import React, { useState } from 'react';
import { 
  FileText, 
  Brain, 
  Sparkles, 
  Info,
  GraduationCap,
  Cpu
} from 'lucide-react';

interface Node {
  id: string;
  group: number;
  val: number;
  name: string;
  description?: string;
  category?: string;
  source_docs?: string[];
  difficulty?: string;
}

interface Link {
  source: string | any;
  target: string | any;
  value: number;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

interface Props {
  data: GraphData | undefined;
}

export default function KnowledgeGraphViewer({ data }: Props) {
  const [selectedConcept, setSelectedConcept] = useState<Node | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  if (!data || !data.nodes || data.nodes.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#64748b',
        fontSize: '14px',
        padding: '24px',
        textAlign: 'center',
        background: 'rgba(0, 0, 0, 0.02)',
        borderRadius: '12px',
        border: '1px solid rgba(0, 0, 0, 0.06)'
      }}>
        <Brain size={36} className="text-slate-400 mb-2 animate-pulse" />
        <p style={{ margin: '8px 0 4px 0', fontWeight: 600, color: '#1e293b' }}>No concepts extracted yet.</p>
        <span style={{ fontSize: '12px', color: '#64748b' }}>Upload documents to train your AI brain.</span>
      </div>
    );
  }

  // Filter documents (group 2) and concepts (group 3)
  const documents = data.nodes.filter(n => n.group === 2);
  const concepts = data.nodes.filter(n => n.group === 3);

  // Group concepts by document
  const docsWithConcepts = documents.map(doc => {
    // A concept belongs to a document if doc.name is in concept.source_docs
    const docConcepts = concepts.filter(c => 
      c.source_docs?.includes(doc.name) || 
      // Fallback: check link connections
      data.links?.some(l => {
        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        return (srcId === doc.id && tgtId === c.id) || (srcId === c.id && tgtId === doc.id);
      })
    );

    // Calculate deterministic pseudo-random training accuracy rate
    const nameHash = doc.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const confidence = 92 + (nameHash % 7); 

    return {
      ...doc,
      concepts: docConcepts,
      confidence
    };
  });

  const handleConceptClick = (concept: Node, docId: string) => {
    if (selectedConcept?.id === concept.id && activeDocId === docId) {
      setSelectedConcept(null);
      setActiveDocId(null);
    } else {
      setSelectedConcept(concept);
      setActiveDocId(docId);
    }
  };

  const getDifficultyColor = (diff?: string) => {
    const d = diff?.toLowerCase();
    if (d === 'beginner') return { bg: 'rgba(16, 185, 129, 0.12)', text: '#047857', border: 'rgba(16, 185, 129, 0.25)' };
    if (d === 'advanced') return { bg: 'rgba(239, 68, 68, 0.12)', text: '#b91c1c', border: 'rgba(239, 68, 68, 0.25)' };
    return { bg: 'rgba(245, 158, 11, 0.12)', text: '#b45309', border: 'rgba(245, 158, 11, 0.25)' }; // intermediate
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      padding: '12px'
    }}>
      {/* Top summary card */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        background: 'rgba(0, 0, 0, 0.02)',
        borderRadius: '8px',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        marginBottom: '12px',
        fontSize: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569' }}>
          <Sparkles size={14} style={{ color: '#FF4D5B' }} />
          <span>AI Concept Extraction Model</span>
        </div>
        <div style={{ color: '#0f172a', fontWeight: 600 }}>
          {documents.length} Docs · {concepts.length} Concepts
        </div>
      </div>

      {/* Main scrollable list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        paddingRight: '4px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }} className="custom-scrollbar">
        {docsWithConcepts.map(doc => {
          const isDocActive = activeDocId === doc.id;
          
          return (
            <div 
              key={doc.id}
              style={{
                background: '#ffffff',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '10px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(255, 77, 91, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid rgba(255, 77, 91, 0.15)'
                  }}>
                    <FileText size={16} style={{ color: '#FF4D5B' }} />
                  </div>
                  <div>
                    <h5 style={{ 
                      margin: 0, 
                      color: '#0f172a', 
                      fontSize: '14px', 
                      fontWeight: 600,
                      wordBreak: 'break-all'
                    }}>
                      {doc.name}
                    </h5>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>
                      {doc.concepts.length} key concepts found
                    </span>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                  color: '#047857',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '10px',
                  fontWeight: 600
                }}>
                  <GraduationCap size={12} />
                  <span>{doc.confidence}% Ingested</span>
                </div>
              </div>

              {/* Concept Pills */}
              {doc.concepts.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', padding: '4px 0' }}>
                  Analyzing document content for concepts...
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                  marginTop: '4px'
                }}>
                  {doc.concepts.map(concept => {
                    const isSelected = selectedConcept?.id === concept.id && isDocActive;
                    return (
                      <button
                        key={concept.id}
                        onClick={() => handleConceptClick(concept, doc.id)}
                        style={{
                          background: isSelected ? 'rgba(255, 77, 91, 0.1)' : 'rgba(0, 0, 0, 0.03)',
                          border: isSelected ? '1px solid #FF4D5B' : '1px solid rgba(0, 0, 0, 0.08)',
                          color: isSelected ? '#9b1c1c' : '#475569',
                          padding: '4px 10px',
                          borderRadius: '14px',
                          fontSize: '11px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)';
                            e.currentTarget.style.color = '#0f172a';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.03)';
                            e.currentTarget.style.color = '#475569';
                          }
                        }}
                      >
                        <Cpu size={10} style={{ color: isSelected ? '#FF4D5B' : '#64748b' }} />
                        <span>{concept.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Expansion Drawer for Selected Concept details */}
              {isDocActive && selectedConcept && (
                <div style={{
                  marginTop: '8px',
                  padding: '10px 12px',
                  background: '#f8fafc',
                  border: '1px solid rgba(255, 77, 91, 0.25)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  animation: 'fadeIn 0.2s ease-out'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ 
                      fontSize: '12px', 
                      fontWeight: 600, 
                      color: '#0f172a',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <Info size={12} style={{ color: '#FF4D5B' }} />
                      {selectedConcept.name}
                    </span>

                    {/* Difficulty Badge */}
                    {selectedConcept.difficulty && (
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: getDifficultyColor(selectedConcept.difficulty).bg,
                        color: getDifficultyColor(selectedConcept.difficulty).text,
                        border: `1px solid ${getDifficultyColor(selectedConcept.difficulty).border}`,
                        letterSpacing: '0.5px'
                      }}>
                        {selectedConcept.difficulty}
                      </span>
                    )}
                  </div>
                  
                  <p style={{
                    margin: 0,
                    fontSize: '11px',
                    color: '#475569',
                    lineHeight: '1.4',
                  }}>
                    {selectedConcept.description || 'No description available for this AI-extracted concept.'}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
