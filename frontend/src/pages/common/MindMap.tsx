import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useNavigate, useParams } from 'react-router-dom';
import { useGraphStore } from '../../store/graphStore';
import SpriteText from 'three-spritetext';
// @ts-ignore - three module types are not fully defined
import * as THREE from 'three';
import { ArrowLeft, Loader2, ShieldCheck, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { escapeHtml } from '../../utils/html';
import MapNotReady from '../../components/graph/MapNotReady';
import EdgeAuditPanel from '../../components/graph/EdgeAuditPanel';

export default function MindMap() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { role } = useAuthStore();
  const isProfessor = role === 'professor';
  const graphRef = useRef<any>(null);
  const [auditOpen, setAuditOpen] = useState(false);

  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const { nodes, edges, graphId, fetchCourseGraph, isLoading } = useGraphStore();

  useEffect(() => {
    if (courseId) {
      fetchCourseGraph(courseId);
    }
  }, [courseId, fetchCourseGraph]);

  // Transform backend data to ForceGraph format
  const graphData = useMemo(() => {
    return {
      nodes: nodes.map(node => ({
        ...node,
        // Visual props
        val: 12 + (node.id.length % 5), // Deterministic but varied size
        color: node.difficulty === 'advanced' ? '#000000' : 
               node.difficulty === 'beginner' ? '#8fadeb' : '#073dea'
      })),
      links: edges.map(edge => ({
        source: edge.from,
        target: edge.to,
        relation: edge.relation
      }))
    };
  }, [nodes, edges]);

  const handleNodeClick = (node: any) => {
    // Zoom into node
    const distance = 50;
    const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);
    
    graphRef.current?.cameraPosition(
      { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, 
      node, 
      1800
    );

    // Give visual feedback then navigate
    setTimeout(() => {
       // Set the current node in the store
       useGraphStore.setState({ currentNodeId: node.id });
       navigate(`/courses/${courseId}/learn`);
    }, 1200);
  };

  const fullScreen = "fixed inset-0 z-40 font-sans";

  if (isLoading && nodes.length === 0) {
    return (
      <div className={`${fullScreen} bg-canvas flex items-center justify-center`}>
        <div className="flex flex-col items-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin mb-4" />
          <div className="annot text-ink-3">
            Loading the concept map
          </div>
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className={`${fullScreen} bg-canvas flex flex-col items-center justify-center p-8`}>
        {courseId && (
          <MapNotReady
            courseId={courseId}
            role={role}
            onReady={() => fetchCourseGraph(courseId)}
            onBack={() => navigate(`/courses/${courseId}`)}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`${fullScreen} bg-canvas overflow-hidden`}>
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between gap-6 px-5 md:px-8 h-16 font-display">
        <button
          onClick={() => navigate(isProfessor ? `/courses/${courseId}` : `/courses/${courseId}/learn`)}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-surface border border-line-strong text-ink hover:border-ink text-sm cursor-pointer"
        >
          <ArrowLeft size={16} /> {isProfessor ? 'Back to course' : 'Back to Learn'}
        </button>

        <div className="flex items-center gap-4">
          {isProfessor && graphId && (
            <button
              onClick={() => setAuditOpen(o => !o)}
              aria-expanded={auditOpen}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-accent text-white text-sm cursor-pointer"
            >
              <ShieldCheck size={16} /> Check links
            </button>
          )}
          <div>
            <h1 className="text-ink font-medium tracking-[-0.03em] text-lg leading-tight text-right">concept map</h1>
            <p className="annot text-ink-3 text-right tabular">{nodes.length} concepts · {edges.length} links</p>
          </div>
        </div>
      </div>

      {isProfessor && auditOpen && graphId && courseId && (
        <aside className="absolute top-16 right-0 bottom-0 z-20 w-full max-w-md bg-canvas border-l border-line overflow-y-auto p-5"
          aria-label="Check the map's links">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-lg tracking-[-0.02em] text-ink">Check the map's links</h2>
              <p className="text-xs text-ink-3 mt-1">Mark sampled links right or wrong against their source quotes to measure how accurate the map is.</p>
            </div>
            <button onClick={() => setAuditOpen(false)} aria-label="Close" className="p-1.5 rounded-lg text-ink-3 hover:text-ink">
              <X size={16} />
            </button>
          </div>
          <EdgeAuditPanel graphId={graphId} courseId={courseId} />
        </aside>
      )}

      <ForceGraph3D
        ref={graphRef}
        graphData={graphData}
        backgroundColor="#f9f9f9"
        width={dimensions.width}
        height={dimensions.height}
        
        // Custom node rendering for labels + spheres
        nodeThreeObject={(node: any) => {
          const group = new THREE.Group();

          // The label
          const sprite = new SpriteText(node.label);
          sprite.color = '#0A0A0A'; // Dark text for light mode
          sprite.textHeight = 4;
          sprite.fontWeight = '500';
          sprite.fontFace = 'Space Grotesk, system-ui, sans-serif';
          // Add a white background/stroke effect to the sprite text by setting background
          sprite.backgroundColor = 'rgba(249,249,249,0.85)';
          sprite.padding = [2, 4];
          sprite.borderRadius = 4;
          
          // @ts-ignore - SpriteText has position property
          sprite.position.set(0, 8, 0); // Position above node
          group.add(sprite);

          // The sphere
          const geometry = new THREE.SphereGeometry(Math.sqrt(node.val || 10));
          const material = new THREE.MeshPhongMaterial({ 
            color: node.color || '#3B82F6',
            transparent: false,
            shininess: 60,
          });
          
          // Add a black outline effect (wireframe slightly larger)
          const edgesGeometry = new THREE.EdgesGeometry(geometry);
          const edgesMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1 });
          const wireframe = new THREE.LineSegments(edgesGeometry, edgesMaterial);
          
          const sphere = new THREE.Mesh(geometry, material);
          sphere.add(wireframe);
          
          group.add(sphere);

          return group;
        }}
        
        nodeLabel={(node: any) => `
          <div style="background:#fff;padding:14px 16px;border-radius:14px;border:1px solid #e4e4e7;box-shadow:0 12px 32px -12px rgba(0,0,0,.25);font-family:-apple-system,'Segoe UI',system-ui,sans-serif;max-width:260px;">
            <div style="color:#000;font-family:'Space Grotesk',sans-serif;font-weight:500;font-size:16px;letter-spacing:-0.02em;margin-bottom:6px;">${escapeHtml(node.label)}</div>
            <div style="color:#5c5c62;font-size:12.5px;line-height:1.45;">${escapeHtml(node.description)}</div>
            <div style="margin-top:10px;font-family:'Space Grotesk',sans-serif;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#073dea;">${escapeHtml(node.difficulty || 'intermediate')}</div>
          </div>
        `}
        
        linkColor={() => 'rgba(7,61,234,0.22)'}
        linkWidth={1}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleColor={() => '#073dea'}
        
        // Stabilization
        d3AlphaDecay={0.03}
        d3VelocityDecay={0.4}
        cooldownTicks={100}
        
        onNodeClick={handleNodeClick}
      />

      <div className="absolute bottom-6 inset-x-0 px-5 md:px-8 pointer-events-none flex flex-wrap items-end justify-between gap-4">
        <div className="flex gap-5 annot text-ink-3">
          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-accent-200" /> Beginner</span>
          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-accent" /> Intermediate</span>
          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-ink" /> Advanced</span>
        </div>
        <p className="annot text-ink-3">{isProfessor ? 'Click a concept to preview it as a student' : 'Click a concept to study it'}</p>
      </div>
    </div>
  );
}
