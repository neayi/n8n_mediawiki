import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IHttpRequestOptions,
	NodeOperationError,
} from 'n8n-workflow';
import { getLoginTokenAndCookies, login } from './helpers/authentication';

type HttpRequestFn = (options: IHttpRequestOptions) => Promise<any>;

// Helper functions
async function getPageContent(apiUrl: string, pageTitle: string, cookies: string, httpRequest: HttpRequestFn): Promise<string> {
	const response = await httpRequest({
		method: 'GET',
		url: apiUrl,
		qs: {
			action: 'query',
			titles: pageTitle,
			prop: 'revisions',
			rvprop: 'content',
			rvslots: 'main',
			format: 'json',
		},
		headers: {
			Cookie: cookies,
		},
	});

	const pages = response.query.pages;
	const pageId = Object.keys(pages)[0];

	if (pageId === '-1') {
		// Page doesn't exist
		throw new NodeOperationError(
			{
				name: 'MediaWikiGetTemplateData',
				type: 'n8n-nodes-mediawiki.mediaWikiGetTemplateData',
				typeVersion: 1,
			} as any,
			`Page "${pageTitle}" does not exist`,
		);
	}

	const page = pages[pageId];
	if (!page.revisions || !page.revisions[0]) {
		return '';
	}

	return page.revisions[0].slots.main['*'];
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseTemplateData(content: string, templateName: string): Record<string, string> | null {
	// Check if template exists using a regex
	// This regex matches {{templateName ... }} including multi-line templates
	const templateRegex = new RegExp(
		`\\{\\{\\s*${escapeRegex(templateName)}\\s*(?:\\|[\\s\\S]*?)?\\}\\}`,
		'i',
	);

	const match = content.match(templateRegex);

	if (!match) {
		return null;
	}

	const templateContent = match[0];
	const variables: Record<string, string> = {};

	// Remove the opening {{ and closing }} and template name
	// Match {{TemplateName|...}} and extract the content after the template name
	const contentMatch = templateContent.match(/\{\{\s*[^|}]+\s*\|?([\s\S]*?)\}\}/);
	if (!contentMatch || !contentMatch[1]) {
		return variables;
	}

	const paramsContent = contentMatch[1];

	// Split by | but we need to be careful with the content
	const parts = paramsContent.split('|');

	for (const part of parts) {
		const trimmedPart = part.trim();
		if (!trimmedPart) continue;

		// Find the first = to split name and value
		const eqIndex = trimmedPart.indexOf('=');
		if (eqIndex !== -1) {
			const name = trimmedPart.substring(0, eqIndex).trim();
			const value = trimmedPart.substring(eqIndex + 1).trim();
			if (name) {
				variables[name] = value;
			}
		}
	}

	return variables;
}

export class MediaWikiGetTemplateData implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MediaWiki Get Template Data',
		name: 'mediaWikiGetTemplateData',
		icon: 'file:mediawiki.svg',
		group: ['transform'],
		version: 1,
		subtitle: 'Get template data',
		description: 'Retrieve template data from a MediaWiki page',
		defaults: {
			name: 'MediaWiki Get Template Data',
		},
		inputs: ['main'],
		outputs: ['main'],
		codex: {
			categories: ['Development'],
			subcategories: {
				Development: ['MediaWiki'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://www.mediawiki.org/wiki/API:Query',
					},
				],
			},
		},
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
				displayName: 'Page Title',
				name: 'pageTitle',
				type: 'string',
				default: '',
				required: true,
				description: 'The title of the page containing the template',
				placeholder: 'Main Page',
			},
			{
				displayName: 'Template Name',
				name: 'templateName',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the template to extract data from',
				placeholder: 'Infobox',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Error If Not Found',
						name: 'errorIfNotFound',
						type: 'boolean',
						default: true,
						description: 'Whether to throw an error if the template is not found on the page',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const credentials = await this.getCredentials('mediaWikiApi');
				const pageTitle = this.getNodeParameter('pageTitle', i) as string;
				const templateName = this.getNodeParameter('templateName', i) as string;
				const wikiUrlOverride = this.getNodeParameter('wikiUrl', i, '') as string;
				const options = this.getNodeParameter('options', i, {}) as {
					errorIfNotFound?: boolean;
				};

				const errorIfNotFound = options.errorIfNotFound !== undefined ? options.errorIfNotFound : true;

				// Use override URL if provided, otherwise use credentials
				const baseUrl = wikiUrlOverride || (credentials.siteUrl as string);
				const apiUrl = baseUrl.endsWith('/api.php') ? baseUrl : `${baseUrl}/api.php`;

				// Get login token and initial cookies
				const httpRequest = this.helpers.httpRequest.bind(this);
				const { token: loginToken, cookies: initialCookies } = await getLoginTokenAndCookies(apiUrl, httpRequest);

				// Login to get session cookies
				const cookies = await login(
					apiUrl,
					credentials.botUsername as string,
					credentials.botPassword as string,
					loginToken,
					initialCookies,
					httpRequest,
					'MediaWikiGetTemplateData',
					'n8n-nodes-mediawiki.mediaWikiGetTemplateData',
				);

				// Get page content
				const content = await getPageContent(apiUrl, pageTitle, cookies, httpRequest);

				// Parse template data
				const templateData = parseTemplateData(content, templateName);

				if (templateData === null) {
					if (errorIfNotFound) {
						throw new NodeOperationError(
							this.getNode(),
							`Template "${templateName}" not found on page "${pageTitle}"`,
						);
					} else {
						returnData.push({
							json: {
								pageTitle,
								templateName,
								found: false,
								data: {},
							},
							pairedItem: i,
						});
						continue;
					}
				}

				returnData.push({
					json: {
						pageTitle,
						templateName,
						found: true,
						data: templateData,
					},
					pairedItem: i,
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
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
