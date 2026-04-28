# n8n-nodes-mediawiki

[![npm version](https://badge.fury.io/js/n8n-nodes-mediawiki.svg)](https://badge.fury.io/js/n8n-nodes-mediawiki)

This package contains n8n nodes for interacting with MediaWiki.

[n8n](https://n8n.io/) is a fair-code, extensible workflow automation tool. It allows you to connect anything to anything.

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Credentials](#credentials)
- [Available Nodes](#available-nodes)
  - [MediaWiki Add Page](#mediawiki-add-page)
  - [MediaWiki Create or Update Template](#mediawiki-create-or-update-template)
  - [MediaWiki Get Page Content](#mediawiki-get-page-content)
  - [MediaWiki Get Template Data](#mediawiki-get-template-data)
  - [MediaWiki Semantic Query](#mediawiki-semantic-query)
  - [MediaWiki Upload File](#mediawiki-upload-file)
- [License](#license)

## Installation

### Installation in n8n (Community Nodes)

1. Go to **Settings > Community Nodes**
2. Select **Install**
3. Enter `n8n-nodes-mediawiki` in the **npm Package Name** field
4. Accept the risks
5. Click **Install**

### Manual Installation

To install manually, navigate to the `.n8n` directory of your n8n installation and run:

```bash
npm install n8n-nodes-mediawiki
```

## Configuration

### Prerequisites

Before using these nodes, you need to create a bot on your MediaWiki instance:

1. Log in to your MediaWiki account
2. Go to **Special:BotPasswords**
3. Create a new bot password with the required permissions:
   - **High-volume editing** (to edit pages)
   - **Edit existing pages** (to modify existing pages)
   - **Create, edit, and move pages** (to create new pages)
4. Note down the bot name and the generated password

## Credentials

### MediaWiki API

To use the MediaWiki nodes, you need to create **MediaWiki API** credentials:

**Required parameters:**

- **MediaWiki Site URL**: The URL of your MediaWiki instance (without `/api.php`)
  - Example: `https://your-wiki.example.com`
- **Bot Username**: The bot's username (format: `Username@BotName`)
  - Example: `MyAccount@MyBot`
- **Bot Password**: The password generated in Special:BotPasswords
  - Example: `abcdefgh12345678ijklmnop90123456`

**Testing credentials:**

Credentials are automatically tested by calling the MediaWiki API to retrieve site information.

## Available Nodes

### MediaWiki Add Page

Creates a new page (or optionally overwrites an existing one) in MediaWiki.

- Creates a page with the specified title and content
- Supports multiple content models (wikitext, JSON, CSS, JavaScript, etc.)
- Skips or overwrites existing pages based on configuration

### MediaWiki Create or Update Template

Creates or updates a template in a MediaWiki page.

- Reads the content of a MediaWiki page
- Checks whether a template already exists on the page
- If the template exists: updates the template variables
- Possibility to choose what to do if the template does not exist: either fails or adds the template at the top or bottom of the page

### MediaWiki Get Page Content

Retrieves the content of a MediaWiki page.

- Returns raw wikitext, plain parsed text, or full rendered HTML
- Optionally includes page metadata (ID, content model, last modified date and author)

### MediaWiki Get Template Data

Reads the variables of a template from a MediaWiki page.

- Parses template variable names and values from the page source
- Optionally throws an error if the template is not found

### MediaWiki Semantic Query

Executes a [Semantic MediaWiki](https://www.semantic-mediawiki.org/) Ask query to retrieve semantic data.

- Runs SMW Ask queries with conditions, property fields, limit and sort order
- Returns each matching page as a separate output item with its semantic properties
- Requires the Semantic MediaWiki extension to be installed on the wiki

### MediaWiki Upload File

Uploads a file to MediaWiki from an n8n binary field.

- Uploads any binary file to the wiki file repository
- Supports custom filename, description page content, and upload comment
- Optionally ignores upload warnings (e.g. duplicate files)

## Contributing

Contributions are welcome! Feel free to open an issue or a pull request.

## Support

If you encounter issues or have questions:

1. Check that your MediaWiki credentials are correct
2. Make sure the bot has the required permissions
3. Consult the MediaWiki API documentation: https://www.mediawiki.org/wiki/API:Main_page

## License

Apache 2.0
