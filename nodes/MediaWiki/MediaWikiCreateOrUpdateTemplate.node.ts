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
async function getPageContent(apiUrl: string, pageTitle: string, cookies: string): Promise<string> {
	const response = await axios.get(apiUrl, {
		params: {
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

	const pages = response.data.query.pages;
	const pageId = Object.keys(pages)[0];

	if (pageId === '-1') {
		// Page doesn't exist, return empty content
		return '';
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

function parseTemplateVariables(templateContent: string): Map<string, string> {
	const variables = new Map<string, string>();
	
	// Remove the opening {{ and closing }} and template name
	// Match {{TemplateName|...}} and extract the content after the template name
	const contentMatch = templateContent.match(/\{\{\s*[^|}]+\s*\|?([\s\S]*?)\}\}/);
	if (!contentMatch || !contentMatch[1]) {
		return variables;
	}
	
	const paramsContent = contentMatch[1];
	
	// Split by | but we need to be careful with the content
	// A simple approach: split by | and process each part
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
				variables.set(name, value);
			}
		}
	}
	
	return variables;
}

function updateTemplateInContent(
	content: string,
	templateName: string,
	variables: Array<{ name: string; value: string }>,
	position: string,
	templateNotExistAction: string = 'create',
): string | null {
	// Check if template already exists using a regex
	// This regex matches {{templateName ... }} including multi-line templates
	// We need to match everything between {{ and }} carefully
	const templateRegex = new RegExp(
		`\\{\\{\\s*${escapeRegex(templateName)}\\s*(?:\\|[\\s\\S]*?)?\\}\\}`,
		'i',
	);

	const match = content.match(templateRegex);

	let mergedVariables: Map<string, string>;
	
	if (match) {
		// Template exists - parse existing variables and merge with new ones
		const existingTemplateContent = match[0];
		mergedVariables = parseTemplateVariables(existingTemplateContent);
		
		// Update/add new variables (new values override existing ones)
		variables.forEach((v) => {
			mergedVariables.set(v.name, v.value);
		});
	} else {
		// Template doesn't exist
		if (templateNotExistAction === 'fail') {
			// Return null to indicate template not found and action is set to fail
			return null;
		}
		// Use only new variables if action is 'create'
		mergedVariables = new Map(variables.map((v) => [v.name, v.value]));
	}

	// Build the template string with all variables
	const templateVars = Array.from(mergedVariables.entries())
		.map(([name, value]) => `|${name}=${value}`)
		.join('\n');
	const newTemplate = `{{${templateName}\n${templateVars}\n}}`;

	if (match) {
		// Template exists, replace it
		return content.replace(templateRegex, newTemplate);
	} else {
		// Template doesn't exist, add it
		if (position === 'top') {
			return newTemplate + '\n\n' + content;
		} else {
			return content + '\n\n' + newTemplate;
		}
	}
}

async function editPage(
	apiUrl: string,
	pageTitle: string,
	content: string,
	summary: string,
	csrfToken: string,
	cookies: string,
): Promise<any> {
	const params = new URLSearchParams();
	params.append('action', 'edit');
	params.append('title', pageTitle);
	params.append('text', content);
	params.append('summary', summary);
	params.append('token', csrfToken);
	params.append('format', 'json');

	const response = await axios.post(apiUrl, params, {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Cookie: cookies,
		},
	});

	if (response.data.error) {
		throw new NodeOperationError(
			{
				name: 'MediaWikiCreateOrUpdateTemplate',
				type: 'n8n-nodes-mediawiki.mediaWikiCreateOrUpdateTemplate',
				typeVersion: 1,
			} as any,
			`Edit failed: ${response.data.error.info || 'Unknown error'}`,
		);
	}

	return response.data.edit;
}

export class MediaWikiCreateOrUpdateTemplate implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MediaWiki Create or Update Template',
		name: 'mediaWikiCreateOrUpdateTemplate',
		icon: 'file:mediawiki.svg',
		group: ['transform'],
		version: 1,
		subtitle: 'Manage page templates',
		description: 'Create or update a template in a MediaWiki page',
		defaults: {
			name: 'MediaWiki Create/Update Template',
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
						url: 'https://www.mediawiki.org/wiki/API:Edit',
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

                description: 'The title of the page to edit',
				placeholder: 'Main Page',
			},
			{
				displayName: 'Template Name',
				name: 'templateName',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the template (without curly braces)',
				placeholder: 'Infobox',
			},
			{
				displayName: 'If template does not exist in page',
				name: 'templateNotExistAction',
				type: 'options',
				options: [
					{
						name: 'Create it',
						value: 'create',
					},
					{
						name: 'Fail',
						value: 'fail',
					},
				],
				default: 'create',
				description: 'What to do if the template is not found on the page',
			},
			{
				displayName: 'Position',
				name: 'position',
				type: 'options',
				options: [
					{
						name: 'Top of Page',
						value: 'top',
					},
					{
						name: 'End of Page',
						value: 'bottom',
					},
				],
				default: 'top',
				description: 'Where to place the template if it doesn\'t exist',
			},
			{
				displayName: 'Template Variables',
				name: 'templateVariables',
				placeholder: 'Add Variable',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description: 'Variables to add to the template',
				options: [
					{
						name: 'variable',
						displayName: 'Variable',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								description: 'The name of the variable',
								placeholder: 'author',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'The value of the variable',
								placeholder: 'John Doe',
							},
						],
					},
				],
			},
			{
				displayName: 'Edit Summary',
				name: 'editSummary',
				type: 'string',
				default: 'Updated via n8n',
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
				const templateName = this.getNodeParameter('templateName', i) as string;
				const position = this.getNodeParameter('position', i) as string;
				const templateNotExistAction = this.getNodeParameter('templateNotExistAction', i) as string;
				const editSummary = this.getNodeParameter('editSummary', i) as string;
				const templateVariablesData = this.getNodeParameter('templateVariables', i) as {
					variable?: Array<{ name: string; value: string }>;
				};

				const templateVariables = templateVariablesData.variable || [];

				// Step 1: Get login token and initial cookies
				const { token: loginToken, cookies: initialCookies } = await getLoginTokenAndCookies(apiUrl);

				// Step 2: Login and get session cookies
				const cookies = await login(apiUrl, botUsername, botPassword, loginToken, initialCookies, 'MediaWikiCreateOrUpdateTemplate', 'n8n-nodes-mediawiki.mediaWikiCreateOrUpdateTemplate');

				// Step 3: Get CSRF token
				const csrfToken = await getCsrfToken(apiUrl, cookies);

				// Step 4: Get current page content
				const pageContent = await getPageContent(apiUrl, pageTitle, cookies);

				// Step 5: Parse and update content
				const updatedContent = updateTemplateInContent(
					pageContent,
					templateName,
					templateVariables,
					position,
					templateNotExistAction,
				);

				// Check if template was not found and action is set to fail
				if (updatedContent === null) {
					throw new NodeOperationError(
						{
							name: 'MediaWikiCreateOrUpdateTemplate',
							type: 'n8n-nodes-mediawiki.mediaWikiCreateOrUpdateTemplate',
							typeVersion: 1,
						} as any,
						`Template "${templateName}" not found in page "${pageTitle}"`,
					);
				}

				// Step 6: Save the page
				const editResult = await editPage(
					apiUrl,
					pageTitle,
					updatedContent,
					editSummary,
					csrfToken,
					cookies,
				);

				returnData.push({
					json: {
						success: true,
						pageTitle,
						templateName,
						result: editResult,
					},
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error instanceof Error ? error.message : String(error),
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
