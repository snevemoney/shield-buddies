import { db } from './db';

const checklistSeed = [
  { textEn: '72-hour emergency go-bag packed', textFr: "Sac d'urgence 72 heures préparé", category: 'essentials', order: 1 },
  { textEn: 'First aid kit fully stocked', textFr: 'Trousse de premiers soins complète', category: 'essentials', order: 2 },
  { textEn: '2-week water supply stored (4L/person/day)', textFr: "Réserve d'eau de 2 semaines (4L/personne/jour)", category: 'essentials', order: 3 },
  { textEn: '2-week non-perishable food supply', textFr: 'Réserve alimentaire non périssable de 2 semaines', category: 'essentials', order: 4 },
  { textEn: 'Medications supply — 30 day minimum', textFr: 'Réserve de médicaments — minimum 30 jours', category: 'essentials', order: 5 },
  { textEn: 'Hygiene supplies ready', textFr: "Produits d'hygiène prêts", category: 'essentials', order: 6 },
  { textEn: 'Battery or hand-crank radio acquired', textFr: 'Radio à piles ou à manivelle acquise', category: 'communication', order: 7 },
  { textEn: 'Flashlights and extra batteries', textFr: 'Lampes de poche et piles supplémentaires', category: 'communication', order: 8 },
  { textEn: 'Solar charger or power bank', textFr: 'Chargeur solaire ou batterie externe', category: 'communication', order: 9 },
  { textEn: 'Local emergency frequencies documented', textFr: "Fréquences d'urgence locales documentées", category: 'communication', order: 10 },
  { textEn: 'Ham radio license obtained', textFr: 'Licence radio amateur obtenue', category: 'communication', order: 11 },
  { textEn: 'Warm clothing and blankets staged', textFr: 'Vêtements chauds et couvertures préparés', category: 'shelter', order: 12 },
  { textEn: 'Fire starting supplies ready', textFr: 'Matériel pour faire du feu prêt', category: 'shelter', order: 13 },
  { textEn: 'Basic tools assembled (multi-tool, tape, rope)', textFr: 'Outils de base assemblés (multi-outil, ruban, corde)', category: 'shelter', order: 14 },
  { textEn: 'Water purification method available', textFr: "Méthode de purification d'eau disponible", category: 'shelter', order: 15 },
  { textEn: 'Important documents backed up', textFr: 'Documents importants sauvegardés', category: 'knowledge', order: 16 },
  { textEn: 'Evacuation routes mapped and printed', textFr: "Routes d'évacuation cartographiées et imprimées", category: 'knowledge', order: 17 },
  { textEn: 'Family/group rally points established', textFr: 'Points de ralliement établis', category: 'knowledge', order: 18 },
  { textEn: 'Neighbors and community contacts made', textFr: 'Contacts avec les voisins et la communauté établis', category: 'knowledge', order: 19 },
  { textEn: 'Cash reserve prepared (small bills + coins)', textFr: "Réserve d'argent préparée (petites coupures + monnaie)", category: 'maintenance', order: 20 },
  { textEn: 'Vehicle fuel kept above half tank', textFr: 'Réservoir de véhicule maintenu au-dessus de la moitié', category: 'maintenance', order: 21 },
];

export async function seedDatabase() {
  const count = await db.checklistItems.count();
  if (count === 0) {
    await db.checklistItems.bulkAdd(
      checklistSeed.map((item) => ({ ...item, completed: false }))
    );
  }

  // Seed example alerts
  const alertCount = await db.cachedAlerts.count();
  if (alertCount === 0) {
    await db.cachedAlerts.bulkAdd([
      {
        level: 'Warning',
        region: 'Montréal, QC',
        description: 'Severe thunderstorm watch in effect for the Greater Montréal area.',
        issuedAt: Date.now() - 3600000,
        cachedAt: Date.now(),
      },
      {
        level: 'Advisory',
        region: 'Longueuil, QC',
        description: 'Winter weather travel advisory. Reduce speed and increase following distance.',
        issuedAt: Date.now() - 7200000,
        cachedAt: Date.now(),
      },
      {
        level: 'Information',
        region: 'Québec',
        description: 'Amber Alert cancelled. Child found safe.',
        issuedAt: Date.now() - 86400000,
        cachedAt: Date.now(),
      },
    ]);
  }
}
