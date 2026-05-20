import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import { getLoginTokenAndCookies, login, getCsrfToken } from './helpers/authentication';

export class MediaWikiApiAction implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MediaWiki API Action',
		name: 'mediaWikiApiAction',
		icon: 'file:mediawiki.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["action"]}}',
		description: 'Execute any authenticated MediaWiki API action. The CSRF token is added automatically.',
		defaults: {
			name: 'MediaWiki API Action',
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
						url: 'https://www.mediawiki.org/wiki/API:Main_page',
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
				displayName: 'Action',
				name: 'action',
				type: 'string',
				default: '',
				required: true,
				description: 'The MediaWiki API action to execute (e.g. delete, move, protect, rollback…)',
				placeholder: 'delete',
			},
			{
				displayName: 'Additional Parameters',
				name: 'parameters',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description: 'Additional parameters to include in the API call (e.g. title, reason…)',
				options: [
					{
						name: 'parameter',
						displayName: 'Parameter',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								description: 'Parameter name',
								placeholder: 'title',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Parameter value',
								placeholder: 'Sandbox',
							},
						],
					},
				],
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
				const wikiUrlParam = this.getNodeParameter('wikiUrl', i) as string;
				const siteUrl = wikiUrlParam || (credentials.siteUrl as string);
				const apiUrl = `${siteUrl.replace(/\/$/, '')}/api.php`;

				const action = this.getNodeParameter('action', i) as string;
				const parametersCollection = this.getNodeParameter('parameters', i) as {
					parameter?: Array<{ name: string; value: string }>;
				};

				const httpRequest = this.helpers.httpRequest.bind(this);

				// Step 1: Get login token and initial cookies
				const { token: loginToken, cookies: initialCookies } = await getLoginTokenAndCookies(apiUrl, httpRequest);

				// Step 2: Login and get session cookies
				const cookies = await login(
					apiUrl,
					botUsername,
					botPassword,
					loginToken,
					initialCookies,
					httpRequest,
					'MediaWikiApiAction',
					'n8n-nodes-mediawiki.mediaWikiApiAction',
				);

				// Step 3: Get CSRF token
				const csrfToken = await getCsrfToken(apiUrl, cookies, httpRequest);

				// Step 4: Build the POST body
				const formBody: Record<string, string> = {
					action,
					token: csrfToken,
					format: 'json',
				};

				const extraParams = parametersCollection.parameter ?? [];
				for (const param of extraParams) {
					if (param.name) {
						formBody[param.name] = param.value;
					}
				}

				// Step 5: Execute the API call
				const response = await httpRequest({
					method: 'POST',
					url: apiUrl,
					body: new URLSearchParams(formBody),
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						Cookie: cookies,
					},
					timeout: 600000,
				});

				if (response.error) {
					throw new NodeOperationError(
						this.getNode(),
						`API action "${action}" failed: ${response.error.info || response.error.code || 'Unknown error'}`,
						{ itemIndex: i },
					);
				}

				returnData.push({
					json: {
						success: true,
						action,
						response,
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
