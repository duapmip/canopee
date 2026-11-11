# Canopée — rejoindre les transports à l’ombre pendant une canicule

Datavisualisation interactive pour le défi « mobilités et adaptation climatique » du Hackaviz Mobilités 2026, organisé par Île-de-France Mobilités. Paris est notre terrain pilote. La carte aide à lire l'ombre des rues, à repérer les stations de transport, l'eau et les lieux frais, puis à préparer un trajet à pied entre deux adresses.

## Présentation du projet

### Le problème et la proposition de valeur

Pendant une forte chaleur, les dernières minutes à pied vers une station peuvent être pénibles. Une station proche sur un plan peut être entourée de rues exposées, sans eau ni lieu frais à proximité. Canopée rend ces écarts visibles pour les voyageurs et les acteurs de la mobilité. Ce prototype ne remplace pas un service de navigation ou une consigne sanitaire.

### La solution

#### Deux vues

- **Aujourd'hui** : réseau des rues et bâtiments actuels, ombre des bâtiments calculée heure par heure pour le 25 juin 2026 par ciel dégagé, couverture des arbres recensés estimée, fontaines disponibles et lieux frais recensés par la Ville de Paris.
- **Vers 2036** : scénario conditionnel dans lequel les arbres déjà classés « Jeune » gagnent 2 m de rayon de canopée. Les liserés verts montrent les rues où ce modèle donne plus d'ombre. La carte montre aussi les manques qui persisteraient si l'offre actuelle d'eau et de refuges ne changeait pas. Les tracés violets sont des projets de transport dont la mise en service est estimée entre 2027 et 2036.

La vue future **n'est pas une prévision à l'adresse près**. Elle modélise uniquement la croissance possible d'arbres déjà recensés, en été. Leur couronne actuelle est approximée par un disque de rayon égal à 30 % de la hauteur déclarée, limité entre 1,5 et 6 m ; le rayon des jeunes arbres augmente de 2 m, jusqu'à 8 m. Les portions de rue couvertes sont additionnées et plafonnées à 100 %. Ce n'est pas une projection directionnelle de l'ombre des arbres, ni une mesure de leur couronne. Les plantations à venir ne sont pas placées sur la carte faute de localisation et de calendrier vérifiables. Les rues et bâtiments restent ceux du modèle actuel. Aucune température future n'est extrapolée pour 2036.

#### Les abords des stations

Le prototype croise 292 points représentatifs de gares et stations ferrées d'Île-de-France Mobilités situés dans Paris avec les rues calculées, les fontaines et les lieux frais. Pour chaque station, la carte et une liste textuelle indiquent la part d'ombre des rues dans un rayon de 250 m et les distances à vol d'oiseau de l'eau et d'un lieu frais.

À 16 h, **selon notre modèle et nos seuils exploratoires**, 175 stations ont moins de 40 % d'ombre sur les rues proches ; 39 cumulent au moins deux points d'attention parmi ombre faible, fontaine à plus de 350 m et lieu frais à plus de 300 m. Ces chiffres ne mesurent ni la température ressentie ni un risque sanitaire.

#### Itinéraire canicule

Entrer une adresse de départ et une destination, puis choisir les résultats du géocodeur. On peut aussi cliquer deux points sur la carte. Le trajet favorise l'ombre des immeubles. La durée est une estimation à 75 m/min. Le résultat indique les fontaines et lieux frais à moins de 80 m du tracé. Cliquer une fontaine ou un lieu frais gratuit permet de l'ajouter comme étape.

Les horaires, l'accessibilité réelle des entrées et la disponibilité d'un équipement doivent être vérifiés avant le déplacement. La canopée est estimée par un modèle simple ; le trajet ne garantit pas l'ombre réelle et ne mesure pas la température ressentie.

### Les problèmes surmontés et les limites

Certaines emprises de bâtiment n'ont pas de hauteur : elles sont figurées en pointillés et ne projettent pas d'ombre. Les points des stations sont généralisés et ne représentent pas leurs entrées exactes. Les distances aux équipements sont à vol d'oiseau, pas par le réseau piéton. Les plantations futures ne sont pas placées faute de localisation et de calendrier vérifiables. Les projets de transport affichés ne sont pas supposés créer de l'ombre. Les seuils du classement sont des choix de visualisation, sans valeur réglementaire ou médicale.

### Et la suite ?

Relier les stations à leurs entrées réelles, calculer les distances par le chemin piéton, intégrer les horaires et l'accessibilité des lieux frais, documenter les projets de végétalisation localisés et étendre l'analyse au reste de l'Île-de-France.

## Installation et utilisation

Node.js récent et un navigateur compatible avec `DecompressionStream` sont nécessaires. Les données préparées et compressées sont incluses dans `public/data/` : la démo démarre sans recalculer toutes les rues.

