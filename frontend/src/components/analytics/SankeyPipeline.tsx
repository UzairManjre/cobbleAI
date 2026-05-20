import { ResponsiveSankey } from '@nivo/sankey';

interface Props {
  data: any;
}

export default function SankeyPipeline({ data }: Props) {
  if (!data || !data.nodes || !data.links) return <div>No sankey data</div>;

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <ResponsiveSankey
        data={data}
        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        align="justify"
        colors={{ datum: 'nodeColor' }}
        nodeOpacity={0.85}
        nodeHoverOthersOpacity={0.1}
        nodeThickness={18}
        nodeSpacing={24}
        nodeBorderWidth={0}
        nodeBorderColor={{
          from: 'color',
          modifiers: [['darker', 0.8]]
        }}
        linkOpacity={0.3}
        linkHoverOthersOpacity={0.1}
        linkContract={3}
        enableLinkGradient={true}
        labelPosition="inside"
        labelOrientation="horizontal"
        labelPadding={16}
        labelTextColor="#0A0A0A"
        theme={{
          textColor: '#0A0A0A',
          fontSize: 12,
          tooltip: {
            container: {
              background: '#FFFFFF',
              color: '#0A0A0A',
              fontSize: 12,
              borderRadius: '8px',
              border: '2px solid #0A0A0A',
              boxShadow: '4px 4px 0 rgba(0, 0, 0, 0.95)',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 600
            }
          }
        } as any}
      />
    </div>
  );
}
