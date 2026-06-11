/*---------------------------------------------------------------------------------------------
 *  Copyright (c) EcoSystems contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Origin for gateway auth routes (strips /v1 or /v1/ai suffix from configured base URL). */
export function resolveGatewayOrigin(gatewayBaseUrl: string): string {
	const trimmed = gatewayBaseUrl.replace(/\/+$/, '');
	if (trimmed.endsWith('/v1/ai')) {
		return trimmed.slice(0, -'/v1/ai'.length);
	}
	if (trimmed.endsWith('/v1')) {
		return trimmed.slice(0, -'/v1'.length);
	}
	return trimmed;
}

export function joinGatewayAuthPath(gatewayBaseUrl: string, path: string): string {
	const origin = resolveGatewayOrigin(gatewayBaseUrl);
	const suffix = path.startsWith('/') ? path : `/${path}`;
	return `${origin}/v1/auth${suffix}`;
}

export const ECOSYSTEMS_OAUTH_CALLBACK_AUTHORITY = 'altus.oauth';

export function buildEcosystemsOAuthCallbackUri(urlProtocol: string): string {
	return `${urlProtocol}://${ECOSYSTEMS_OAUTH_CALLBACK_AUTHORITY}/callback`;
}

export function isEcosystemsOAuthCallbackUri(uri: { scheme: string; authority: string; path: string }, urlProtocol: string): boolean {
	return uri.scheme === urlProtocol
		&& uri.authority === ECOSYSTEMS_OAUTH_CALLBACK_AUTHORITY
		&& (uri.path === '/callback' || uri.path === 'callback');
}
