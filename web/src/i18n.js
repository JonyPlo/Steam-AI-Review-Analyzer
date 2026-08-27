/* Traducción única de los descriptores oficiales de Steam (la comparte el
   catálogo, la sala y el dropdown). */
export function traducirReview(desc) {
  if (!desc) return 'Sin reseñas'
  const traducciones = {
    'Overwhelmingly Positive': 'Extremadamente positivas',
    'Very Positive': 'Muy positivas',
    'Mostly Positive': 'Mayormente positivas',
    Positive: 'Positivas',
    Mixed: 'Mixtas',
    'Mostly Negative': 'Mayormente negativas',
    Negative: 'Negativas',
    'Very Negative': 'Muy negativas',
    'Overwhelmingly Negative': 'Extremadamente negativas',
    'No user reviews': 'Sin reseñas de usuarios',
  }
  return traducciones[desc] || desc
}
