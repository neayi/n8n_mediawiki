import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class MediaWikiApi implements ICredentialType {
	name = 'mediaWikiApi';
	displayName = 'MediaWiki API';
	documentationUrl = 'https://www.mediawiki.org/wiki/API:Main_page';
	properties: INodeProperties[] = [
		{
			displayName: 'MediaWiki Site URL',
			name: 'siteUrl',
			type: 'string',
			default: '',
			placeholder: 'https://your-wiki.example.com',
			description: 'The URL of your MediaWiki instance (without /api.php)',
			required: true,
		},
		{
			displayName: 'Bot Username',
			name: 'botUsername',
			type: 'string',
			default: '',
			placeholder: 'BotName@BotPassword',
			description: 'The bot username (format: BotName@BotPassword)',
			required: true,
		},
		{
			displayName: 'Bot Password',
			name: 'botPassword',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'The bot password generated in Special:BotPasswords',
			required: true,
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			auth: {
				username: '={{$credentials.botUsername}}',
				password: '={{$credentials.botPassword}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.siteUrl}}',
			url: '/api.php',
			method: 'GET',
			qs: {
				action: 'query',
				meta: 'siteinfo',
				format: 'json',
			},
		},
	};
}
