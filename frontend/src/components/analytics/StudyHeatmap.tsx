import React from 'react';
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
        emptyColor="rgba(255, 255, 255, 0.05)"
        borderWidth={1}
        borderColor="rgba(255, 255, 255, 0.1)"
        enableLabels={false}
        theme={{
          textColor: '#ffffff',
          fontSize: 12,
          axis: {
            domain: { line: { stroke: 'rgba(255, 255, 255, 0.2)' } },
            ticks: { line: { stroke: 'rgba(255, 255, 255, 0.2)' } }
          },
          tooltip: {
            container: {
              background: 'rgba(15, 23, 42, 0.95)',
              color: '#f8fafc',
              fontSize: 12,
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.2)'
            }
          }
        }}
      />
    </div>
  );
}
