import { NodeOperationError } from 'n8n-workflow';
import axios from 'axios';

export async function getLoginTokenAndCookies(apiUrl: string): Promise<{ token: string; cookies: string }> {
	const response = await axios.get(apiUrl, {
		params: {
			action: 'query',
			meta: 'tokens',
			type: 'login',
			format: 'json',
		},
		maxRedirects: 0,
		validateStatus: (status) => status >= 200 && status < 400,
	});

	// Extract cookies from the initial request
	const cookies = response.headers['set-cookie']
		? response.headers['set-cookie'].map((cookie: string) => cookie.split(';')[0]).join('; ')
		: '';

	return {
		token: response.data.query.tokens.logintoken,
		cookies: cookies,
	};
}

export async function login(
	apiUrl: string,
	username: string,
	password: string,
	loginToken: string,
	initialCookies: string,
	nodeName: string = 'MediaWiki',
	nodeType: string = 'n8n-nodes-mediawiki',
): Promise<string> {
	const params = new URLSearchParams();
	params.append('action', 'login');
	params.append('lgname', username);
	params.append('lgpassword', password);
	params.append('lgtoken', loginToken);
	params.append('format', 'json');

	const response = await axios.post(apiUrl, params, {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Cookie: initialCookies,
		},
		maxRedirects: 0,
		validateStatus: (status) => status >= 200 && status < 400,
	});

	if (response.data.login.result !== 'Success') {
		throw new NodeOperationError(
			{
				name: nodeName,
				type: nodeType,
				typeVersion: 1,
			} as any,
			`Login failed: ${response.data.login.reason || response.data.login.result || 'Unknown error'}`,
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

	newCookies.forEach((cookie) => {
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

export async function getCsrfToken(apiUrl: string, cookies: string): Promise<string> {
	const response = await axios.get(apiUrl, {
		params: {
			action: 'query',
			meta: 'tokens',
			type: 'csrf',
			format: 'json',
		},
		headers: {
			Cookie: cookies,
		},
	});

	return response.data.query.tokens.csrftoken;
}
