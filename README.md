# Road to TKT

PWA de suivi de poids (iPhone / iPad) : pesée quotidienne, poids affiché = minimum sur 7 jours, IMC, 10 paliers,
graphiques jour / semaine / mois / année, plan (rythmes et projections), résumé hebdo, photos face / profil / dos
avec comparateur avant / après. Les données restent sur l'appareil (IndexedDB).

## Développement

```bash
npm install
npm run dev      # http://localhost:5173/road-to-tkt/
npm test         # tests des calculs (src/lib/calc.test.ts)
npm run build    # build de production dans dist/
```

## Déploiement (GitHub Pages)

1. Créer un dépôt GitHub nommé **`road-to-tkt`** (le nom doit correspondre à `base` dans `vite.config.ts`).
2. Dans le dépôt : *Settings → Pages → Source : GitHub Actions*.
3. Pousser sur `main` : le workflow `.github/workflows/deploy.yml` teste, build et publie.
4. Sur iPhone : ouvrir `https://<utilisateur>.github.io/road-to-tkt/` dans Safari → Partager → « Sur l'écran d'accueil ».

## Structure

- `src/lib/calc.ts` : tous les calculs (fonctions pures, testées)
- `src/db/` : base Dexie, sauvegarde JSON, données de démo
- `src/pages/` : Accueil, Graphique, Plan, Photos, Réglages
- `src/components/` : jauge, graphique, feuille de saisie, barre d'onglets
