import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IHttpRequestOptions,
	NodeOperationError,
} from 'n8n-workflow';
import { getLoginTokenAndCookies, login, getCsrfToken } from './helpers/authentication';

type HttpRequestFn = (options: IHttpRequestOptions) => Promise<any>;

// Helper function
async function uploadFile(
	apiUrl: string,
	filename: string,
	fileBuffer: Buffer,
	comment: string,
	text: string,
	csrfToken: string,
	cookies: string,
	httpRequest: HttpRequestFn,
	ignoreWarnings: boolean = false,
): Promise<any> {
	const formData = new FormData();
	formData.append('action', 'upload');
	formData.append('filename', filename);
	formData.append('file', new Blob([fileBuffer as unknown as ArrayBuffer], { type: 'application/octet-stream' }), filename);
	formData.append('comment', comment);
	formData.append('text', text);
	formData.append('token', csrfToken);
	formData.append('format', 'json');
	
	if (ignoreWarnings) {
		formData.append('ignorewarnings', '1');
	}

	const response = await httpRequest({
		method: 'POST',
		url: apiUrl,
		body: formData,
		headers: {
			Cookie: cookies,
		},
	});

	if (response.error) {
		throw new NodeOperationError(
			{
				name: 'MediaWikiUploadFile',
				type: 'n8n-nodes-mediawiki.mediaWikiUploadFile',
				typeVersion: 1,
			} as any,
			`Upload failed: ${response.error.info || 'Unknown error'}`,
		);
	}

	if (response.upload && response.upload.warnings && !ignoreWarnings) {
		const warnings = Object.entries(response.upload.warnings)
			.map(([key, value]) => `${key}: ${value}`)
			.join(', ');
		throw new NodeOperationError(
			{
				name: 'MediaWikiUploadFile',
				type: 'n8n-nodes-mediawiki.mediaWikiUploadFile',
				typeVersion: 1,
			} as any,
			`Upload warnings: ${warnings}. Enable "Ignore Warnings" to bypass.`,
		);
	}

	return response.upload;
}

export class MediaWikiUploadFile implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MediaWiki Upload File',
		name: 'mediaWikiUploadFile',
		icon: 'file:mediawiki.svg',
		group: ['transform'],
		version: 1,
		subtitle: 'Upload a file',
		description: 'Upload a file to MediaWiki',
		defaults: {
			name: 'MediaWiki Upload File',
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
						url: 'https://www.mediawiki.org/wiki/API:Upload',
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
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				description: 'Name of the binary property containing the file to upload',
				placeholder: 'data',
			},
			{
				displayName: 'Filename',
				name: 'filename',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the file on the wiki (e.g., "Example.png")',
				placeholder: 'Example.png',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				description: 'Text to set on the file description page (wikitext)',
				placeholder: '== Summary ==\nFile uploaded via n8n',
			},
			{
				displayName: 'Upload Comment',
				name: 'comment',
				type: 'string',
				default: 'File uploaded via n8n',
				description: 'Upload comment (appears in upload log)',
			},
			{
				displayName: 'Ignore Warnings',
				name: 'ignoreWarnings',
				type: 'boolean',
				default: false,
				description: 'Whether to ignore warnings (e.g., file already exists, duplicate file)',
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

				const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
				const filename = this.getNodeParameter('filename', i) as string;
				const description = this.getNodeParameter('description', i) as string;
				const comment = this.getNodeParameter('comment', i) as string;
				const ignoreWarnings = this.getNodeParameter('ignoreWarnings', i) as boolean;

				// Get binary data
				const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
				const fileBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

				// Step 1: Get login token and initial cookies
				const httpRequest = this.helpers.httpRequest.bind(this);
				const { token: loginToken, cookies: initialCookies } = await getLoginTokenAndCookies(apiUrl, httpRequest);

				// Step 2: Login and get session cookies
				const cookies = await login(apiUrl, botUsername, botPassword, loginToken, initialCookies, httpRequest, 'MediaWikiUploadFile', 'n8n-nodes-mediawiki.mediaWikiUploadFile');

				// Step 3: Get CSRF token
				const csrfToken = await getCsrfToken(apiUrl, cookies, httpRequest);

				// Step 4: Upload the file
				const result = await uploadFile(
					apiUrl,
					filename,
					fileBuffer,
					comment,
					description,
					csrfToken,
					cookies,
					httpRequest,
					ignoreWarnings,
				);

				returnData.push({
					json: {
						success: true,
						filename: filename,
						result: result,
						filesize: binaryData.fileSize,
						mimeType: binaryData.mimeType,
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
