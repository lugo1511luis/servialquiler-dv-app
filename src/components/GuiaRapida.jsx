import { useState } from 'react'
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react'
import { NARANJA } from '../utils/formatters'

export default function GuiaRapida({ moduloNombre, tips = [] }) {
  const [abierto, setAbierto] = useState(false)

  if (!tips || tips.length === 0) return null

  return (
    <div className="rounded-md border border-neutral-300 bg-white p-3 text-xs text-neutral-800 shadow-sm" style={{ borderLeft: `4px solid ${NARANJA}` }}>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="flex w-full items-center justify-between text-left font-bold"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-neutral-900 text-white">
            <Lightbulb size={14} color={NARANJA} />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-900">
            Guía Operativa: Funciones y uso de {moduloNombre}
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono text-[11px] text-neutral-600 hover:text-black">
          <span>{abierto ? 'Ocultar instrucciones' : 'Ver instrucciones de uso'}</span>
          {abierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {abierto && (
        <div className="mt-3 border-t border-neutral-200 pt-3">
          <ul className="space-y-2 text-neutral-700">
            {tips.map((tip, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
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
