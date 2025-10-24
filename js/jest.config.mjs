function makeProject(name, extra = {}) {
    return {
        displayName: name,
        testMatch: [`<rootDir>/packages/kasstamp_${name}/src/**/*.test.ts`],
        preset: "ts-jest",
        testEnvironment: "node",
        moduleNameMapper: {
            // Mock WASM SDK to avoid import.meta issues in Jest
            "^@kasstamp/kaspa_wasm_sdk$": "<rootDir>/jest.mocks/kaspa-wasm-sdk.js",
            // Special case for kaspa_api
            "^@kasstamp/kaspa_api$": "<rootDir>/packages/kasstamp_kaspa_api/src/index.ts",
            // General pattern for other packages
            "^@kasstamp/(.*)$": "<rootDir>/packages/kasstamp_$1/src/index.ts",
        },
        transform: {
            "^.+\\.ts$": ["ts-jest", {tsconfig: "<rootDir>/tsconfig.json"}],
        },
        ...extra,
    };
}

const config = {
    setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
    projects: [
        makeProject("crypto"),
        makeProject("chunking"),
        makeProject("rpc"),
        makeProject("tx"),
        makeProject("sdk"),
        makeProject("kaspa_wasm_sdk"),
        makeProject("stamping"),
        makeProject("kaspa_api"),
        makeProject("utils"),
        makeProject("wallet"),
    ],
    coverageDirectory: "coverage",
    collectCoverageFrom: [
        "packages/*/src/**/*.{ts,js}",
        "!**/node_modules/**",
        "!**/dist/**",
    ],
};

export default config;
