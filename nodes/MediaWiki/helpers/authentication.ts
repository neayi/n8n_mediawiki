import { NodeOperationError, IHttpRequestOptions } from 'n8n-workflow';

type HttpRequestFn = (options: IHttpRequestOptions) => Promise<any>;

export async function getLoginTokenAndCookies(
	apiUrl: string,
	httpRequest: HttpRequestFn,
): Promise<{ token: string; cookies: string }> {
	const response = await httpRequest({
		method: 'GET',
		url: apiUrl,
		qs: {
			action: 'query',
			meta: 'tokens',
			type: 'login',
			format: 'json',
		},
		returnFullResponse: true,
	});

	const cookies = response.headers['set-cookie']
		? response.headers['set-cookie'].map((cookie: string) => cookie.split(';')[0]).join('; ')
		: '';

	return {
		token: response.body.query.tokens.logintoken,
		cookies: cookies,
	};
}

export async function login(
	apiUrl: string,
	username: string,
	password: string,
	loginToken: string,
	initialCookies: string,
	httpRequest: HttpRequestFn,
	nodeName: string = 'MediaWiki',
	nodeType: string = 'n8n-nodes-mediawiki',
): Promise<string> {
	const response = await httpRequest({
		method: 'POST',
		url: apiUrl,
		body: new URLSearchParams({
			action: 'login',
			lgname: username,
			lgpassword: password,
			lgtoken: loginToken,
			format: 'json',
		}),
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Cookie: initialCookies,
		},
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	});

	if (response.body.login.result !== 'Success') {
		throw new NodeOperationError(
			{
				name: nodeName,
				type: nodeType,
				typeVersion: 1,
			} as any,
			`Login failed: ${response.body.login.reason || response.body.login.result || 'Unknown error'}`,
		);
	}

	// Build a cookie map to avoid duplicates
	const cookieMap = new Map<string, string>();

	// Parse initial cookies
	if (initialCookies) {
		initialCookies.split('; ').forEach((cookie) => {
			const [name, value] = cookie.split('=');
			if (name && value) {
				cookieMap.set(name, value);
			}
		});
	}

	// Add/update with new cookies
	const newCookies = response.headers['set-cookie']
		? response.headers['set-cookie'].map((cookie: string) => cookie.split(';')[0])
		: [];

	newCookies.forEach((cookie: string) => {
		const [name, value] = cookie.split('=');
		if (name && value) {
			cookieMap.set(name, value);
		}
	});

	// Convert back to cookie string
	return Array.from(cookieMap.entries())
		.map(([name, value]) => `${name}=${value}`)
		.join('; ');
}

export async function getCsrfToken(
	apiUrl: string,
	cookies: string,
	httpRequest: HttpRequestFn,
): Promise<string> {
	const response = await httpRequest({
		method: 'GET',
		url: apiUrl,
		qs: {
			action: 'query',
			meta: 'tokens',
			type: 'csrf',
			format: 'json',
		},
		headers: {
			Cookie: cookies,
		},
	});

	return response.query.tokens.csrftoken;
}
