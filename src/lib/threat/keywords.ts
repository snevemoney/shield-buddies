export interface IndicatorCategory {
  id: string;
  keywords: string[];
  weight: number;
}

export const INDICATOR_CATEGORIES: IndicatorCategory[] = [
  {
    id: 'media_capture',
    weight: 0.10,
    keywords: [
      'media regulation', 'press freedom', 'journalist arrested', 'censorship',
      'réglementation médias', 'liberté presse', 'journaliste arrêté', 'censure',
    ],
  },
  {
    id: 'opposition_suppression',
    weight: 0.15,
    keywords: [
      'opposition leader arrested', 'party banned', 'protest crackdown', 'political prisoner',
      'chef opposition arrêté', 'parti interdit', 'répression manifestation', 'prisonnier politique',
    ],
  },
  {
    id: 'military_loyalty',
    weight: 0.20,
    keywords: [
      'military purge', 'officer dismissed', 'army restructuring', 'martial law',
      'purge militaire', 'officier renvoyé', 'loi martiale',
    ],
  },
  {
    id: 'security_personalization',
    weight: 0.30,
    keywords: [
      'new security agency', 'paramilitary', 'presidential guard', 'secret police',
      'nouvelle agence sécurité', 'paramilitaire', 'garde présidentielle', 'police secrète',
    ],
  },
  {
    id: 'information_control',
    weight: 0.20,
    keywords: [
      'internet shutdown', 'social media blocked', 'VPN banned', 'surveillance law',
      'coupure internet', 'réseaux sociaux bloqués', 'loi surveillance',
    ],
  },
  {
    id: 'economic_crisis',
    weight: 0.10,
    keywords: [
      'GDP decline', 'currency collapse', 'hyperinflation', 'sovereign default', 'sanctions',
      'déclin PIB', 'effondrement devise', 'hyperinflation', 'défaut souverain',
    ],
  },
  {
    id: 'judicial_capture',
    weight: 0.15,
    keywords: [
      'judge dismissed', 'supreme court packed', 'constitution amended', 'emergency powers',
      'juge renvoyé', 'cour suprême', 'constitution amendée', 'pouvoirs urgence',
    ],
  },
  {
    id: 'election_manipulation',
    weight: 0.15,
    keywords: [
      'election fraud', 'ballot stuffing', 'opposition barred', 'term limits removed',
      'fraude électorale', 'bourrage urnes', 'opposition exclue', 'limites mandat supprimées',
    ],
  },
];
