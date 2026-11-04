import { useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  UserCheck,
  UserX,
  X,
  Loader2,
  TriangleAlert,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import { etiquetaRol, NARANJA, NEGRO } from '../utils/formatters'
import GuiaRapida from '../components/GuiaRapida'

const FORM_INICIAL = {
  username: '',
  password_hash: '',
  nombre_completo: '',
  rol: 'Galpon',
  activo: true,
}

export default function UsuariosModule({ usuarios, usuarioActual, onRecargar }) {
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_INICIAL)
  const [guardando, setGuardando] = useState(false)
  const [errorModal, setErrorModal] = useState(null)

  const abrirNuevo = () => {
    setEditandoId(null)
    setForm(FORM_INICIAL)
    setErrorModal(null)
    setModalAbierto(true)
  }

  const abrirEditar = (u) => {
    setEditandoId(u.id)
    setForm({
      username: u.username ?? '',
      password_hash: u.password_hash ?? '',
      nombre_completo: u.nombre_completo ?? '',
      rol: u.rol ?? 'Galpon',
      activo: u.activo !== false,
    })
    setErrorModal(null)
    setModalAbierto(true)
  }

  const guardarUsuario = async (e) => {
    e.preventDefault()
    if (!form.username.trim() || !form.password_hash.trim() || !form.nombre_completo.trim()) {
      setErrorModal('Completa el usuario, contraseña y nombre del trabajador.')
      return
    }

    setGuardando(true)
    setErrorModal(null)

    const payload = {
      username: form.username.trim(),
      password_hash: form.password_hash.trim(),
      nombre_completo: form.nombre_completo.trim(),
      rol: form.rol,
      activo: Boolean(form.activo),
    }

    const res = editandoId
      ? await supabase.from('usuarios_erp').update(payload).eq('id', editandoId)
      : await supabase.from('usuarios_erp').insert([payload])

    setGuardando(false)
    if (res.error) {
      setErrorModal(res.error.message)
      return
    }
    setModalAbierto(false)
    onRecargar()
  }

  const alternarActivo = async (u) => {
    const nuevoEstado = !(u.activo !== false)
    const { error } = await supabase
      .from('usuarios_erp')
      .update({ activo: nuevoEstado })
      .eq('id', u.id)
    if (error) {
      window.alert(`Error al actualizar estado: ${error.message}`)
      return
    }
    onRecargar()
  }

  const eliminarUsuario = async (u) => {
    if (u.id === usuarioActual?.id) {
      window.alert('No puedes eliminar tu propio usuario en sesión activa.')
      return
    }
    const ok = window.confirm(
      `¿Eliminar definitivamente el usuario de "${u.nombre_completo}" (@${u.username})?`,
    )
    if (!ok) return
    const { error } = await supabase.from('usuarios_erp').delete().eq('id', u.id)
    if (error) {
      window.alert(`Error al eliminar usuario: ${error.message}`)
      return
    }
    onRecargar()
  }

  const tipsUsuarios = [
    'Crea aquí las cuentas de acceso para el personal que trabajará con el sistema.',
    'Selecciona el rol adecuado: "Administrador" (control total de la empresa y tasa), "Administración" (facturación y cobranza) o "Encargado de Galpón" (solo entradas, salidas y préstamos de equipos, sin ver dinero).',
    'Si un empleado ya no trabaja en la empresa, haz clic sobre el botón "Activo" para desactivar su cuenta y bloquear su entrada.',
  ]

  const th =
    'whitespace-nowrap px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white'
  const td = 'whitespace-nowrap px-3.5 py-2.5 text-xs'

  return (
    <div className="space-y-4">
      {/* Guía Rápida */}
      <GuiaRapida moduloNombre="Usuarios y Permisos" tips={tipsUsuarios} />

      <section
        className="overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm"
        style={{ borderLeft: `4px solid ${NARANJA}` }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white"
          style={{ background: NEGRO }}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} color={NARANJA} />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Cuentas de Usuarios y Permisos del Personal
              </h2>
              <p className="text-[11px] text-neutral-400">
                Módulo reservado para el Administrador · Control de accesos y contraseñas
              </p>
            </div>
          </div>

          <button
            onClick={abrirNuevo}
            className="flex items-center gap-1.5 rounded px-3.5 py-1.5 text-xs font-bold text-white shadow"
            style={{ background: NARANJA }}
            title="Dar de alta a un nuevo trabajador en el sistema"
          >
            <Plus size={15} />
            <span>+ Crear Nuevo Usuario</span>
          </button>
        </div>

        {usuarios.length === 0 ? (
          <p className="p-8 text-center text-xs text-neutral-500">
            No hay usuarios registrados en usuarios_erp.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ color: NEGRO }}>
              <thead style={{ background: '#1c1c1c' }}>
                <tr>
                  <th className={th}>Usuario de Acceso</th>
                  <th className={th}>Nombre del Trabajador</th>
                  <th className={th}>Puesto / Rol Asignado</th>
                  <th className={`${th} text-center`}>Acceso al Sistema</th>
                  <th className={`${th} text-center`}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {usuarios.map((u) => {
                  const activo = u.activo !== false
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-orange-50/50">
                      <td className={`${td} font-mono font-bold text-neutral-700`}>
                        @{u.username}
                      </td>
                      <td className={`${td} font-bold text-neutral-900`}>
                        {u.nombre_completo}
                      </td>
                      <td className={td}>
                        <span
                          className="rounded border px-2 py-0.5 text-[11px] font-bold"
                          style={{
                            background: 'rgba(255,85,0,0.12)',
                            color: '#c2410c',
                            borderColor: '#fdba74',
                          }}
                        >
                          {etiquetaRol(u.rol)}
                        </span>
                      </td>
                      <td className={`${td} text-center`}>
                        <button
                          onClick={() => alternarActivo(u)}
                          className="inline-flex items-center gap-1 rounded border px-2.5 py-0.5 text-[11px] font-bold uppercase"
                          style={
                            activo
                              ? {
                                  background: 'rgba(16,185,129,0.12)',
                                  color: '#047857',
                                  borderColor: '#6ee7b7',
                                }
                              : {
                                  background: 'rgba(239,68,68,0.12)',
                                  color: '#b91c1c',
                                  borderColor: '#fca5a5',
                                }
                          }
                          title="Haz clic aquí para activar o desactivar este usuario"
                        >
                          {activo ? <UserCheck size={12} /> : <UserX size={12} />}
                          {activo ? 'Activo (Puede entrar)' : 'Bloqueado (No entra)'}
                        </button>
                      </td>
                      <td className={`${td} text-center`}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => abrirEditar(u)}
                            className="rounded border border-neutral-300 bg-neutral-100 p-1.5 text-neutral-800 hover:border-[#FF5500]"
                            title="Cambiar contraseña, nombre o rol"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => eliminarUsuario(u)}
                            className="rounded border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                            title="Eliminar usuario definitivamente"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Crear / Editar Usuario */}
        {modalAbierto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md overflow-hidden rounded-md border border-neutral-700 bg-white shadow-2xl">
              <div
                className="flex items-center justify-between px-5 py-3.5 text-white"
                style={{ background: NEGRO, borderBottom: `3px solid ${NARANJA}` }}
              >
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  {editandoId ? 'Editar Cuenta del Trabajador' : 'Crear Cuenta para un Trabajador'}
                </h3>
                <button onClick={() => setModalAbierto(false)} className="text-neutral-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={guardarUsuario} className="space-y-3.5 p-5 text-xs">
                {errorModal && (
                  <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-2.5 text-xs text-red-700">
                    <TriangleAlert size={15} />
                    <span>{errorModal}</span>
                  </div>
                )}

                <div>
                  <label className="mb-1 block font-bold uppercase text-neutral-600">
                    Nombre y Apellido *
                  </label>
                  <input
                    required
                    value={form.nombre_completo}
                    onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })}
                    placeholder="Ej. Carlos Pérez"
                    className="w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-[#FF5500]"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-bold uppercase text-neutral-600">
                      Nombre de Usuario (Para entrar) *
                    </label>
                    <input
                      required
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="Ej. cperez"
                      className="w-full rounded border border-neutral-300 px-3 py-2 font-mono outline-none focus:border-[#FF5500]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-bold uppercase text-neutral-600">
                      Contraseña *
                    </label>
                    <input
                      required
                      type="text"
                      value={form.password_hash}
                      onChange={(e) => setForm({ ...form, password_hash: e.target.value })}
                      placeholder="Clave secreta"
                      className="w-full rounded border border-neutral-300 px-3 py-2 font-mono outline-none focus:border-[#FF5500]"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-bold uppercase text-neutral-600">
                      Puesto / Nivel de Acceso *
                    </label>
                    <select
                      value={form.rol}
                      onChange={(e) => setForm({ ...form, rol: e.target.value })}
                      className="w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-[#FF5500]"
                    >
                      <option value="Administrador">Administrador (Acceso total)</option>
                      <option value="Administracion">Administración (Facturación y Reportes)</option>
                      <option value="Galpon">Encargado de Galpón (Solo Equipos y Devoluciones)</option>
                    </select>
                  </div>

                  <div className="flex items-end pb-2">
                    <label className="flex cursor-pointer items-center gap-2 font-bold text-neutral-700">
                      <input
                        type="checkbox"
                        checked={form.activo}
                        onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                        className="h-4 w-4 accent-[#FF5500]"
                      />
                      <span>Cuenta Habilitada</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-neutral-200 pt-3">
                  <button
                    type="button"
                    onClick={() => setModalAbierto(false)}
                    className="rounded border border-neutral-300 px-4 py-2 text-xs font-bold text-neutral-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardando}
                    className="flex items-center gap-1.5 rounded px-5 py-2 text-xs font-bold text-white"
                    style={{ background: NARANJA }}
                  >
                    {guardando && <Loader2 size={14} className="animate-spin" />}
                    <span>{editandoId ? 'Guardar Cambios' : 'Crear Usuario'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
