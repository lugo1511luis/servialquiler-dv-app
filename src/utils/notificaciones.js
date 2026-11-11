// ---------------------------------------------------------------------------
// Sistema de Notificaciones en Tiempo Real y Generador de Audio
// ServiAlquiler DV, C.A. — ERP Industrial Precision
// ---------------------------------------------------------------------------

/**
 * Generador de sonido con Web Audio API (AudioContext)
 * Emite un doble timbre nítido, claro y audible tipo "ding-dong" industrial
 */
export const reproducirDobleTimbre = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const t = ctx.currentTime

    // Timbre 1: Frecuencia 987.77 Hz (Si 5)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(987.77, t)
    gain1.gain.setValueAtTime(0.25, t)
    gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(t)
    osc1.stop(t + 0.16)

    // Timbre 2: Frecuencia 1318.51 Hz (Mi 6)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1318.51, t + 0.12)
    gain2.gain.setValueAtTime(0.3, t + 0.12)
    gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.38)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(t + 0.12)
    osc2.stop(t + 0.38)

    setTimeout(() => {
      ctx.close().catch(() => {})
    }, 600)
  } catch {
    // Si el navegador bloquea la reproducción de audio por falta de interacción
  }
}

/**
 * Solicita permiso para notificaciones nativas en el navegador
 */
export const solicitarPermisoNotificaciones = async () => {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission()
      } catch {
        // Ignorar
      }
    }
  }
}

/**
 * Dispara una notificación nativa del navegador / dispositivo móvil
 */
export const dispararNotificacionNativa = (titulo, cuerpo) => {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        new Notification(titulo, {
          body: cuerpo,
          icon: '/favicon.png',
          badge: '/favicon.png',
          tag: 'servialquiler-alerta',
          renotify: true,
        })
      } catch {
        // Ignorar
      }
    }
  }
}

