// Registro de avisos de nuevas features (los consume el toast
// AvisoNuevaFeature, que se monta una vez en App). Para anunciar una
// feature nueva, agregá un objeto: { id, title, body, addedAt,
// expiresAt } con fechas ISO (solo día, sin hora).
//
// - `id`: estable — queda en localStorage (clave `avisosVistos_1`);
//   nunca lo reutilices para otra feature.
// - `addedAt` / `expiresAt`: ventana de vigencia. Sugerido: ~30 días
//   entre ambos. Un aviso vigente solo se muestra una vez (la primera
//   visita dentro de la ventana); si hay varios elegibles, se muestra
//   el más reciente y el resto queda pendiente hasta que venza (así
//   nunca se apilan). Los vencidos se ignoran solos y sus ids se
//   limpian del storage al cargar.
export const ANNOUNCEMENTS = [
  {
    id: 'refresh-analysis-2026-10',
    title: 'Ahora podés actualizar un análisis',
    body: 'Si la info de un juego quedó vieja, tocá “Actualizar” en su sala para volver a analizarlo sin esperar 3 días.',
    addedAt: '2026-10-15',
    expiresAt: '2026-11-14',
  },
]
