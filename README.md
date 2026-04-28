# n8n-nodes-mediawiki

[![npm version](https://badge.fury.io/js/n8n-nodes-mediawiki.svg)](https://badge.fury.io/js/n8n-nodes-mediawiki)

Ce package contient des nodes n8n pour interagir avec MediaWiki.

[n8n](https://n8n.io/) est un outil d'automatisation de workflows extensible et équitable. Il vous permet de connecter n'importe quoi à n'importe quoi.

## Table des matières

- [Installation](#installation)
- [Configuration](#configuration)
- [Credentials](#credentials)
- [Nodes disponibles](#nodes-disponibles)
  - [MediaWiki Create or Update Template](#mediawiki-create-or-update-template)
- [Développement](#développement)
- [Licence](#licence)

## Installation

### Installation dans n8n (Community Nodes)

1. Allez dans **Settings > Community Nodes**
2. Sélectionnez **Install**
3. Entrez `n8n-nodes-mediawiki` dans le champ **npm Package Name**
4. Acceptez les risques
5. Cliquez sur **Install**

### Installation manuelle

Pour installer manuellement, naviguez vers le répertoire `.n8n` de votre installation n8n et exécutez :

```bash
npm install n8n-nodes-mediawiki
```

## Configuration

### Prérequis

Avant d'utiliser ces nodes, vous devez créer un bot sur votre instance MediaWiki :

1. Connectez-vous à votre compte MediaWiki
2. Allez à **Special:BotPasswords** (ou Spécial:Mots de passe de robot)
3. Créez un nouveau bot password avec les permissions nécessaires :
   - **High-volume editing** (pour éditer les pages)
   - **Edit existing pages** (pour modifier les pages existantes)
   - **Create, edit, and move pages** (pour créer de nouvelles pages)
4. Notez le nom du bot et le mot de passe généré

## Credentials

### MediaWiki API

Pour utiliser les nodes MediaWiki, vous devez créer des credentials **MediaWiki API** :

**Paramètres requis :**

- **MediaWiki Site URL** : L'URL de votre instance MediaWiki (sans `/api.php`)
  - Exemple : `https://votre-wiki.example.com`
- **Bot Username** : Le nom d'utilisateur du bot (format: `NomUtilisateur@NomBot`)
  - Exemple : `MonCompte@MonBot`
- **Bot Password** : Le mot de passe généré dans Special:BotPasswords
  - Exemple : `abcdefgh12345678ijklmnop90123456`

**Test des credentials :**

Les credentials sont automatiquement testées en appelant l'API MediaWiki pour récupérer les informations du site.

## Nodes disponibles

### MediaWiki Create or Update Template

Ce node permet de créer ou mettre à jour un template (modèle) dans une page MediaWiki.

#### Fonctionnalités

- Lit le contenu d'une page MediaWiki
- Vérifie si un template existe déjà sur la page
- Si le template existe : met à jour les variables du template
- Si le template n'existe pas : ajoute le template en haut ou en bas de la page

#### Paramètres

**Requis :**

- **Page Title** : Le titre de la page à éditer
  - Exemple : `Main Page` ou `Projet:Documentation`
- **Template Name** : Le nom du template (sans les accolades `{{}}`)
  - Exemple : `Infobox` ou `Citation`
- **Position** : Position du template si il doit être créé
  - `Top of Page` : Ajouter en haut de la page
  - `End of Page` : Ajouter en bas de la page

**Variables du template :**

Vous pouvez ajouter autant de variables que nécessaire. Chaque variable contient :
- **Name** : Le nom de la variable
- **Value** : La valeur de la variable

**Optionnel :**

- **Edit Summary** : Résumé de la modification (par défaut : "Updated via n8n")

#### Exemple d'utilisation

**Cas 1 : Ajouter un infobox à une page**

```
Page Title: Albert Einstein
Template Name: Infobox scientist
Position: Top of Page
Variables:
  - name: name
    value: Albert Einstein
  - name: birth_date
    value: 14 March 1879
  - name: birth_place
    value: Ulm, Germany
  - name: field
    value: Physics
```

Résultat sur la page :
```wiki
{{Infobox scientist
|name=Albert Einstein
|birth_date=14 March 1879
|birth_place=Ulm, Germany
|field=Physics
}}

[Contenu existant de la page...]
```

**Cas 2 : Mettre à jour un template existant**

Si le template `Infobox scientist` existe déjà sur la page, il sera remplacé par la nouvelle version avec les variables mises à jour.

#### Retour du node

Le node retourne un objet JSON avec :
```json
{
  "success": true,
  "pageTitle": "Albert Einstein",
  "templateName": "Infobox scientist",
  "result": {
    "result": "Success",
    "pageid": 12345,
    "title": "Albert Einstein",
    "contentmodel": "wikitext",
    "oldrevid": 67890,
    "newrevid": 67891,
    "newtimestamp": "2024-01-15T10:30:00Z"
  }
}
```

#### Notes importantes

- Le node détecte automatiquement si un template existe déjà en cherchant `{{NomTemplate` dans le contenu
- Lors de la mise à jour, le template existant est entièrement remplacé par la nouvelle version
- Si la page n'existe pas, elle sera créée avec le template
- Les variables sont ajoutées au format `|nom=valeur`

## Développement

### Installation des dépendances

```bash
npm install
```

### Build

```bash
npm run build
```

### Développement avec watch mode

```bash
npm run dev
```

### Linting

```bash
npm run lint
```

### Format du code

```bash
npm run format
```

## Structure du projet

```
n8n-nodes-mediawiki/
├── credentials/
│   └── MediaWikiApi.credentials.ts
├── nodes/
│   └── MediaWiki/
│       ├── MediaWikiCreateOrUpdateTemplate.node.ts
│       └── mediawiki.svg
├── package.json
├── tsconfig.json
└── README.md
```

## Roadmap

Nodes futurs prévus :

- [ ] MediaWiki Get Page Content
- [ ] MediaWiki Search Pages
- [ ] MediaWiki Upload File
- [ ] MediaWiki Delete Page
- [ ] MediaWiki Get Categories
- [ ] MediaWiki Add Category

## Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

## Support

Si vous rencontrez des problèmes ou avez des questions :

1. Vérifiez que vos credentials MediaWiki sont correctes
2. Assurez-vous que le bot a les permissions nécessaires
3. Consultez la documentation de l'API MediaWiki : https://www.mediawiki.org/wiki/API:Main_page

## Licence

MIT

## Crédits

Développé pour faciliter l'intégration de MediaWiki dans les workflows n8n.
A set of nodes to interact with mediawiki in read/write mode
