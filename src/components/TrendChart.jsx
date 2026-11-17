// Grafik garis sederhana (SVG): skor per sesi, dengan garis putus-putus untuk ambang batas.
export default function TrendChart({ points, threshold, top, label }) {
  const W = 320, H = 140, L = 36, R = 10, T = 10, B = 22
  const x = (i) => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1))
  const y = (v) => T + (1 - Math.min(v, top) / top) * (H - T - B)
  const date = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#d6d3d1" />
      <line x1={L} x2={W - R} y1={y(threshold)} y2={y(threshold)} stroke="#dc2626" strokeDasharray="4 3" />
      <text x={L - 4} y={y(threshold) + 3} textAnchor="end" fontSize="10" fill="#b91c1c">{threshold}</text>
      <text x={L - 4} y={y(0) + 3} textAnchor="end" fontSize="10" fill="#78716c">0</text>
      <text x={L - 4} y={y(top) + 3} textAnchor="end" fontSize="10" fill="#78716c">{top}</text>
      <polyline fill="none" stroke="#0f766e" strokeWidth="2"
        points={points.map((p, i) => `${x(i)},${y(p.score)}`).join(' ')} />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.score)} r="3" fill="#0f766e" />)}
      <text x={L} y={H - 6} fontSize="10" fill="#78716c">{date(points[0].at)}</text>
      <text x={W - R} y={H - 6} textAnchor="end" fontSize="10" fill="#78716c">{date(points[points.length - 1].at)}</text>
    </svg>
  )
}
