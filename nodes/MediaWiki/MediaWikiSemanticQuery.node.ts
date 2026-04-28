import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { getLoginTokenAndCookies, login } from './helpers/authentication';

type HttpRequestFn = (options: IHttpRequestOptions) => Promise<any>;

// Helper function to clean SMW metadata from values
function cleanSMWValue(value: any): any {
	if (typeof value === 'string') {
		// Remove SMW metadata suffixes like "#0##", "#102##", etc.
		return value.replace(/#\d+##$/, '');
	}
	if (typeof value === 'object' && value !== null) {
		// If it's an object with 'item' property, clean that
		if (value.item) {
			return cleanSMWValue(value.item);
		}
		// If it's an object with 'fulltext' property (from Ask API)
		if (value.fulltext) {
			return cleanSMWValue(value.fulltext);
		}
	}
	return value;
}

// Helper function to process semantic property values
function processSemanticValue(value: any): any {
	if (!value) return null;
	
	// Handle array of values
	if (Array.isArray(value)) {
		if (value.length === 0) return null;
		if (value.length === 1) return processSemanticValue(value[0]);
		return value.map(v => processSemanticValue(v));
	}
	
	// Handle object values (dates, pages, numbers, etc.)
	if (typeof value === 'object') {
		// Date/Time value
		if (value.timestamp) {
			// Convert timestamp (in seconds) to ISO 8601 format
			const date = new Date(parseInt(value.timestamp) * 1000);
			return {
				timestamp: value.timestamp,
				formatted: date.toISOString(),
			};
		}
		
		// Page/WikiPage value
		if (value.fulltext) {
			return cleanSMWValue(value.fulltext);
		}
		
		// Quantity/Number value
		if (value.value !== undefined) {
			return value.value;
		}
		
		// Geographic coordinates
		if (value.lat !== undefined && value.lon !== undefined) {
			return {
				lat: value.lat,
				lon: value.lon,
			};
		}
		
		// URL value
		if (value.item) {
			return cleanSMWValue(value.item);
		}
		
		// Default: return the object as-is (cleaned)
		return value;
	}
	
	// Handle primitive values (strings, numbers, booleans)
	return cleanSMWValue(value);
}

// Helper function to execute SMW Ask API query
async function executeAskQuery(
	apiUrl: string,
	query: string,
	fields: string[],
	limit: number,
	sortOrder: string,
	cookies: string,
	httpRequest: HttpRequestFn,
): Promise<any[]> {
	// Build the complete Ask query
	let fullQuery = query;
	
	// Add fields (printout statements)
	if (fields && fields.length > 0) {
		for (const field of fields) {
			fullQuery += `|?${field}`;
		}
	}
	
	// Add limit
	fullQuery += `|limit=${limit}`;
	
	// Add sort order if specified
	if (sortOrder) {
		fullQuery += `|${sortOrder}`;
	}

	const response = await httpRequest({
		method: 'GET',
		url: apiUrl,
		qs: {
			action: 'ask',
			uselang: 'en',
			api_version: '3',
			query: fullQuery,
			format: 'json',
		},
		headers: {
			Cookie: cookies,
		},
	});

	if (response.error) {
		throw new Error(`Ask API error: ${response.error.info || 'Unknown error'}`);
	}

	const results: any[] = [];

	// Parse Ask API response (v3 format)
	// Results is an array of objects, each with page name as key
	if (response.query && response.query.results) {
		const resultsArray = response.query.results;
		
		// Iterate through the array
		for (const resultItem of resultsArray) {
			// Each item is an object with page name as the only key
			for (const [pageTitle, pageData] of Object.entries(resultItem)) {
				const semanticData: Record<string, any> = {};
				
				// Extract semantic properties from printouts
				if ((pageData as any).printouts) {
					const printouts = (pageData as any).printouts;
					
					for (const [propName, values] of Object.entries(printouts)) {
						semanticData[propName] = processSemanticValue(values);
					}
				}
				
				// Build result item with structured data
				const item: Record<string, any> = {
					pageTitle: pageTitle,
					fullUrl: (pageData as any).fullurl || '',
					semanticData: semanticData,
				};
				
				results.push(item);
			}
		}
	}

	return results;
}

export class MediaWikiSemanticQuery implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Mediawiki Semantic Query',
		name: 'mediaWikiSemanticQuery',
		icon: 'file:mediawiki.svg',
		group: ['transform'],
		version: 1,
		subtitle: 'Execute SMW Ask query',
		description: 'Execute a Semantic MediaWiki Ask query to retrieve semantic data',
		defaults: {
			name: 'Mediawiki Semantic Query',
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
						url: 'https://www.semantic-mediawiki.org/wiki/Help:API:ask',
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
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				required: true,
				noDataExpression: true,
				typeOptions: {
					rows: 3,
				},
				description: 'The SMW Ask query (e.g., [[Category:Person]] or [[A une URL de vidéo::+]])',
				placeholder: '[[Category:Person]][[Has job::Developer]]',
			},
			{
				displayName: 'Fields',
				name: 'fields',
				type: 'string',
				default: '',
				noDataExpression: true,
				description: 'Comma-separated list of semantic properties to retrieve',
				placeholder: 'Has author, Has date, Has category',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				description: 'Maximum number of results to return',
				typeOptions: {
					minValue: 1,
					maxValue: 5000,
				},
			},
			{
				displayName: 'Sort Order',
				name: 'sortOrder',
				type: 'string',
				default: '',
				noDataExpression: true,
				description: 'Sort order for results (e.g., "sort=Has date" or "order=descending|sort=Has date")',
				placeholder: 'sort=Has date',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const credentials = await this.getCredentials('mediaWikiApi');
				const query = this.getNodeParameter('query', i) as string;
				const fieldsStr = this.getNodeParameter('fields', i, '') as string;
				const limit = this.getNodeParameter('limit', i, 50) as number;
				const sortOrder = this.getNodeParameter('sortOrder', i, '') as string;
				const wikiUrlOverride = this.getNodeParameter('wikiUrl', i, '') as string;

				// Parse fields
				const fields = fieldsStr
					? fieldsStr.split(',').map(f => f.trim()).filter(f => f)
					: [];

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
					'MediaWikiSemanticQuery',
					'n8n-nodes-mediawiki.mediaWikiSemanticQuery',
				);

				// Execute the Ask query
				const results = await executeAskQuery(apiUrl, query, fields, limit, sortOrder, cookies, httpRequest);

				// Return results - each result as a separate item
				for (const result of results) {
					returnData.push({
						json: result,
						pairedItem: i,
					});
				}

				// If no results, return an empty item
				if (results.length === 0) {
					returnData.push({
						json: {
							query,
							resultCount: 0,
							results: [],
						},
						pairedItem: i,
					});
				}

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
