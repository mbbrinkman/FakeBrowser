// AI Service Layer for FakeBrowser
// Uses OpenRouter API with IndexedDB for storage

class AIService {
    constructor() {
        this.dbName = 'FakeBrowserDB';
        this.dbVersion = 1;
        this.db = null;
        this.settings = null;
        this.initPromise = this.initDB();
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                // Page cache store
                if (!db.objectStoreNames.contains('pageCache')) {
                    const cacheStore = db.createObjectStore('pageCache', { keyPath: 'url' });
                    cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    async ensureDB() {
        await this.initPromise;
    }

    async loadSettings() {
        await this.ensureDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get('config');

            request.onsuccess = () => {
                if (request.result) {
                    this.settings = request.result.value;
                } else {
                    this.settings = {
                        apiKey: '',
                        model: ''
                    };
                }
                resolve(this.settings);
            };

            request.onerror = () => reject(request.error);
        });
    }

    async saveSettings(settings) {
        await this.ensureDB();
        this.settings = settings;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ key: 'config', value: settings });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getSettings() {
        if (!this.settings) {
            await this.loadSettings();
        }
        return this.settings;
    }

    async isConfigured() {
        const settings = await this.getSettings();
        return settings.apiKey && settings.apiKey.length > 0;
    }

    // Page Cache Methods
    async getCachedPage(url) {
        await this.ensureDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pageCache'], 'readonly');
            const store = transaction.objectStore('pageCache');
            const request = store.get(url);

            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result.html);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    async cachePage(url, html) {
        await this.ensureDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pageCache'], 'readwrite');
            const store = transaction.objectStore('pageCache');
            const request = store.put({
                url: url,
                html: html,
                timestamp: Date.now()
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearCachedPage(url) {
        await this.ensureDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pageCache'], 'readwrite');
            const store = transaction.objectStore('pageCache');
            const request = store.delete(url);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearAllCache() {
        await this.ensureDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pageCache'], 'readwrite');
            const store = transaction.objectStore('pageCache');
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async generatePage(url) {
        const settings = await this.getSettings();

        if (!settings.apiKey) {
            throw new Error('API key not configured. Please open settings and enter your OpenRouter API key.');
        }

        const userMessage = `Generate an HTML page for the following URL: ${url}`;

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'FakeBrowser'
            },
            body: JSON.stringify({
                model: settings.model,
                max_tokens: 16000,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userMessage }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.choices || !data.choices[0]) {
            throw new Error('No response from AI');
        }

        return this.cleanHtmlResponse(data.choices[0].message.content);
    }

    cleanHtmlResponse(html) {
        // Remove any markdown code fences if present
        html = html.trim();

        // Remove ```html or ``` at the start
        if (html.startsWith('```html')) {
            html = html.slice(7);
        } else if (html.startsWith('```')) {
            html = html.slice(3);
        }

        // Remove ``` at the end
        if (html.endsWith('```')) {
            html = html.slice(0, -3);
        }

        return html.trim();
    }
}

// Create global instance
const aiService = new AIService();

// Model fetching and caching
class ModelService {
    constructor() {
        this.models = [];
        this.loaded = false;
    }

    async fetchModels() {
        if (this.loaded && this.models.length > 0) {
            return this.models;
        }

        try {
            const response = await fetch('https://openrouter.ai/api/v1/models');
            if (!response.ok) {
                throw new Error('Failed to fetch models');
            }

            const data = await response.json();

            // Sort by created date (newest first), fallback to name
            this.models = data.data
                .filter(m => m.id && m.name)
                .sort((a, b) => {
                    // Sort by created timestamp if available (newest first)
                    if (a.created && b.created) {
                        return b.created - a.created;
                    }
                    return a.name.localeCompare(b.name);
                })
                .map(m => ({
                    id: m.id,
                    name: m.name,
                    created: m.created,
                    contextLength: m.context_length,
                    pricing: m.pricing
                }));

            this.loaded = true;
            return this.models;
        } catch (error) {
            console.error('Error fetching models:', error);
            return [];
        }
    }

    filterModels(query) {
        if (!query) return this.models;
        const q = query.toLowerCase();
        return this.models.filter(m =>
            m.id.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q)
        );
    }
}

const modelService = new ModelService();
