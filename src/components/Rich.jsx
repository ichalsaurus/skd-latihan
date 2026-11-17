import katex from 'katex'
import 'katex/dist/katex.min.css'

// $...$ = rumus sebaris, $$...$$ = rumus satu blok, \$ = tanda dolar biasa.
// Hanya hasil KaTeX yang dimasukkan sebagai HTML; teks lain tetap teks biasa.
const TOKEN = /(\\\$|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g

const math = (tex, displayMode) =>
  katex.renderToString(tex, { displayMode, throwOnError: false })

export default function Rich({ text = '', className = '' }) {
  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {text.split(TOKEN).map((p, i) => {
        if (p === '\\$') return '$'
        if (p.length > 4 && p.startsWith('$$') && p.endsWith('$$'))
          return (
            <span
              key={i}
              className="block overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: math(p.slice(2, -2), true) }}
            />
          )
        if (p.length > 2 && p.startsWith('$') && p.endsWith('$'))
          return <span key={i} dangerouslySetInnerHTML={{ __html: math(p.slice(1, -1), false) }} />
        return p
      })}
    </span>
  )
}
