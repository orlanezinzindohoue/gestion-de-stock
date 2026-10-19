# Nexora Stock

Mini-application de gestion de stock avec HTML, CSS, JavaScript, Python/Flask et SQLite.

## Fonctionnalités de cette première version

- Tableau de bord (valeur estimée du stock, références, unités, alertes).
- Création, modification et suppression prudente des produits.
- Recherche et filtre par catégorie.
- Entrées et sorties de stock avec historique.
- Refus des sorties supérieures à la quantité disponible.
- Base SQLite persistante (`stock.db`, créée au premier lancement).
- Protection CSRF des requêtes de modification et requêtes SQL paramétrées.

## Prérequis

- Python 3.10 ou plus récent
- Ubuntu/Linux, Windows ou macOS

## Installation sous Ubuntu

Dans un terminal, place-toi dans le dossier `nexora_stock`, puis exécute :

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python app.py
```

Ouvre ensuite `http://127.0.0.1:5000` dans ton navigateur.

Pour arrêter le serveur : `Ctrl + C` dans le terminal.

## Important

- La base `stock.db` est créée dans le dossier du projet au premier lancement.
- Ne supprime pas `stock.db` si tu veux conserver tes données.
- La clé secrète fournie par défaut est uniquement destinée au développement local. Avant tout déploiement, définis une variable d'environnement `FLASK_SECRET_KEY` avec une valeur longue et aléatoire.
- Cette version n'inclut pas encore de comptes utilisateurs, de sauvegardes automatisées ni de déploiement public. Ne l'expose pas directement sur Internet en l'état.
- Les prix sont stockés en nombres entiers de FCFA afin d'éviter les imprécisions liées aux nombres décimaux.
- Pour préserver la traçabilité, un produit ayant des mouvements ne peut pas être supprimé dans cette version.

## Structure

```text
nexora_stock/
├── app.py
├── requirements.txt
├── README.md
├── templates/
│   └── index.html
└── static/
    ├── style.css
    └── app.js
```
