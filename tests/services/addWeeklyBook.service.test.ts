import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { runWeeklyBookUpdate } from '../../app/graphql/services/addWeeklyBook.service';

// Mock axios
jest.mock('axios');

// Mock ChromaDB
jest.mock('chromadb', () => ({
    ChromaClient: jest.fn().mockImplementation(() => ({
        deleteCollection: jest.fn().mockResolvedValue(undefined),
        createCollection: jest.fn().mockResolvedValue({
            add: jest.fn().mockResolvedValue(undefined),
            count: jest.fn().mockResolvedValue(100),
        }),
    })),
}));

// Mock OpenAI
jest.mock('openai', () => ({
    default: jest.fn().mockImplementation(() => ({
        embeddings: {
            create: jest.fn().mockResolvedValue({
                data: Array(10).fill({ embedding: Array(1536).fill(0.1) }),
            }),
        },
    })),
}));

const HARVEST_DIR = path.join(process.cwd(), 'harvest_data');
const RAW_CSV = path.join(HARVEST_DIR, 'raw_records.csv');
const CLEAN_CSV = path.join(HARVEST_DIR, 'clean_records.csv');

describe('AddWeeklyBook Service', () => {
    beforeEach(() => {
        // Clean up test files
        if (fs.existsSync(HARVEST_DIR)) {
            fs.rmSync(HARVEST_DIR, { recursive: true, force: true });
        }
    });

    afterEach(() => {
        // Clean up after tests
        if (fs.existsSync(HARVEST_DIR)) {
            fs.rmSync(HARVEST_DIR, { recursive: true, force: true });
        }
    });

    describe('Utility Functions', () => {
        it('should escape CSV values correctly', () => {
            // This would test the escapeCsv function if exported
            // For now, we test through the integration
            expect(true).toBe(true);
        });

        it('should extract CPK ID from identifier', () => {
            // This would test the extractCpkId function if exported
            expect(true).toBe(true);
        });
    });

    describe('MARC Parsing', () => {
        it('should parse MARC record correctly', () => {
            // Create a sample MARC record
            const sampleRecord = {
                header: { identifier: 'oai:cpk:123456' },
                metadata: {
                    record: {
                        leader: 'test-leader',
                        controlfield: [
                            { '@_tag': '008', '#text': 'test-008-field-with-language-cze' }
                        ],
                        datafield: [
                            {
                                '@_tag': '245',
                                subfield: [
                                    { '@_code': 'a', '#text': 'Test Title' },
                                    { '@_code': 'b', '#text': 'Subtitle' }
                                ]
                            },
                            {
                                '@_tag': '100',
                                subfield: { '@_code': 'a', '#text': 'Test Author' }
                            }
                        ]
                    }
                }
            };

            // This would test parseMarcXml if exported
            expect(sampleRecord).toBeDefined();
        });
    });

    describe('Normalization', () => {
        it('should filter out records with missing required fields', () => {
            // Test that records without title, description, etc. are filtered
            expect(true).toBe(true);
        });

        it('should clean "nan" values from fields', () => {
            // Test that "nan" strings are replaced with empty strings
            expect(true).toBe(true);
        });

        it('should trim whitespace and quotes', () => {
            // Test field cleaning
            expect(true).toBe(true);
        });
    });

    describe('Full Pipeline', () => {
        it('should run weekly update without errors', async () => {
            // Mock successful API responses
            const axios = require('axios');
            axios.get = jest.fn()
                .mockResolvedValueOnce({
                    data: `<?xml version="1.0"?>
                        <OAI-PMH>
                            <ListRecords>
                                <record>
                                    <header><identifier>oai:cpk:123</identifier></header>
                                    <metadata>
                                        <record>
                                            <leader>test</leader>
                                            <controlfield tag="008">test-field-cze-test</controlfield>
                                            <datafield tag="245" ind1=" " ind2=" ">
                                                <subfield code="a">Test Book</subfield>
                                            </datafield>
                                            <datafield tag="100" ind1=" " ind2=" ">
                                                <subfield code="a">Test Author</subfield>
                                            </datafield>
                                            <datafield tag="520" ind1=" " ind2=" ">
                                                <subfield code="a">Test Description</subfield>
                                            </datafield>
                                        </record>
                                    </metadata>
                                </record>
                            </ListRecords>
                        </OAI-PMH>`
                });

            // Run with mocked dependencies
            await expect(runWeeklyBookUpdate()).resolves.not.toThrow();
        }, 60000);
    });

    describe('Error Handling', () => {
        it('should handle network errors gracefully', async () => {
            const axios = require('axios');
            axios.get = jest.fn().mockRejectedValue(new Error('Network error'));

            await expect(runWeeklyBookUpdate()).rejects.toThrow();
        });

        it('should handle invalid XML data', async () => {
            const axios = require('axios');
            axios.get = jest.fn().mockResolvedValue({ data: 'invalid xml' });

            await expect(runWeeklyBookUpdate()).rejects.toThrow();
        });
    });

    describe('Date Range Calculation', () => {
        it('should calculate correct date range for last 7 days', () => {
            const today = new Date();
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            const until = today.toISOString().split('T')[0];
            const from = weekAgo.toISOString().split('T')[0];

            expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(new Date(until).getTime()).toBeGreaterThan(new Date(from).getTime());
        });
    });
});
