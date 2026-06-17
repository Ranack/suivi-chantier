# Dashboard de suivi de chantier

> Un tableau de bord HTML autonome pour piloter un chantier de rénovation : un seul fichier, ouvrable hors-ligne, sans build, sans backend.

Conçu pour les particuliers qui mènent une rénovation énergétique d'envergure (MaPrimeRénov', Parcours Accompagné, devis multi-postes, factures échelonnées) et qui veulent garder une vue d'ensemble lisible sans abonnement à un SaaS.

## Aperçu

- **Chronologie interactive** des jalons administratifs et travaux, avec dates éditables à la volée
- **Échéancier de paiements** avec dates de règlement modifiables d'un clic
- **Donut de financement** qui se recalcule selon les paiements effectués
- **Grille de travaux** par poste, avec photos *avant / après* et slider de comparaison
- **Travaux à prévoir** avec tri intelligent par priorité (heuristiques locales, pas d'IA externe)
- **Import PDF** : déposez un devis, une facture ou une attribution d'aide — l'app détecte automatiquement les dates, montants et références
- **Multi-propriétés** : pilotez plusieurs biens immobiliers (résidence principale, secondaire, locatif…) depuis le même tableau de bord, avec un panneau dédié pour les ajouter, modifier ou supprimer
- **Assistant** local pour interroger votre base de connaissances
- **Persistance automatique** dans le navigateur (localStorage + IndexedDB pour les photos)
- **Export / Import JSON** pour les sauvegardes externes
- **Export agenda** (.ics ou Google Calendar) de tous vos jalons

## Démarrage

1. Téléchargez `chantier.html`
2. Ouvrez le fichier dans votre navigateur (Chrome, Firefox, Edge, Safari — tous OK)
3. C'est tout. Aucune installation, aucun serveur.

Les données démo s'affichent immédiatement. Pour partir d'une base vierge, suivez la section *Customisation* ci-dessous.

## Structure du projet

```
chantier-dashboard/
├── index.html              Markup (chargé directement, aucune build étape)
├── css/
│   ├── base.css            Reset, typographie, layout, sidebar, top bar, boutons
│   ├── components.css      Cartes bento : hero, progression, stats, timeline, travaux…
│   └── widgets.css         Modales, formulaires, toasts, palette ⌘K, photos, switcher
├── js/
│   ├── utils.js            Helpers purs : formatters de date, normalize, slugify
│   ├── ui.js               openModal / closeModal / toast
│   ├── state.js            Données + storage (localStorage + IndexedDB), proxy d'état
│   ├── render.js           Toutes les fonctions de rendu (timeline, paiements, pie, etc.)
│   ├── pdf-extract.js      Extraction PDF + parsing dates/montants/références
│   ├── photos.js           Modale galerie avant/après + slider de comparaison
│   ├── properties.js       Gestion des propriétés (add/edit/delete + panneau)
│   ├── features.js         Tri intelligent, agenda export, palette ⌘K, assistant
│   └── main.js             Bootstrap : switch projet, import JSON, init au chargement
├── README.md
└── .gitignore
```

L'ordre de chargement dans `index.html` respecte les dépendances (utils → ui → state → render → pdf-extract → photos → properties → features → main). Chaque module expose ses fonctions au scope global ; pas de système de modules, pas de bundler, ouverture directe via `file://` ou serveur statique.

## Customisation

**Le moyen le plus simple : utilisez directement l'interface.** Au premier lancement, supprimez les propriétés de démo via le panneau « Gérer les propriétés » (voir section suivante), puis ajoutez les vôtres avec le bouton « + Ajouter ». Importez vos PDF dans la section Documents, et les jalons + données financières se remplissent automatiquement.

Pour adapter le **profil affiché en sidebar** : cherchez `<div class="user-avatar">JD</div>` et `<div class="name">Jean Dupont</div>` dans le HTML, remplacez par vos valeurs.

Si vous voulez personnaliser plus en profondeur (étiquettes, sections optionnelles, comportements par défaut), tout est défini en haut du `<script>` final, dans l'objet `projects`. Ouvrez le fichier dans n'importe quel éditeur de texte, cherchez `let projects = {`, et adaptez la seed initiale :

```js
let projects = {
  main: {
    id: 'main',
    initials: 'MP',
    name: 'Maison principale',
    location: 'Votre commune',
    region: 'Votre région',
    address: '[Votre adresse]',
    totalCost: 100000,        // montant TTC du devis global
    mprAmount: 40000,         // aide principale (MaPrimeRénov', etc.)
    ambAmount: 4000,          // bonus / parrainage
    hasFinancials: true,
    milestones: [...],        // jalons de chantier
    payments: [...],          // factures et acomptes
    works: [...],             // postes de travaux
    futureWorks: [...]        // travaux à planifier plus tard
  }
};
```

Une fois lancé, vous pouvez enrichir le contenu à la volée depuis l'interface :
- **Ajouter une propriété** : bouton « + Ajouter » dans le dropdown du switcher de projet en haut de la sidebar
- **Ajouter un document** : bouton en haut à droite → drop d'un PDF → extraction automatique
- **Décaler un jalon** : clic sur la date dans la chronologie
- **Modifier une date de paiement** : clic sur la cellule dans le tableau
- **Ajouter des photos avant/après** : bouton sur chaque carte de travail
- **Travaux à prévoir** : bouton « + Ajouter » dans la section dédiée

## Gestion des propriétés

Le tableau de bord supporte plusieurs biens immobiliers (résidence principale, secondaire, locatif…). Dans le dropdown du switcher de projet en haut de la sidebar, deux boutons sont disponibles :

- **+ Ajouter** : ouvre directement le formulaire de création d'une nouvelle propriété
- **⚙ Gérer** : ouvre un panneau qui liste toutes vos propriétés avec, pour chacune, un bouton pour l'activer, la modifier ou la supprimer

Lors de la création/édition d'une propriété, vous renseignez :
- **Nom** (obligatoire) et **nom court** (facultatif, sinon le nom complet est utilisé)
- **Initiales** (auto-suggérées depuis le nom, modifiables, 3 caractères max)
- **Localisation**, **région**, **adresse complète** (utilisée pour les exports `.ics` et Google Calendar)
- **Toggle « Chantier en cours »** : quand activé, débloque les sections financières (paiements, donut de financement, travaux planifiés) et demande le coût total TTC, l'aide principale et le bonus/parrainage. Quand désactivé, la propriété est traitée comme une résidence sans chantier engagé (utile pour les biens en phase de réflexion ou les résidences secondaires).

**Sécurités** : impossible de supprimer la dernière propriété restante ; supprimer la propriété active bascule automatiquement vers une autre ; toutes les actions sont annulables pendant 5,5 secondes via un toast.

## Stockage des données

Toutes les données sont stockées **localement dans votre navigateur** :

| Quoi | Où | Pourquoi |
|---|---|---|
| État du dashboard (jalons, paiements, docs, etc.) | `localStorage` | Léger, suffisant pour les données textuelles |
| Photos avant/après | `IndexedDB` | Volumes plus importants (typiquement 50 % de l'espace disque libre) |

**Sauvegarde automatique** : 400 ms après chaque modification, l'état est sérialisé en JSON et écrit dans le `localStorage`. Une dernière sauvegarde de sécurité est déclenchée à la fermeture de l'onglet.

**Indicateur visuel** : un petit bloc « Sauvegardé · il y a X » s'affiche dans la sidebar.

**Export JSON** : bouton dans la sidebar pour télécharger une copie complète de l'état (utile pour transférer entre machines, faire un backup, ou versionner sur Git).

**Import JSON** : restaurez à tout moment depuis un fichier exporté.

> ⚠️ Les photos (IndexedDB) ne sont **pas incluses** dans l'export JSON — elles restent locales au navigateur. Si vous changez de machine ou de navigateur, vous devrez les ré-importer. C'est un compromis volontaire pour garder l'export léger.

> ⚠️ Le `localStorage` et l'`IndexedDB` sont liés au chemin du fichier dans le navigateur. Déplacer le fichier ailleurs ou l'ouvrir dans un autre navigateur démarre avec un état vide. **Exportez régulièrement en JSON** comme filet de sécurité.

## Tri intelligent des travaux à prévoir

Le bouton « Trier intelligemment » applique un moteur de scoring **100 % local** sur les travaux à prévoir, sans appel API. Il combine trois axes :

- **Catégorie sémantique** (analyse de mots-clés sur le titre + description) — prérequis > sécurité/étanchéité > performance énergétique > confort > esthétique > agrément
- **Urgence de l'échéance** — dépassée > imminente > dans les mois à venir > lointaine
- **Contexte du projet** — un chantier en cours dé-priorise les non-essentiels

Chaque travail reçoit une priorité 1/2/3 et une justification courte affichée sur la carte.

## Import de PDF

Glissez un PDF dans la zone d'upload des Documents (ou utilisez le bouton « + Ajouter un document »). L'app utilise [PDF.js](https://mozilla.github.io/pdf.js/) (chargé depuis CDN) pour extraire le texte, puis applique des regex pour détecter :

- **Dates** : français long (« 15 juin 2026 »), numérique (« 15/06/2026 »), ISO
- **Montants** : « 18 431,30 € », « 42 800,00 € TTC », etc.
- **Références** : codes type `FA-124`, `DEVRG-2025...`, `MPR-2025-...`, etc.
- **Organismes** : commerciaux, artisans, organismes publics

Vous prévisualisez les éléments détectés et confirmez avant ajout.

## Stack technique

- **HTML/CSS/JS vanilla** — pas de framework, pas de build
- **Polices** : [Geist](https://vercel.com/font), [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif), [JetBrains Mono](https://www.jetbrains.com/lp/mono/), chargées depuis Google Fonts
- **PDF.js 3.11** pour l'extraction PDF, depuis cdnjs
- **localStorage** + **IndexedDB** + **Blob API** + **Canvas API** (pour la compression des photos)
- **Aucune dépendance npm**, aucun bundler

L'ensemble du code tient dans un seul fichier `chantier.html` (~6 300 lignes commentées).

## Compatibilité

- Chrome 90+ ✓
- Firefox 90+ ✓
- Safari 14+ ✓
- Edge 90+ ✓
- Mobile : iOS Safari 14+, Chrome Android — l'interface s'adapte automatiquement

API utilisées qui peuvent limiter la compatibilité avec des navigateurs très anciens :
- `IndexedDB` (toutes versions modernes)
- `input[type=date]` (idem)
- `URL.createObjectURL` (idem)

## Confidentialité

**Aucune donnée ne quitte votre machine.** Pas de tracker, pas d'analytics, pas d'appel API externe (hors chargement des fonts et de PDF.js depuis CDN au premier chargement).

Si vous voulez un mode 100 % hors-ligne après le premier chargement : les ressources externes peuvent être téléchargées et inlinées dans le fichier. C'est un travail simple mais qui alourdit le fichier de quelques centaines de Ko.


## Licence

MIT — utilisez, modifiez, partagez librement.

