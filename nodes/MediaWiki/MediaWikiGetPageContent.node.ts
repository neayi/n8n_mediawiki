import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import axios from 'axios';
import { getLoginTokenAndCookies, login } from './helpers/authentication';

type ContentType = 'rawWikiCode' | 'parsedPage' | 'html';

// Helper function to get page content and metadata
async function getPageInfo(
	apiUrl: string,
	pageTitle: string,
	cookies: string,
): Promise<{
	content: string;
	pageId: number;
	title: string;
	contentModel: string;
	lastModified: string;
	lastModifiedBy: string;
}> {
	const response = await axios.get(apiUrl, {
		params: {
			action: 'query',
			titles: pageTitle,
			prop: 'revisions|info',
			rvprop: 'content|timestamp|user|contentmodel',
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
		// Page doesn't exist
		throw new NodeOperationError(
			{
				name: 'MediaWikiGetPageContent',
				type: 'n8n-nodes-mediawiki.mediaWikiGetPageContent',
				typeVersion: 1,
			} as any,
			`Page "${pageTitle}" does not exist`,
		);
	}

	const page = pages[pageId];
	if (!page.revisions || !page.revisions[0]) {
		throw new NodeOperationError(
			{
				name: 'MediaWikiGetPageContent',
				type: 'n8n-nodes-mediawiki.mediaWikiGetPageContent',
				typeVersion: 1,
			} as any,
			`Unable to retrieve content for page "${pageTitle}"`,
		);
	}

	const revision = page.revisions[0];
	const content = revision.slots.main['*'];
	const contentModel = revision.contentmodel || 'wikitext';
	const lastModified = revision.timestamp;
	const lastModifiedBy = revision.user;

	return {
		content,
		pageId: parseInt(pageId),
		title: page.title,
		contentModel,
		lastModified,
		lastModifiedBy,
	};
}

async function getParsedPageContent(
	apiUrl: string,
	pageTitle: string,
	cookies: string,
): Promise<string> {
	const response = await axios.get(apiUrl, {
		params: {
			action: 'query',
			prop: 'extracts',
			redirects: true,
			explaintext: 1,
			format: 'json',
			titles: pageTitle,
		},
		headers: {
			Cookie: cookies,
		},
	});

	const pages = response.data.query.pages;
	const pageId = Object.keys(pages)[0];

	if (pageId === '-1') {
		throw new NodeOperationError(
			{
				name: 'MediaWikiGetPageContent',
				type: 'n8n-nodes-mediawiki.mediaWikiGetPageContent',
				typeVersion: 1,
			} as any,
			`Page "${pageTitle}" does not exist`,
		);
	}

	return pages[pageId].extract || '';
}

function getRenderUrl(baseUrl: string): string {
	const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

	if (normalizedBaseUrl.endsWith('/api.php')) {
		return `${normalizedBaseUrl.slice(0, -8)}/index.php`;
	}

	return `${normalizedBaseUrl}/index.php`;
}

async function getHtmlPageContent(
	baseUrl: string,
	pageTitle: string,
	cookies: string,
): Promise<string> {
	const response = await axios.get(getRenderUrl(baseUrl), {
		params: {
			title: pageTitle,
			action: 'render',
		},
		headers: {
			Cookie: cookies,
		},
		responseType: 'text',
	});

	return response.data;
}

export class MediaWikiGetPageContent implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MediaWiki Get Page Content',
		name: 'mediaWikiGetPageContent',
		icon: 'file:mediawiki.svg',
		group: ['transform'],
		version: 1,
		subtitle: 'Get page content',
		description: 'Retrieve the content of a MediaWiki page',
		defaults: {
			name: 'MediaWiki Get Page Content',
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
				description: 'The title of the page to retrieve',
				placeholder: 'Main Page',
			},
			{
				displayName: 'Content',
				name: 'contentType',
				type: 'options',
				default: 'rawWikiCode',
				options: [
					{
						name: 'Raw Wiki Code',
						value: 'rawWikiCode',
					},
					{
						name: 'Parsed Page',
						value: 'parsedPage',
					},
					{
						name: 'HTML',
						value: 'html',
					},
				],
				description: 'Choose which representation of the page content to retrieve',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Include Metadata',
						name: 'includeMetadata',
						type: 'boolean',
						default: true,
						description: 'Whether to include page metadata (page ID, content model, last modified date, etc.)',
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
				const contentType = this.getNodeParameter('contentType', i) as ContentType;
				const wikiUrlOverride = this.getNodeParameter('wikiUrl', i, '') as string;
				const options = this.getNodeParameter('options', i, {}) as {
					includeMetadata?: boolean;
				};

				const includeMetadata = options.includeMetadata !== undefined ? options.includeMetadata : true;

				// Use override URL if provided, otherwise use credentials
				const baseUrl = wikiUrlOverride || (credentials.siteUrl as string);
				const apiUrl = baseUrl.endsWith('/api.php') ? baseUrl : `${baseUrl}/api.php`;

				// Authentication
				const { token: loginToken, cookies: initialCookies } = await getLoginTokenAndCookies(apiUrl);
				const cookies = await login(
					apiUrl,
					credentials.botUsername as string,
					credentials.botPassword as string,
					loginToken,
					initialCookies,
					'MediaWiki Get Page Content',
					'n8n-nodes-mediawiki.mediaWikiGetPageContent',
				);

				// Get page metadata and use it directly for raw content
				const pageInfo = await getPageInfo(apiUrl, pageTitle, cookies);
				let content = pageInfo.content;

				if (contentType === 'parsedPage') {
					content = await getParsedPageContent(apiUrl, pageTitle, cookies);
				} else if (contentType === 'html') {
					content = await getHtmlPageContent(baseUrl, pageTitle, cookies);
				}

				// Build response
				const responseData: any = {
					content,
					contentType,
				};

				if (includeMetadata) {
					responseData.pageId = pageInfo.pageId;
					responseData.title = pageInfo.title;
					responseData.contentModel = pageInfo.contentModel;
					responseData.lastModified = pageInfo.lastModified;
					responseData.lastModifiedBy = pageInfo.lastModifiedBy;
				}

				returnData.push({
					json: responseData,
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
