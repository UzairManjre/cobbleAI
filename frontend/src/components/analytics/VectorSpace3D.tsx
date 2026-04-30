import React, { useMemo } from 'react';
// @ts-ignore
import Plotly from 'plotly.js/dist/plotly';
// @ts-ignore
import _createPlotlyComponent from 'react-plotly.js/factory.js';

const createPlotlyComponent = (
  typeof _createPlotlyComponent === 'function' 
    ? _createPlotlyComponent 
    : (_createPlotlyComponent as any).default
) as any;

const Plot = createPlotlyComponent(Plotly);

interface VectorPoint {
  x: number;
  y: number;
  z: number;
  course: string;
  text_preview: string;
}

interface Props {
  data: VectorPoint[];
}

const COURSE_COLORS = [
  '#818cf8', '#34d399', '#f472b6', '#fbbf24', '#38bdf8',
  '#a78bfa', '#fb923c', '#4ade80', '#f87171', '#22d3ee',
];

export default function VectorSpace3D({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontSize: '14px' }}>
        No vector embeddings to visualize yet.
      </div>
    );
  }

  const traces = useMemo(() => {
    const courseGroups: Record<string, VectorPoint[]> = {};
    data.forEach(p => {
      if (!courseGroups[p.course]) courseGroups[p.course] = [];
      courseGroups[p.course].push(p);
    });

    return Object.entries(courseGroups).map(([course, points], i) => ({
      x: points.map(p => p.x),
      y: points.map(p => p.y),
      z: points.map(p => p.z),
      mode: 'markers' as const,
      type: 'scatter3d' as const,
      name: course,
      text: points.map(p => p.text_preview),
      hovertemplate: '<b>%{text}</b><br>x: %{x:.2f}<br>y: %{y:.2f}<br>z: %{z:.2f}<extra>%{fullData.name}</extra>',
      marker: {
        size: 2.5,
        color: COURSE_COLORS[i % COURSE_COLORS.length],
        opacity: 0.8,
        line: { width: 0 },
      },
    }));
  }, [data]);

  return (
    <Plot
      data={traces as any}
      layout={{
        autosize: true,
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        margin: { l: 0, r: 0, t: 0, b: 0 },
        scene: {
          bgcolor: 'transparent',
          xaxis: { 
            showgrid: true, 
            gridcolor: 'rgba(255,255,255,0.08)', 
            zerolinecolor: 'rgba(255,255,255,0.1)', 
            showticklabels: false, 
            title: '',
            backgroundcolor: 'transparent',
            showbackground: false
          },
          yaxis: { 
            showgrid: true, 
            gridcolor: 'rgba(255,255,255,0.08)', 
            zerolinecolor: 'rgba(255,255,255,0.1)', 
            showticklabels: false, 
            title: '',
            backgroundcolor: 'transparent',
            showbackground: false
          },
          zaxis: { 
            showgrid: true, 
            gridcolor: 'rgba(255,255,255,0.08)', 
            zerolinecolor: 'rgba(255,255,255,0.1)', 
            showticklabels: false, 
            title: '',
            backgroundcolor: 'transparent',
            showbackground: false
          },
          camera: { eye: { x: 1.6, y: 1.6, z: 1.2 } },
        },
        legend: {
          font: { color: '#94a3b8', size: 11 },
          bgcolor: 'rgba(15,23,42,0.6)',
          bordercolor: 'rgba(255,255,255,0.08)',
          borderwidth: 1,
          x: 0.01,
          y: 0.99,
        },
        font: { color: '#94a3b8' },
      }}
      config={{
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['toImage', 'sendDataToCloud'] as any,
      }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}
