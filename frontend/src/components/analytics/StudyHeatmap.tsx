import { ResponsiveHeatMap } from '@nivo/heatmap';

interface Props {
  data: any[];
}

export default function StudyHeatmap({ data }: Props) {
  if (!data || data.length === 0) return <div>No heatmap data</div>;

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <ResponsiveHeatMap
        data={data}
        margin={{ top: 20, right: 30, bottom: 40, left: 60 }}
        valueFormat=">-.2s"
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: -45,
          legend: 'Hour of Day',
          legendPosition: 'middle',
          legendOffset: 36
        }}
        axisLeft={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: 'Day of Week',
          legendPosition: 'middle',
          legendOffset: -50
        }}
        colors={{
          type: 'sequential',
          scheme: 'inferno'
        }}
        emptyColor="rgba(0, 0, 0, 0.04)"
        borderWidth={1}
        borderColor="rgba(0, 0, 0, 0.08)"
        enableLabels={false}
        theme={{
          textColor: '#0A0A0A',
          fontSize: 11,
          axis: {
            domain: { line: { stroke: 'rgba(0, 0, 0, 0.1)' } },
            ticks: { line: { stroke: 'rgba(0, 0, 0, 0.1)' } }
          },
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
