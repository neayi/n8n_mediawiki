# Guide de démarrage rapide

Ce guide vous aidera à commencer rapidement avec n8n-nodes-mediawiki.

## Prérequis

1. **n8n installé** : Assurez-vous d'avoir n8n installé et en cours d'exécution
2. **Une instance MediaWiki** : Vous avez besoin d'un accès à une instance MediaWiki
3. **Un compte bot** : Créez un bot sur votre MediaWiki (voir ci-dessous)

## Étape 1 : Créer un bot MediaWiki

1. Connectez-vous à votre instance MediaWiki
2. Naviguez vers `Special:BotPasswords` (ajoutez `/wiki/Special:BotPasswords` à l'URL de votre wiki)
3. Cliquez sur "Create a new bot password"
4. Donnez un nom à votre bot (par exemple: `n8nBot`)
5. Sélectionnez les permissions requises :
   - ✅ **High-volume editing**
   - ✅ **Edit existing pages**
   - ✅ **Create, edit, and move pages**
6. Cliquez sur "Create"
7. **IMPORTANT** : Copiez le mot de passe généré, il ne sera affiché qu'une seule fois !

Vous obtiendrez :
- **Bot username** : `VotreNom@n8nBot`
- **Bot password** : `abc123def456ghi789jkl012mno345pq`

## Étape 2 : Installer le package dans n8n

### Via l'interface n8n (Recommandé)

1. Ouvrez n8n
2. Allez dans **Settings** (roue dentée en haut à droite)
3. Cliquez sur **Community Nodes**
4. Cliquez sur **Install**
5. Entrez `n8n-nodes-mediawiki`
6. Acceptez les risques
7. Cliquez sur **Install**
8. Attendez la fin de l'installation

### Via npm (Installation manuelle)

```bash
cd ~/.n8n
npm install n8n-nodes-mediawiki
```

Redémarrez ensuite n8n.

## Étape 3 : Configurer les credentials

1. Dans n8n, créez un nouveau workflow
2. Ajoutez un node **MediaWiki Create or Update Template**
3. Cliquez sur **Credential to connect with**
4. Cliquez sur **Create New**
5. Remplissez les champs :
   - **MediaWiki Site URL** : `https://votre-wiki.example.com` (sans `/api.php`)
   - **Bot Username** : `VotreNom@n8nBot` (le nom complet du bot)
   - **Bot Password** : Le mot de passe généré à l'étape 1
6. Cliquez sur **Test Credentials** pour vérifier
7. Cliquez sur **Save**

## Étape 4 : Créer votre premier workflow

### Exemple simple : Ajouter un infobox à une page

1. Créez un nouveau workflow dans n8n
2. Ajoutez un node **Manual Trigger** (ou **Schedule Trigger** selon vos besoins)
3. Ajoutez un node **MediaWiki Create or Update Template**
4. Configurez le node :
   - **Page Title** : `Test Page`
   - **Template Name** : `Infobox`
   - **Position** : `Top of Page`
   - **Template Variables** : Cliquez sur **Add Variable**
     - Name: `title`, Value: `Mon titre`
     - Name: `author`, Value: `John Doe`
     - Name: `date`, Value: `2024-01-15`
5. Exécutez le workflow

Résultat sur la page "Test Page" :
```wiki
{{Infobox
|title=Mon titre
|author=John Doe
|date=2024-01-15
}}

[Contenu existant de la page...]
```

### Exemple avancé : Workflow automatisé avec Google Sheets

Ce workflow lit des données depuis Google Sheets et met à jour des pages MediaWiki.

**Structure du workflow :**

```
[Schedule Trigger] → [Google Sheets] → [MediaWiki Create or Update Template]
```

**Configuration :**

1. **Schedule Trigger** : Tous les jours à 9h00
2. **Google Sheets** :
   - Operation: Read rows
   - Spreadsheet: Votre feuille de calcul
   - Colonnes: `page_title`, `template_name`, `var_name`, `var_value`
3. **MediaWiki Create or Update Template** :
   - Page Title: `{{ $json.page_title }}`
   - Template Name: `{{ $json.template_name }}`
   - Variables: Mappées depuis les colonnes

## Étape 5 : Vérifier le résultat

1. Ouvrez votre page MediaWiki dans un navigateur
2. Vérifiez que le template a été ajouté ou mis à jour
3. Consultez l'historique de la page pour voir l'edit summary "Updated via n8n"

## Cas d'utilisation courants

### 1. Mettre à jour un statut de projet

```
Trigger: Webhook depuis Jira
→ MediaWiki: Met à jour le template {{Project Status}} sur la page du projet
```

### 2. Synchroniser des données

```
Trigger: Schedule (quotidien)
→ API externe: Récupère des données
→ MediaWiki: Met à jour les pages avec les nouvelles données
```

### 3. Documentation automatique

```
Trigger: GitHub webhook (nouveau release)
→ MediaWiki: Ajoute un template {{Release}} en haut de la page changelog
```

## Dépannage

### Le test des credentials échoue

- Vérifiez que l'URL du site est correcte (sans `/api.php`)
- Assurez-vous que le bot username inclut le format `Username@BotName`
- Vérifiez que le bot password est correct

### L'édition échoue avec "Permission denied"

- Vérifiez que votre bot a les bonnes permissions dans `Special:BotPasswords`
- Assurez-vous que la page n'est pas protégée

### Le template n'est pas détecté correctement

- Vérifiez que le nom du template est correct (sans `{{` ou `}}`)
- Le nom du template est sensible à la casse

### Erreur "Page not found"

- Vérifiez l'orthographe du titre de la page
- Les titres de pages sont sensibles à la casse
- Si la page n'existe pas, elle sera créée automatiquement

## Prochaines étapes

- Explorez les différentes options du node
- Créez des workflows plus complexes
- Consultez la documentation complète dans [README.md](README.md)
- Contribuez au projet sur GitHub !

## Support

Si vous avez des questions ou rencontrez des problèmes :
- Consultez la [documentation de l'API MediaWiki](https://www.mediawiki.org/wiki/API:Main_page)
- Ouvrez une issue sur GitHub
- Vérifiez les logs de n8n pour plus de détails sur les erreurs

Bon workflow ! 🚀
