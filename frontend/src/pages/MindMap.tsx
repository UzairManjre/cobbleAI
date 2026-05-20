import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useNavigate, useParams } from 'react-router-dom';
import { useGraphStore } from '../store/graphStore';
import SpriteText from 'three-spritetext';
// @ts-ignore - three module types are not fully defined
import * as THREE from 'three';
import { ArrowLeft, Map as MapIcon, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function MindMap() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { role } = useAuthStore();
  const graphRef = useRef<any>(null);
  
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
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
        color: node.difficulty === 'advanced' ? '#FF4D5B' : 
               node.difficulty === 'beginner' ? '#10B981' : '#3B82F6'
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
       navigate(`/${role}/courses/${courseId}/study`);
    }, 1200);
  };

  const fullScreen = "fixed inset-0 z-40 font-['Outfit']";

  if (isLoading && nodes.length === 0) {
    return (
      <div className={`${fullScreen} bg-[#FCFCFC] flex items-center justify-center`}>
        <div className="flex flex-col items-center">
          <Loader2 className="w-12 h-12 text-[#FF4D5B] animate-spin mb-4" />
          <div className="text-[#0A0A0A] font-extrabold tracking-wide uppercase text-sm">
            Synchronizing Neural Connections...
          </div>
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className={`${fullScreen} bg-[#FCFCFC] flex flex-col items-center justify-center text-center p-8`}>
        <div className="bg-white border-[3px] border-[#0A0A0A] rounded-2xl p-12 text-center shadow-[8px_8px_0_#0A0A0A] max-w-md">
          <div className="w-20 h-20 bg-gray-100 border-[3px] border-[#0A0A0A] rounded-full flex items-center justify-center mx-auto mb-6">
            <MapIcon size={32} className="text-[#0A0A0A]" />
          </div>
          <h2 className="text-2xl font-extrabold text-[#0A0A0A] mb-4">No Map Available</h2>
          <p className="text-[#0A0A0A]/60 font-bold text-sm mb-8">
            This course hasn't been transformed into a knowledge graph yet. 
            Upload materials and generate the map first.
          </p>
          <button 
            onClick={() => navigate(`/${role}/courses/${courseId}`)}
            className="w-full py-3 bg-[#FF4D5B] text-white border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[4px_4px_0_#0A0A0A] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#0A0A0A] transition-all"
          >
            Return to Course Detail
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${fullScreen} bg-[#FCFCFC] overflow-hidden`}>
      <div className="absolute top-8 left-8 z-10 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 bg-white/80 backdrop-blur-md p-4 rounded-2xl border-2 border-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A]">
        <button 
          onClick={() => navigate(`/${role}/courses/${courseId}`)} 
          className="px-4 py-2 bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[2px_2px_0_#0A0A0A] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 active:shadow-none transition-all flex items-center gap-2 text-sm"
        >
          <ArrowLeft size={16} className="stroke-[3px]" /> Exit Map
        </button>
        <div className="hidden md:block h-8 w-[2px] bg-[#0A0A0A]/20" />
        <div>
          <h1 className="text-[#0A0A0A] font-extrabold tracking-tight text-lg leading-tight">Course Neural Network</h1>
          <p className="text-xs text-[#0A0A0A]/60 font-bold uppercase tracking-wider">{nodes.length} Concepts • {edges.length} Synapses</p>
        </div>
      </div>

      <ForceGraph3D
        ref={graphRef}
        graphData={graphData}
        backgroundColor="#FCFCFC"
        width={dimensions.width}
        height={dimensions.height}
        
        // Custom node rendering for labels + spheres
        nodeThreeObject={(node: any) => {
          const group = new THREE.Group();

          // The label
          const sprite = new SpriteText(node.label);
          sprite.color = '#0A0A0A'; // Dark text for light mode
          sprite.textHeight = 4;
          sprite.fontWeight = '800';
          sprite.fontFace = 'Outfit, system-ui, sans-serif';
          // Add a white background/stroke effect to the sprite text by setting background
          sprite.backgroundColor = 'rgba(255,255,255,0.7)';
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
          const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x0a0a0a, linewidth: 2 });
          const wireframe = new THREE.LineSegments(edgesGeometry, edgesMaterial);
          
          const sphere = new THREE.Mesh(geometry, material);
          sphere.add(wireframe);
          
          group.add(sphere);

          return group;
        }}
        
        nodeLabel={(node: any) => `
          <div style="background: #ffffff; padding: 16px; border-radius: 12px; border: 3px solid #0a0a0a; box-shadow: 4px 4px 0px #0a0a0a; font-family: 'Outfit', sans-serif;">
            <div style="color: #0a0a0a; font-weight: 800; font-size: 16px; margin-bottom: 8px;">${node.label}</div>
            <div style="color: rgba(10,10,10,0.7); font-weight: 600; font-size: 12px; max-width: 220px; line-height: 1.4;">${node.description}</div>
            <div style="margin-top: 12px; display: flex; gap: 6px;">
                <span style="background: ${node.color}20; border: 2px solid ${node.color}; color: ${node.color}; font-size: 10px; padding: 2px 8px; border-radius: 6px; text-transform: uppercase; font-weight: 800;">${node.difficulty || 'intermediate'}</span>
            </div>
          </div>
        `}
        
        linkColor={() => 'rgba(10,10,10,0.15)'}
        linkWidth={1}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleColor={() => '#0A0A0A'}
        
        // Stabilization
        d3AlphaDecay={0.03}
        d3VelocityDecay={0.4}
        cooldownTicks={100}
        
        onNodeClick={handleNodeClick}
      />

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none px-6">
        <div className="bg-white border-2 border-[#0A0A0A] px-8 py-4 rounded-2xl shadow-[4px_4px_0_#0A0A0A]">
          <div className="flex flex-col items-center">
             <span className="text-[12px] text-[#0A0A0A] font-extrabold mb-2 uppercase tracking-widest">Interactive Learning Grid</span>
             <div className="flex gap-6 text-[11px] text-[#0A0A0A]/60 font-bold">
               <span className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#10B981] border border-[#0A0A0A]" /> Beginner</span>
               <span className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] border border-[#0A0A0A]" /> Intermediate</span>
               <span className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#FF4D5B] border border-[#0A0A0A]" /> Advanced</span>
             </div>
             <p className="mt-3 text-[10px] text-[#0A0A0A]/40 max-w-xs text-center font-bold uppercase tracking-tighter">Click a concept to launch deep dive chat</p>
          </div>
        </div>
      </div>
    </div>
  );
}