```bash
npm ci
npm run dev
```

Ouvrir http://localhost:5173/. Choisir deux adresses pour le trajet, puis basculer entre Aujourd'hui et Vers 2036. Les pictogrammes indiquent les fontaines (eau animée), les lieux frais, les espaces verts (arbre) et les stations. Une alerte sur une station signale au moins deux points d'attention ; sa fiche et « Explorer les stations en texte » donnent les valeurs exactes.

`npm run build` produit le site statique dans `dist/`, données comprises. Le chemin des ressources est relatif pour permettre un hébergement dans un sous-dossier. Pour régénérer les données depuis les sources ouvertes, lancer `npm run prepare-data` avec une connexion réseau et environ 8 Go de mémoire disponibles ; les téléchargements WFS déjà écrits dans `data/raw/` sont repris au prochain lancement.

## Données et méthode

| Élément | Source | Licence |
| --- | --- | --- |
| Bâtiments, hauteurs et axes | [IGN BD TOPO, Géoplateforme WFS](https://data.geopf.fr/wfs/ows) | Licence Ouverte |
| Contour de Paris | [API Géo](https://geo.api.gouv.fr/communes/75056?fields=contour&format=geojson&geometry=contour) | Licence Ouverte |
| Température du 25 juin 2026 | [Météo-France, données horaires](https://www.data.gouv.fr/datasets/donnees-climatologiques-de-base-horaires) | Licence Ouverte |
| Fontaines | [Eau de Paris / Paris Data](https://opendata.paris.fr/explore/dataset/fontaines-a-boire/) | ODbL |
| Équipements frais | [Ville de Paris / Paris Data](https://opendata.paris.fr/explore/dataset/ilots-de-fraicheur-equipements-activites/) | ODbL |
| Espaces verts frais | [Ville de Paris / Paris Data](https://opendata.paris.fr/explore/dataset/ilots-de-fraicheur-espaces-verts-frais/) | ODbL |
| Arbres, hauteur et stade de développement | [Ville de Paris / Paris Data](https://opendata.paris.fr/explore/dataset/les-arbres/) | ODbL |
| Gares et stations du réseau ferré, points généralisés | [Île-de-France Mobilités](https://data.iledefrance-mobilites.fr/explore/dataset/emplacement-des-gares-idf-data-generalisee/) | Licence Ouverte v2 |
| Projets de transport | [Île-de-France Mobilités](https://data.iledefrance-mobilites.fr/explore/dataset/projets_lignes_idf/) | Licence Ouverte |
| Adresses | [Base Adresse Nationale, service de géocodage Géoplateforme](https://adresse.data.gouv.fr/outils/api-doc/adresse) | Service public |
| Fond de carte | [OpenFreeMap](https://openfreemap.org/) / OpenStreetMap | ODbL |

Une maille « manque » mesure 350 m de côté. Son centre est à plus de 350 m à vol d'oiseau d'une fontaine disponible et/ou à plus de 600 m d'un équipement frais gratuit ou d'un espace vert avec au moins 25 % de végétation haute. Ces seuils sont des choix de visualisation, pas des normes sanitaires. La distance à vol d'oiseau ne représente pas un parcours accessible. Les données de lieux frais sont des points représentatifs, pas les entrées exactes.

Le calcul de l'ombre et du chemin est détaillé dans l'interface, sous **Sources et méthode**. Le code est sous licence MIT. Les données dérivées gardent les obligations de leurs licences sources.

Les sources ouvertes sont téléchargées lors de la préparation et les fichiers prêts à servir sont inclus dans `public/data/`. Leur date de génération figure dans les JSON concernés. Les données exclusives du hackathon ne sont pas utilisées.

## Accessibilité

Les formulaires ont des libellés, le trajet et les stations ont des résumés textuels, la liste des stations est utilisable au clavier, et les stations à examiner sont distinguées par un symbole d'alerte en plus de la couleur. L'animation de l'eau s'arrête quand la réduction des animations est demandée par le système. Les contrôles ont un focus visible. Cette version n'a pas encore fait l'objet d'un audit RGAA complet.

## Licence

Le code et la documentation originale sont sous [licence MIT](LICENSE). Les données intégrées conservent les obligations de leurs sources, notamment la Licence Ouverte et l'ODbL ; le contenu de `public/data/` ne devient pas MIT. Les producteurs sont crédités dans le tableau ci-dessus et dans l'interface.

L'interface s'inspire des principes de lisibilité, de hiérarchie et de focus du [Système de Design de l'État](https://www.systeme-de-design.gouv.fr/version-courante/fr/premiers-pas). Elle utilise la police libre Source Sans 3 et conserve une identité propre à Canopée.
