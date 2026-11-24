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
        labelTextColor="#282828"
        orientLabel={false}
        parentLabel={(node: any) => node.depth === 1 ? node.id : ''}
        parentLabelSize={14}
        parentLabelPosition="top"
        parentLabelTextColor="#282828"
        // High-end neon palette
        colors={(node: any) => {
          const colors = ['#6366f1', '#059669', '#000000', '#b45309', '#8fadeb', '#4f75f7'];
          const path = node.path || '';
          const courseName = path.split('.')[1] || node.id;
          let hash = 0;
          for (let i = 0; i < courseName.length; i++) hash = courseName.charCodeAt(i) + ((hash << 5) - hash);
          const baseColor = colors[Math.abs(hash) % colors.length];
          
          if (node.depth === 1) return baseColor;
          if (node.depth === 2) return baseColor + 'ee'; // Doc level (slightly darker for contrast)
          return baseColor + '44'; // Chunk level
        }}
        nodeOpacity={0.9}
        borderWidth={2}
        borderColor="#282828"
        enableParentLabel={true}
        tile="squarify"
        leavesOnly={false}
        innerPadding={3}
        outerPadding={3}
        theme={{
          textColor: '#282828',
          fontSize: 10,
          fontFamily: "'Outfit', 'Inter', sans-serif",
          tooltip: {
            container: {
              background: '#282828',
              color: '#282828',
              fontSize: 12,
              borderRadius: '8px',
              border: '2px solid #0A0A0A',
              boxShadow: '4px 4px 0 rgba(0, 0, 0, 0.95)',
              padding: '12px',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 600
            }
          }
        } as any}
      />
    </div>
  );
}
