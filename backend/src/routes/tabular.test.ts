import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    assertDocumentsAccessible,
    type DocumentAccessRow,
} from "./tabular";

type ProjectRow = {
    id: string;
    user_id: string;
    shared_with: string[] | null;
};

type DbState = {
    documents: Record<string, DocumentAccessRow>;
    projects: Record<string, ProjectRow>;
    documentsError?: Error;
    inCalls: string[][];
    projectCalls: string[];
};

function makeDb(state: DbState) {
    return {
        from(table: string) {
            if (table === "documents") {
                return {
                    select: () => ({
                        in: (_col: string, ids: string[]) => {
                            state.inCalls.push([...ids]);
                            return Promise.resolve(
                                state.documentsError
                                    ? { data: null, error: state.documentsError }
                                    : {
                                          data: ids
                                              .map((id) => state.documents[id])
                                              .filter(Boolean),
                                          error: null,
                                      },
                            );
                        },
                    }),
                };
            }
            if (table === "projects") {
                return {
                    select: () => ({
                        eq: (_col: string, projectId: string) => ({
                            single: () => {
                                state.projectCalls.push(projectId);
                                const proj = state.projects[projectId];
                                return Promise.resolve(
                                    proj
                                        ? { data: proj, error: null }
                                        : {
                                              data: null,
                                              error: new Error("not found"),
                                          },
                                );
                            },
                        }),
                    }),
                };
            }
            throw new Error(`unexpected table: ${table}`);
        },
    } as unknown as Parameters<typeof assertDocumentsAccessible>[3];
}

function blankState(
    overrides: Partial<Omit<DbState, "inCalls" | "projectCalls">> = {},
): DbState {
    return {
        documents: {},
        projects: {},
        inCalls: [],
        projectCalls: [],
        ...overrides,
    };
}

function expectOk(
    result: Awaited<ReturnType<typeof assertDocumentsAccessible>>,
): asserts result is Extract<typeof result, { ok: true }> {
    if (!result.ok) {
        assert.fail(`expected ok=true, got bad=${JSON.stringify(result.bad)}`);
    }
}

function expectBad(
    result: Awaited<ReturnType<typeof assertDocumentsAccessible>>,
    expectedBad: string[],
): asserts result is Extract<typeof result, { ok: false }> {
    if (result.ok) {
        assert.fail(
            `expected ok=false, got ok with ${result.docs.length} doc(s)`,
        );
    }
    // Order-insensitive membership check.
    const actual = new Set(result.bad);
    const expected = new Set(expectedBad);
    assert.equal(actual.size, expected.size, `bad size mismatch`);
    for (const id of expected) {
        assert.ok(actual.has(id), `expected '${id}' in bad`);
    }
}

describe("assertDocumentsAccessible", () => {
    it("returns ok with empty docs and makes no DB calls", async () => {
        const state = blankState();
        const db = makeDb(state);
        const result = await assertDocumentsAccessible([], "u1", "u1@x.test", db);
        expectOk(result);
        assert.deepEqual(result.docs, []);
        assert.equal(state.inCalls.length, 0);
        assert.equal(state.projectCalls.length, 0);
    });

    it("dedupes IDs to a single fetch", async () => {
        const state = blankState({
            documents: {
                d1: { id: "d1", user_id: "u1", project_id: null },
            },
        });
        const db = makeDb(state);
        const result = await assertDocumentsAccessible(
            ["d1", "d1", "d1"],
            "u1",
            "u1@x.test",
            db,
        );
        expectOk(result);
        assert.equal(state.inCalls.length, 1);
        assert.deepEqual(state.inCalls[0], ["d1"]);
    });

    it("passes when caller is the document owner", async () => {
        const state = blankState({
            documents: {
                d1: { id: "d1", user_id: "u1", project_id: null },
            },
        });
        const result = await assertDocumentsAccessible(
            ["d1"],
            "u1",
            "u1@x.test",
            makeDb(state),
        );
        expectOk(result);
        assert.equal(result.docs.length, 1);
        assert.equal(result.docs[0].id, "d1");
    });

    it("passes when caller is in project shared_with by email", async () => {
        const state = blankState({
            documents: {
                d1: { id: "d1", user_id: "owner", project_id: "p1" },
            },
            projects: {
                p1: {
                    id: "p1",
                    user_id: "owner",
                    shared_with: ["caller@x.test"],
                },
            },
        });
        const result = await assertDocumentsAccessible(
            ["d1"],
            "caller-uuid",
            "caller@x.test",
            makeDb(state),
        );
        expectOk(result);
    });

    it("passes when caller owns the project the doc belongs to", async () => {
        const state = blankState({
            documents: {
                d1: { id: "d1", user_id: "doc-author", project_id: "p1" },
            },
            projects: {
                p1: { id: "p1", user_id: "u1", shared_with: null },
            },
        });
        const result = await assertDocumentsAccessible(
            ["d1"],
            "u1",
            "u1@x.test",
            makeDb(state),
        );
        expectOk(result);
    });

    it("fails when caller is a stranger to a doc with no project", async () => {
        const state = blankState({
            documents: {
                d1: { id: "d1", user_id: "owner", project_id: null },
            },
        });
        const result = await assertDocumentsAccessible(
            ["d1"],
            "stranger",
            "stranger@x.test",
            makeDb(state),
        );
        expectBad(result, ["d1"]);
    });

    it("returns missing IDs in bad", async () => {
        const state = blankState({
            documents: {
                d1: { id: "d1", user_id: "u1", project_id: null },
            },
        });
        const result = await assertDocumentsAccessible(
            ["d1", "d99"],
            "u1",
            "u1@x.test",
            makeDb(state),
        );
        expectBad(result, ["d99"]);
    });

    it("returns only denied IDs when mix of allowed and denied", async () => {
        const state = blankState({
            documents: {
                d1: { id: "d1", user_id: "u1", project_id: null },
                d2: { id: "d2", user_id: "owner", project_id: null },
            },
        });
        const result = await assertDocumentsAccessible(
            ["d1", "d2"],
            "u1",
            "u1@x.test",
            makeDb(state),
        );
        expectBad(result, ["d2"]);
    });

    it("returns both missing and denied IDs", async () => {
        const state = blankState({
            documents: {
                d1: { id: "d1", user_id: "owner", project_id: null },
            },
        });
        const result = await assertDocumentsAccessible(
            ["d1", "d99"],
            "u1",
            "u1@x.test",
            makeDb(state),
        );
        expectBad(result, ["d1", "d99"]);
    });

    it("fails closed when documents query errors", async () => {
        const state = blankState({
            documents: {
                d1: { id: "d1", user_id: "u1", project_id: null },
                d2: { id: "d2", user_id: "u1", project_id: null },
            },
            documentsError: new Error("db down"),
        });
        const result = await assertDocumentsAccessible(
            ["d1", "d2", "d2"],
            "u1",
            "u1@x.test",
            makeDb(state),
        );
        expectBad(result, ["d1", "d2"]);
    });
});
