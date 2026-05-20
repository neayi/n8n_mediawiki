/**
 * Split wikitext inner content by top-level | characters,
 * ignoring | inside nested {{ }} or [[ ]] blocks.
 */
export function splitTopLevel(content: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = '';

	for (let i = 0; i < content.length; i++) {
		const ch = content[i];
		const next = content[i + 1];
		if ((ch === '{' || ch === '[') && next === ch) {
			depth++;
			current += ch + next;
			i++;
		} else if ((ch === '}' || ch === ']') && next === ch) {
			depth--;
			current += ch + next;
			i++;
		} else if (ch === '|' && depth === 0) {
			parts.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	parts.push(current);
	return parts;
}

export interface TemplateMatch {
	start: number;
	end: number;
	/** Content between {{ and }}, including the template name */
	inner: string;
}

/**
 * Find a template by name in wikitext using depth-aware bracket tracking.
 * Returns start/end indices and the inner content, or null if not found.
 */
export function findTemplate(content: string, templateName: string): TemplateMatch | null {
	const escapedName = templateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const templateStartRegex = new RegExp(
		`\\{\\{\\s*${escapedName}\\s*(?=[|\\}])`,
		'i',
	);

	const startMatch = templateStartRegex.exec(content);
	if (!startMatch) {
		return null;
	}

	const startIndex = startMatch.index;
	let depth = 0;
	let endIndex = -1;

	for (let i = startIndex; i < content.length - 1; i++) {
		if (content[i] === '{' && content[i + 1] === '{') {
			depth++;
			i++;
		} else if (content[i] === '}' && content[i + 1] === '}') {
			depth--;
			if (depth === 0) {
				endIndex = i + 2;
				break;
			}
			i++;
		}
	}

	if (endIndex === -1) {
		return null; // Unclosed template
	}

	return {
		start: startIndex,
		end: endIndex,
		inner: content.substring(startIndex + 2, endIndex - 2),
	};
}

/**
 * Parse named parameters from a template's inner content (between {{ and }}).
 * parts[0] is the template name — parameters start at index 1.
 */
export function parseTemplateParams(inner: string): Map<string, string> {
	const variables = new Map<string, string>();
	const parts = splitTopLevel(inner);

	for (let j = 1; j < parts.length; j++) {
		const part = parts[j].trim();
		if (!part) continue;

		const eqIndex = part.indexOf('=');
		if (eqIndex !== -1) {
			const name = part.substring(0, eqIndex).trim();
			const value = part.substring(eqIndex + 1).trim();
			if (name) {
				variables.set(name, value);
			}
		}
	}

	return variables;
}
