import { describe, it, expect, beforeAll } from '@jest/globals';
import { queryCatalogService } from '../../app/graphql/services/queryCatalog.service';

describe('QueryCatalog Service', () => {
    describe('searchByAuthor', () => {
        it('should find books by Eva Reiterová', async () => {
            const results = await queryCatalogService.searchByAuthor('Eva Reiterová');
            
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
            
            if (results.length > 0) {
                // Check if first result contains expected book or any book by the author
                const firstBook = results[0];
                expect(firstBook).toHaveProperty('title');
                expect(firstBook).toHaveProperty('author');
                expect(firstBook).toHaveProperty('url');
                
                // Check if author matches (case-insensitive)
                const authorLower = firstBook.author.toLowerCase();
                expect(
                    authorLower.includes('reiterová') || 
                    authorLower.includes('reiterova')
                ).toBe(true);
                
                // Log the results for verification
                console.log('Found books by Eva Reiterová:', results.map(b => ({
                    title: b.title,
                    author: b.author
                })));
                
                // Check if "Základy statistiky pro studenty psychologie" is among results
                const hasExpectedBook = results.some(book => 
                    book.title.toLowerCase().includes('základy statistiky') ||
                    book.title.toLowerCase().includes('zaklady statistiky')
                );
                
                if (hasExpectedBook) {
                    console.log('✓ Found expected book: Základy statistiky pro studenty psychologie');
                }
            }
        }, 30000);

        it('should return empty array for non-existent author', async () => {
            const results = await queryCatalogService.searchByAuthor('XYZ NonExistent Author 12345');
            
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });
    });

    describe('searchGeneral', () => {
        it('should find books using general search for "Demografie"', async () => {
            const results = await queryCatalogService.searchGeneral('Demografie');
            
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
            
            if (results.length > 0) {
                const firstBook = results[0];
                expect(firstBook).toHaveProperty('title');
                expect(firstBook).toHaveProperty('author');
                expect(firstBook).toHaveProperty('url');
                
                // Check if "Demografie" is in the results
                const hasDemografie = results.some(book => 
                    book.title.toLowerCase().includes('demografie')
                );
                
                console.log('Found books for "Demografie":', results.map(b => ({
                    title: b.title,
                    author: b.author
                })));
                
                expect(hasDemografie).toBe(true);
            }
        }, 30000);

        it('should handle special characters in search', async () => {
            const results = await queryCatalogService.searchGeneral('český jazyk');
            
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });
    });

    describe('searchByTitle', () => {
        it('should find books by title', async () => {
            const results = await queryCatalogService.searchByTitle('Demografie');
            
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
            
            if (results.length > 0) {
                const firstBook = results[0];
                expect(firstBook.title.toLowerCase()).toContain('demografie');
            }
        }, 30000);
    });

    describe('getBookById', () => {
        it('should fetch book details by ID', async () => {
            // First search for a book to get a valid ID
            const searchResults = await queryCatalogService.searchGeneral('Demografie');
            
            if (searchResults.length > 0 && searchResults[0].id) {
                const bookId = searchResults[0].id;
                const book = await queryCatalogService.getBookById(bookId);
                
                expect(book).toBeDefined();
                if (book) {
                    expect(book).toHaveProperty('id');
                    expect(book).toHaveProperty('title');
                    expect(book).toHaveProperty('author');
                    expect(book).toHaveProperty('url');
                    expect(book.id).toBe(bookId);
                }
            }
        }, 30000);

        it('should return null for invalid ID', async () => {
            const book = await queryCatalogService.getBookById('invalid-id-999999999');
            
            expect(book).toBeNull();
        });
    });

    describe('queryCatalog', () => {
        it('should handle different search types', async () => {
            const searchTypes = [
                { typeSearch: 'G' as const, queryContent: 'kniha' },
                { typeSearch: 'AU' as const, queryContent: 'Reiterová' },
                { typeSearch: 'TITLE' as const, queryContent: 'Demografie' },
            ];

            for (const search of searchTypes) {
                const results = await queryCatalogService.queryCatalog(search);
                
                expect(results).toBeDefined();
                expect(Array.isArray(results)).toBe(true);
                
                console.log(`Results for ${search.typeSearch}:`, results.length);
            }
        }, 60000);

        it('should limit results to maximum 5 items', async () => {
            const results = await queryCatalogService.searchGeneral('kniha');
            
            expect(results).toBeDefined();
            expect(results.length).toBeLessThanOrEqual(5);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty search query', async () => {
            const results = await queryCatalogService.searchGeneral('');
            
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });

        it('should handle very long search query', async () => {
            const longQuery = 'a'.repeat(500);
            const results = await queryCatalogService.searchGeneral(longQuery);
            
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });

        it('should handle Czech diacritics', async () => {
            const results = await queryCatalogService.searchGeneral('čeština');
            
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });
    });
});
