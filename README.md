# Canopée

Ombre des rues de Paris le jeudi 25 juin 2026, de 7 h à 21 h. La couleur d’un axe est la part d’ombre des immeubles, de 0 à 100 %, par ciel dégagé. Ce n’est pas une température : ce jour-là, il a fait 41 °C à la station Luxembourg.

Les hauteurs viennent de la BD TOPO (IGN). Une empreinte sans hauteur ne projette rien. Il n’y a pas d’arbres : les parcs restent au soleil. Le bouton Hiver reprend les mêmes rues avec le soleil du 21 décembre 2026.

## Lancer

```bash
npm install
npm run prepare-data
npm run dev
```

Le serveur écoute sur `0.0.0.0:5173`. `prepare-data` télécharge les bâtiments et les axes du département 75, puis calcule l’ombre. Cela prend plusieurs minutes.

## Licence

Le code est sous licence MIT. Les données restent sous leur licence d’origine : IGN (Licence Ouverte), Météo-France (Licence Ouverte), fond OpenFreeMap / OpenStreetMap (ODbL).
