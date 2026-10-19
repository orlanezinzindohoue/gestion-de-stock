Nexora Stock
Nexora Stock est une mini-application web de gestion de stock développée dans le cadre d'un projet d'apprentissage. Elle permet de gérer des produits, de suivre les quantités disponibles et de consulter les mouvements de stock.
Fonctionnalités
- Tableau de bord avec indicateurs sur le stock.
- Ajout, modification et suppression contrôlée des produits.
- Recherche de produits et filtrage par catégorie.
- Enregistrement des entrées et sorties de stock.
- Historique des mouvements de stock.
- Vérification des quantités disponibles avant une sortie.
- Alertes lorsque le stock est faible ou épuisé.
- Enregistrement des données dans une base SQLite.
- Protection CSRF des requêtes de modification et requêtes SQL paramétrées.
Technologies utilisées
- HTML — structure des pages
- CSS — mise en forme de l'interface
- JavaScript — interactions côté navigateur
- Python / Flask — serveur et logique de l'application
- SQLite — stockage des données
Prérequis
- Python 3.10 ou une version plus récente
- Un terminal
- Un navigateur web
Les commandes ci-dessous sont destinées à Ubuntu/Linux. L'installation peut être adaptée à Windows ou macOS.
Installation sous Ubuntu
1. Ouvrir un terminal dans le dossier du projet
Place-toi dans le dossier nexora_stock, là où se trouve app.py.
2. Créer un environnement virtuel
python3 -m venv .venv
3. Activer l'environnement virtuel
source .venv/bin/activate
4. Installer les dépendances
python -m pip install -r requirements.txt
5. Démarrer l'application
python app.py
6. Ouvrir l'application dans le navigateur
Rends-toi à l'adresse :

http://127.0.0.1:5000

Pour arrêter le serveur, retourne dans le terminal et appuie sur Ctrl + C.
Base de données
L'application utilise SQLite. Le fichier stock.db est créé au premier lancement, si nécessaire, et conserve les données enregistrées localement.

Important : ne supprime pas stock.db si tu souhaites conserver tes données. Ce fichier de base de données local n'est normalement pas publié sur GitHub.
Sécurité et limites
- Cette version est destinée au développement et à l'apprentissage ; elle n'est pas prête à être exposée directement sur Internet.
- Elle ne comporte pas encore de comptes utilisateurs ni de sauvegardes automatisées.
- La clé secrète par défaut est réservée au développement local. Avant tout déploiement, configure FLASK_SECRET_KEY avec une valeur longue, aléatoire et conservée secrète.
- Les prix sont stockés en nombres entiers de FCFA.
- Pour préserver la traçabilité, un produit ayant des mouvements ne peut pas être supprimé dans cette version.
Structure du projet
nexora_stock/
├── app.py
├── requirements.txt
├── README.md
├── .gitignore
├── templates/
│   └── index.html
└── static/
    ├── style.css
    └── app.js
État du projet
Première version fonctionnelle, qui pourra évoluer avec de nouvelles fonctionnalités et améliorations.
Projet réalisé à des fins d'apprentissage.
