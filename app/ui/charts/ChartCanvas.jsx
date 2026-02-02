'use client';

import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export default function ChartCanvas({ type, data, options }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    chartRef.current = new Chart(ctx, {
      type,
      data,
      options,
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [type, data, options]);

  return <canvas ref={canvasRef} />;
}

