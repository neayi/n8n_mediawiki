import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import axios from 'axios';
import { getLoginTokenAndCookies, login, getCsrfToken } from './helpers/authentication';

// Helper functions
async function checkPageExists(apiUrl: string, pageTitle: string, cookies: string): Promise<boolean> {
	const response = await axios.get(apiUrl, {
		params: {
			action: 'query',
			titles: pageTitle,
			format: 'json',
		},
		headers: {
			Cookie: cookies,
		},
	});

	const pages = response.data.query.pages;
	const pageId = Object.keys(pages)[0];
	
	// Page doesn't exist if pageId is negative
	return pageId !== '-1';
}

async function createOrUpdatePage(
	apiUrl: string,
	pageTitle: string,
	content: string,
	summary: string,
	csrfToken: string,
	cookies: string,
	createonly: boolean = false,
	contentModel?: string,
): Promise<any> {
	const params = new URLSearchParams();
	params.append('action', 'edit');
	params.append('title', pageTitle);
	params.append('text', content);
	params.append('summary', summary);
	params.append('token', csrfToken);
	params.append('format', 'json');
	
	if (createonly) {
		params.append('createonly', '1');
	}
	
	if (contentModel) {
		params.append('contentmodel', contentModel);
	}

	const response = await axios.post(apiUrl, params, {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Cookie: cookies,
		},
	});

	if (response.data.error) {
		throw new NodeOperationError(
			{
				name: 'MediaWikiAddPage',
				type: 'n8n-nodes-mediawiki.mediaWikiAddPage',
				typeVersion: 1,
			} as any,
			`Edit failed: ${response.data.error.info || 'Unknown error'}`,
		);
	}

	return response.data.edit;
}

export class MediaWikiAddPage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MediaWiki Add Page',
		name: 'mediaWikiAddPage',
		icon: 'file:mediawiki.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Create a new page in MediaWiki',
		defaults: {
			name: 'MediaWiki Add Page',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'mediaWikiApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Wiki URL',
				name: 'wikiUrl',
				type: 'string',
				default: '',
				description: 'Optional: Override the wiki URL from credentials. Use this to target a different wiki with the same credentials.',
				placeholder: 'https://wiki.example.com',
			},
			{
				displayName: 'Title',
				name: 'pageTitle',
				type: 'string',
				default: '',
				required: true,
				description: 'The title of the page to create',
				placeholder: 'My New Page',
			},
			{
				displayName: 'Page Content',
				name: 'pageContent',
				type: 'string',
				typeOptions: {
					rows: 10,
				},
				default: '',
				required: true,
				description: 'The wikitext content of the page',
				placeholder: '== Introduction ==\n\nYour content here...',
			},
			{
				displayName: 'Content Model',
				name: 'contentModel',
				type: 'options',
				options: [
					{
						name: 'Wikitext',
						value: 'wikitext',
						description: 'Standard wiki markup',
					},
					{
						name: 'CSS',
						value: 'css',
						description: 'Cascading Style Sheets',
					},
					{
						name: 'GeoJson',
						value: 'GeoJson',
						description: 'Geographic JSON data',
					},
					{
						name: 'JavaScript',
						value: 'javascript',
						description: 'JavaScript code',
					},
					{
						name: 'JSON',
						value: 'json',
						description: 'JSON data',
					},
					{
						name: 'Text',
						value: 'text',
						description: 'Plain text',
					},
				],
				default: 'wikitext',
				description: 'The content model of the page',
			},
			{
				displayName: 'If Page Exists',
				name: 'ifExists',
				type: 'options',
				options: [
					{
						name: 'Ignore',
						value: 'ignore',
						description: 'Skip creation if page already exists',
					},
					{
						name: 'Overwrite',
						value: 'overwrite',
						description: 'Replace the existing page content',
					},
				],
				default: 'ignore',
				description: 'What to do if the page already exists',
			},
			{
				displayName: 'Edit Summary',
				name: 'editSummary',
				type: 'string',
				default: 'Page created via n8n',
				description: 'Summary of the edit',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('mediaWikiApi');
		const botUsername = credentials.botUsername as string;
		const botPassword = credentials.botPassword as string;

		for (let i = 0; i < items.length; i++) {
			try {
				// Get wiki URL from node parameter or credentials
				const wikiUrlParam = this.getNodeParameter('wikiUrl', i) as string;
				const siteUrl = wikiUrlParam || (credentials.siteUrl as string);
				const apiUrl = `${siteUrl.replace(/\/$/, '')}/api.php`;

				const pageTitle = this.getNodeParameter('pageTitle', i) as string;
				const pageContent = this.getNodeParameter('pageContent', i) as string;
				const contentModel = this.getNodeParameter('contentModel', i) as string;
				const ifExists = this.getNodeParameter('ifExists', i) as string;
				const editSummary = this.getNodeParameter('editSummary', i) as string;

				// Step 1: Get login token and initial cookies
				const { token: loginToken, cookies: initialCookies } = await getLoginTokenAndCookies(apiUrl);

				// Step 2: Login and get session cookies
				const cookies = await login(apiUrl, botUsername, botPassword, loginToken, initialCookies, 'MediaWikiAddPage', 'n8n-nodes-mediawiki.mediaWikiAddPage');

				// Step 3: Get CSRF token
				const csrfToken = await getCsrfToken(apiUrl, cookies);

				// Step 4: Check if page exists
				const pageExists = await checkPageExists(apiUrl, pageTitle, cookies);

				let result;
				let action = 'created';

				if (pageExists) {
					if (ifExists === 'ignore') {
						// Page exists and we should ignore - skip creation
						returnData.push({
							json: {
								success: true,
								pageTitle: pageTitle,
								action: 'skipped',
								message: 'Page already exists',
								pageExists: true,
							},
							pairedItem: i,
						});
						continue;
					} else {
						// Overwrite the page
						action = 'overwritten';
					}
				}

				// Step 5: Create or update the page
				result = await createOrUpdatePage(
					apiUrl,
					pageTitle,
					pageContent,
					editSummary,
					csrfToken,
					cookies,
					false, // Don't use createonly since we might overwrite
					contentModel,
				);

				returnData.push({
					json: {
						success: true,
						pageTitle: pageTitle,
						action: action,
						result: result,
						pageExists: pageExists,
					},
					pairedItem: i,
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							success: false,
							error: error instanceof Error ? error.message : String(error),
						},
						pairedItem: i,
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
