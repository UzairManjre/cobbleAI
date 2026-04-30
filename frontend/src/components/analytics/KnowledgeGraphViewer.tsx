import React, { useRef, useEffect, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { forceCollide } from 'd3-force';

interface Node {
  id: string;
  group: number;
  val: number;
  x?: number;
  y?: number;
}

interface Link {
  source: string;
  target: string;
  value: number;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

interface Props {
  data: GraphData | undefined;
}

const GROUP_COLORS: Record<number, string> = {
  1: '#818cf8', // Courses — indigo
  2: '#34d399', // Documents — emerald
  3: '#f472b6', // Concepts — pink
};

const GROUP_LABELS: Record<number, string> = {
  1: 'Course',
  2: 'Document',
  3: 'Concept',
};

export default function KnowledgeGraphViewer({ data }: Props) {
  const fgRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Configure d3-force physics after mount to fix the hairball
  useEffect(() => {
    if (!fgRef.current) return;
    const fg = fgRef.current;

    // 1. Strong repulsion — courses push HARD, concepts lighter
    fg.d3Force('charge')?.strength((node: any) => {
      if (node.group === 1) return -500;
      if (node.group === 2) return -200;
      return -80;
    });

    // 2. Collision detection — nodes cannot overlap
    fg.d3Force('collide', forceCollide((node: any) => {
      return Math.sqrt(node.val || 4) * 3 + 3;
    }));

    // 3. Longer link distances so the graph spreads out
    fg.d3Force('link')?.distance((link: any) => {
      const src = typeof link.source === 'object' ? link.source : null;
      if (src?.group === 1) return 140;
      if (src?.group === 2) return 80;
      return 40;
    });

    // 4. Weaker center gravity
    fg.d3Force('center')?.strength(0.03);

    // Reheat the simulation so the new forces take effect
    fg.d3ReheatSimulation();

  }, [data, dimensions]);

  // Auto-zoom after physics settles
  useEffect(() => {
    if (fgRef.current && data && data.nodes.length > 0) {
      const timer = setTimeout(() => fgRef.current?.zoomToFit(500, 60), 2500);
      return () => clearTimeout(timer);
    }
  }, [data]);

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D) => {
    const r = Math.sqrt(node.val || 4) * 2.5;
    const color = GROUP_COLORS[node.group] || '#94a3b8';

    // Glow
    ctx.shadowColor = color;
    ctx.shadowBlur = node.group === 1 ? 22 : 10;

    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Labels for courses and documents only (concepts on hover)
    if (node.group <= 2) {
      ctx.font = `${node.group === 1 ? 'bold 4.5px' : '3px'} Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const displayName = node.name || node.id;
      const label = displayName.length > 22 ? displayName.slice(0, 20) + '…' : displayName;
      ctx.fillText(label, node.x, node.y + r + 5);
    }
  }, []);

  if (!data || !data.nodes || data.nodes.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontSize: '14px' }}>
        No knowledge graphs generated yet. Upload documents and generate a graph first.
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Legend */}
      <div style={{
        position: 'absolute', top: 8, right: 12, zIndex: 10,
        display: 'flex', gap: '14px', fontSize: '11px', color: '#94a3b8',
        background: 'rgba(15,23,42,0.7)', padding: '6px 12px', borderRadius: '8px',
        backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.06)',
      }}>
        {Object.entries(GROUP_LABELS).map(([g, label]) => (
          <span key={g} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: GROUP_COLORS[Number(g)], display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>

      {/* Stats */}
      <div style={{
        position: 'absolute', bottom: 8, left: 12, zIndex: 10,
        fontSize: '10px', color: '#64748b',
        background: 'rgba(15,23,42,0.7)', padding: '4px 10px', borderRadius: '6px',
      }}>
        {data.nodes.length} nodes · {data.links.length} edges
      </div>

      {dimensions.width > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={data}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
            const r = Math.sqrt(node.val || 4) * 2.5;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 2, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          nodeLabel={(node: any) => `<div style="background:rgba(15,23,42,0.95);color:#f8fafc;padding:8px 12px;border-radius:8px;font-size:12px;max-width:280px;border:1px solid rgba(255,255,255,0.1)"><strong style="color:${GROUP_COLORS[node.group]}">${GROUP_LABELS[node.group] || 'Node'}</strong><br/>${node.name || node.id}</div>`}
          linkColor={() => 'rgba(148, 163, 184, 0.12)'}
          linkWidth={(link: any) => Math.max(0.3, (link.value || 0.5) * 0.6)}
          backgroundColor="transparent"
          d3VelocityDecay={0.35}
          d3AlphaDecay={0.015}
          warmupTicks={120}
          cooldownTime={5000}
        />
      )}
    </div>
  );
}
