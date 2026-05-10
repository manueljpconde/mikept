export type DuplicateKey = {
    key: string;
    firstLine: number;
    secondLine: number;
};

export function findDuplicateTopLevelKeys(source: string): DuplicateKey[] {
    const duplicates: DuplicateKey[] = [];
    const firstSeen = new Map<string, number>();
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    let stringStart = -1;
    let pendingKey: string | null = null;
    let pendingKeyLine = 0;
    let line = 1;

    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        if (ch === "\n") line++;

        if (escapeNext) {
            escapeNext = false;
            continue;
        }

        if (inString) {
            if (ch === "\\") {
                escapeNext = true;
            } else if (ch === '"') {
                const literal = source.slice(stringStart + 1, i);
                inString = false;
                stringStart = -1;

                if (depth === 1) {
                    let j = i + 1;
                    while (
                        j < source.length &&
                        (source[j] === " " ||
                            source[j] === "\t" ||
                            source[j] === "\n" ||
                            source[j] === "\r")
                    ) {
                        j++;
                    }
                    if (source[j] === ":") {
                        const decoded = decodeJsonString(literal);
                        if (firstSeen.has(decoded)) {
                            duplicates.push({
                                key: decoded,
                                firstLine: firstSeen.get(decoded)!,
                                secondLine: line,
                            });
                        } else {
                            firstSeen.set(decoded, line);
                        }
                        pendingKey = decoded;
                        pendingKeyLine = line;
                    }
                }
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            stringStart = i;
            continue;
        }

        if (ch === "{") {
            depth++;
        } else if (ch === "}") {
            depth--;
        }

        pendingKey = pendingKey;
        pendingKeyLine = pendingKeyLine;
    }

    return duplicates;
}

function decodeJsonString(literal: string): string {
    return literal
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\//g, "/")
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
            String.fromCodePoint(parseInt(hex, 16)),
        );
}
