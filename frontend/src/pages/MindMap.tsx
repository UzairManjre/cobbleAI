import { useEffect, useMemo, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useNavigate, useParams } from 'react-router-dom';
import { useGraphStore } from '../store/graphStore';
import SpriteText from 'three-spritetext';
// @ts-ignore - three module types are not fully defined
import * as THREE from 'three';

export default function MindMap() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const graphRef = useRef<any>(null);
  
  const { nodes, edges, fetchCourseGraph, isLoading } = useGraphStore();

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
        color: node.difficulty === 'advanced' ? '#f59e0b' : 
               node.difficulty === 'beginner' ? '#10b981' : '#3b82f6'
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
       // Set the auto-intro flag in the store
       useGraphStore.setState({ autoIntroNodeId: node.id, currentNodeId: node.id });
       navigate(`/course/${courseId}/study`);
    }, 1200);
  };

  if (isLoading && nodes.length === 0) {
    return (
      <div className="h-screen w-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-white/20 animate-pulse font-mono tracking-widest uppercase text-xs">
          Synchronizing Neural Connections...
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="h-screen w-screen bg-[#0A0A0A] flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-3xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-8">
          <div className="w-2 h-2 rounded-full bg-white/20 animate-ping" />
        </div>
        <h2 className="text-white/60 text-lg font-medium mb-4">No Map Available</h2>
        <p className="text-white/20 text-[13px] max-w-sm mb-12 leading-relaxed">
          This course hasn't been transformed into a knowledge graph yet. 
          Upload materials and click "Generate" to build the network.
        </p>
        <button 
          onClick={() => navigate(`/course/${courseId}`)}
          className="px-8 py-3 bg-white text-black hover:bg-white/90 rounded-2xl text-[13px] font-semibold transition-all shadow-[0_0_30px_rgba(255,255,255,0.05)]"
        >
          Return to Mission Control
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#0A0A0A] relative overflow-hidden">
      <div className="absolute top-8 left-8 z-10 flex items-center gap-4">
        <button 
          onClick={() => navigate(`/course/${courseId}`)} 
          className="text-white/50 hover:text-white bg-white/5 hover:bg-white/10 px-4 py-2.5 rounded-2xl backdrop-blur-xl border border-white/5 transition-all text-sm font-medium"
        >
          &larr; Exit Map
        </button>
        <div className="h-10 w-[1px] bg-white/5 mx-2" />
        <div>
          <h1 className="text-white font-semibold tracking-tight text-sm">Course Neural Network</h1>
          <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] mt-0.5">{nodes.length} Concepts • {edges.length} Synapses</p>
        </div>
      </div>

      <ForceGraph3D
        ref={graphRef}
        graphData={graphData}
        backgroundColor="#0A0A0A"
        
        // Custom node rendering for labels + spheres
        nodeThreeObject={(node: any) => {
          const group = new THREE.Group();

          // The label
          const sprite = new SpriteText(node.label);
          sprite.color = node.color || '#3b82f6';
          sprite.textHeight = 4;
          sprite.fontWeight = '600';
          sprite.fontFace = 'Inter, system-ui, sans-serif';
          // @ts-ignore - SpriteText has position property
          sprite.position.set(0, 8, 0); // Position above node
          group.add(sprite);

          // The sphere (since we are replacing default with this group)
          const geometry = new THREE.SphereGeometry(Math.sqrt(node.val || 10));
          const material = new THREE.MeshPhongMaterial({ 
            color: node.color || '#3b82f6',
            transparent: true,
            opacity: 0.8,
            emissive: node.color || '#3182f6',
            emissiveIntensity: 0.2,
            shininess: 100
          });
          const sphere = new THREE.Mesh(geometry, material);
          group.add(sphere);

          return group;
        }}
        
        nodeLabel={(node: any) => `
          <div style="background: rgba(0,0,0,0.85); padding: 12px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <div style="color: #fff; font-weight: 600; font-size: 15px; margin-bottom: 6px;">${node.label}</div>
            <div style="color: rgba(255,255,255,0.5); font-size: 12px; max-width: 200px; line-height: 1.4;">${node.description}</div>
            <div style="margin-top: 10px; display: flex; gap: 4px;">
                <span style="background: ${node.color}33; color: ${node.color}; font-size: 9px; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; font-weight: 700;">${node.difficulty || 'intermediate'}</span>
            </div>
          </div>
        `}
        
        linkColor={() => 'rgba(255,255,255,0.1)'}
        linkWidth={0.5}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.003}
        
        // Stabilization
        d3AlphaDecay={0.03}
        d3VelocityDecay={0.4}
        cooldownTicks={100}
        
        onNodeClick={handleNodeClick}
      />

      <div className="absolute bottom-10 left-0 right-0 text-center pointer-events-none px-6">
        <div className="inline-block backdrop-blur-2xl bg-white/[0.03] border border-white/10 px-8 py-5 rounded-[2rem] shadow-2xl">
          <div className="flex flex-col items-center">
             <span className="text-[12px] text-white/60 font-medium mb-1.5 uppercase tracking-widest">Interactive Learning Grid</span>
             <div className="flex gap-8 text-[11px] text-white/30">
               <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Beginner</span>
               <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Intermediate</span>
               <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Advanced</span>
             </div>
             <p className="mt-4 text-[10px] text-white/10 max-w-xs leading-relaxed uppercase tracking-tighter">Click a concept to launch RAG-powered deep dive chat</p>
          </div>
        </div>
      </div>
    </div>
  );
}
