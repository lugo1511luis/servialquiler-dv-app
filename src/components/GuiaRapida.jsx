import { useState } from 'react'
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react'
import { NARANJA } from '../utils/formatters'

export default function GuiaRapida({ moduloNombre, tips = [] }) {
  const [abierto, setAbierto] = useState(false)

  if (!tips || tips.length === 0) return null

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50/70 p-2.5 text-xs text-amber-900 shadow-sm">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="flex w-full items-center justify-between text-left font-bold"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-200 text-amber-900">
            <Lightbulb size={14} className="text-[#FF5500]" />
          </span>
          <span className="text-sm font-bold text-neutral-900">
            💡 Guía Rápida: ¿Qué puedo hacer aquí en {moduloNombre}?
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono text-[11px] text-neutral-600 hover:text-black">
          <span>{abierto ? 'Ocultar ayuda' : 'Ver instrucciones sencillas'}</span>
          {abierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {abierto && (
        <div className="mt-2.5 border-t border-amber-200/80 pt-2.5">
          <ul className="space-y-1.5 text-neutral-800">
            {tips.map((tip, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: NARANJA }}
                >
                  {idx + 1}
                </span>
                <span className="leading-snug">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
