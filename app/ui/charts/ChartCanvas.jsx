'use client';

import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

let are_chart_defaults_applied = false;

function applyChartDefaults() {
  if (are_chart_defaults_applied) return;
  are_chart_defaults_applied = true;

  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = '#877d6d';
  Chart.defaults.borderColor = 'rgba(47, 42, 36, 0.08)';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 7;
  Chart.defaults.plugins.legend.labels.boxHeight = 7;
  Chart.defaults.plugins.tooltip.backgroundColor = '#2f2a24';
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };
}

export default function ChartCanvas({ type, data, options }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    applyChartDefaults();

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const prefers_reduced_motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    chartRef.current = new Chart(ctx, {
      type,
      data,
      options: prefers_reduced_motion ? { ...options, animation: false } : options,
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
