/**
 * Test Data Factories & Shared Utilities
 */

// ── User Test Data ──────────────────────────────────────────────────────────

let userCounter = 0

export function createUserData(overrides: Record<string, any> = {}) {
    userCounter++
    return {
        name: `Test User ${userCounter}`,
        email: `testuser${userCounter}@example.com`,
        password: "password123",
        ...overrides,
    }
}

// ── Contact Test Data ───────────────────────────────────────────────────────

let contactCounter = 0

export function createContactData(overrides: Record<string, any> = {}) {
    contactCounter++
    return {
        name: `Contact ${contactCounter}`,
        email: `contact${contactCounter}@example.com`,
        phone: `08123456${String(contactCounter).padStart(4, "0")}`,
        ...overrides,
    }
}

// ── Response Assertions ─────────────────────────────────────────────────────

export function expectSuccess(body: any, statusCode: number = 200) {
    if (body.success !== true) {
        throw new Error(`Expected success=true, got: ${JSON.stringify(body)}`)
    }
    if (body.statusCode !== statusCode) {
        throw new Error(`Expected statusCode=${statusCode}, got: ${body.statusCode}`)
    }
}

export function expectError(body: any, statusCode: number) {
    if (body.success !== false) {
        throw new Error(`Expected success=false, got: ${JSON.stringify(body)}`)
    }
    if (body.statusCode !== statusCode) {
        throw new Error(`Expected statusCode=${statusCode}, got: ${body.statusCode}`)
    }
}

export function expectPagination(body: any) {
    if (!body.meta) {
        throw new Error(`Expected meta pagination, got: ${JSON.stringify(body)}`)
    }
    const requiredFields = ["total", "perPage", "currentPage", "lastPage", "from", "to"]
    for (const field of requiredFields) {
        if (body.meta[field] === undefined) {
            throw new Error(`Missing pagination field: ${field}`)
        }
    }
}

// ── Reset Counters ──────────────────────────────────────────────────────────

export function resetCounters() {
    userCounter = 0
    contactCounter = 0
}
