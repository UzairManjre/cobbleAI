import React from 'react';
import { ResponsiveTreeMap } from '@nivo/treemap';

interface Props {
  data: any;
}

export default function VectorTreemap({ data }: Props) {
  if (!data || !data.children || data.children.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontSize: '14px' }}>
        No vector data available yet.
      </div>
    );
  }

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <ResponsiveTreeMap
        data={data}
        identity="name"
        value="size"
        valueFormat=".02s"
        margin={{ top: 25, right: 0, bottom: 0, left: 0 }}
        labelSkipSize={45}
        // Use a cleaner label function
        label={(node: any) => node.depth === 2 ? node.id.split('.').pop() : ''}
        labelTextColor="#ffffff"
        orientLabel={false}
        parentLabel={(node: any) => node.depth === 1 ? node.id : ''}
        parentLabelSize={16}
        parentLabelPosition="top"
        parentLabelTextColor="#f8fafc"
        // High-end neon palette
        colors={(node: any) => {
          const colors = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#06b6d4', '#d946ef'];
          const path = node.path || '';
          const courseName = path.split('.')[1] || node.id;
          let hash = 0;
          for (let i = 0; i < courseName.length; i++) hash = courseName.charCodeAt(i) + ((hash << 5) - hash);
          const baseColor = colors[Math.abs(hash) % colors.length];
          
          if (node.depth === 1) return baseColor;
          if (node.depth === 2) return baseColor + 'bb'; // Doc level
          return baseColor + '44'; // Chunk level
        }}
        nodeOpacity={0.9}
        borderWidth={1}
        borderColor="rgba(15, 23, 42, 0.8)"
        enableParentLabel={true}
        tile="squarify"
        leavesOnly={false}
        innerPadding={2}
        outerPadding={2}
        theme={{
          textColor: '#f8fafc',
          fontSize: 10,
          fontFamily: "'Inter', sans-serif",
          tooltip: {
            container: {
              background: '#0f172a',
              color: '#f8fafc',
              fontSize: 12,
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
              padding: '12px',
            }
          }
        }}
      />
    </div>
  );
}
