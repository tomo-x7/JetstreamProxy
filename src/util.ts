export function isStringArray(value: unknown[]): value is string[] {
	for (const item of value) {
		if (typeof item !== "string") {
			return false;
		}
	}
	return true;
}
