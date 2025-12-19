// FakeBrowser - Main Browser Logic with Tabs

class Tab {
    constructor(id) {
        this.id = id;
        this.url = null;
        this.title = 'New Tab';
        this.favicon = '🌐';
        this.history = [];
        this.historyIndex = -1;
        this.content = null; // Stored HTML content
    }
}

class FakeBrowser {
    constructor() {
        // DOM Elements
        this.tabsContainer = document.getElementById('tabs-container');
        this.newTabBtn = document.getElementById('new-tab-btn');
        this.urlBar = document.getElementById('url-bar');
        this.goBtn = document.getElementById('go-btn');
        this.backBtn = document.getElementById('back-btn');
        this.forwardBtn = document.getElementById('forward-btn');
        this.refreshBtn = document.getElementById('refresh-btn');
        this.homeBtn = document.getElementById('home-btn');
        this.settingsBtn = document.getElementById('settings-btn');
        this.contentFrame = document.getElementById('content-frame');
        this.loadingBar = document.getElementById('loading-bar');
        this.statusText = document.getElementById('status-text');

        // Settings Modal Elements
        this.settingsModal = document.getElementById('settings-modal');
        this.closeSettingsBtn = document.getElementById('close-settings');
        this.apiKeyInput = document.getElementById('api-key');
        this.modelSearch = document.getElementById('model-search');
        this.modelSelect = document.getElementById('model-select');
        this.saveSettingsBtn = document.getElementById('save-settings');
        this.clearCacheBtn = document.getElementById('clear-cache');

        // Tab State
        this.tabs = new Map();
        this.activeTabId = null;
        this.tabCounter = 0;
        this.isLoading = false;

        // Initialize
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadSettings();
        this.createTab(); // Create initial tab
    }

    bindEvents() {
        // Navigation
        this.goBtn.addEventListener('click', () => this.navigate());
        this.urlBar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.navigate();
        });
        this.backBtn.addEventListener('click', () => this.goBack());
        this.forwardBtn.addEventListener('click', () => this.goForward());
        this.refreshBtn.addEventListener('click', () => this.refresh());
        this.homeBtn.addEventListener('click', () => this.goHome());

        // Tabs
        this.newTabBtn.addEventListener('click', () => this.createTab());

        // Settings
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        this.clearCacheBtn.addEventListener('click', () => this.clearCache());
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.closeSettings();
        });

        // Model search filtering
        this.modelSearch.addEventListener('input', () => this.filterModels());

        // Listen for messages from iframe
        window.addEventListener('message', (e) => this.handleFrameMessage(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 't') {
                e.preventDefault();
                this.createTab();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
                e.preventDefault();
                if (this.activeTabId) this.closeTab(this.activeTabId);
            }
        });
    }

    // ==================== Tab Management ====================

    createTab(url = null) {
        const id = ++this.tabCounter;
        const tab = new Tab(id);
        this.tabs.set(id, tab);

        // Create tab element
        const tabEl = document.createElement('div');
        tabEl.className = 'tab';
        tabEl.dataset.tabId = id;
        tabEl.innerHTML = `
            <span class="tab-favicon">${tab.favicon}</span>
            <span class="tab-title">${tab.title}</span>
            <button class="tab-close" title="Close tab">
                <svg viewBox="0 0 24 24" width="12" height="12">
                    <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
            </button>
        `;

        // Tab click handler
        tabEl.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-close')) {
                this.switchToTab(id);
            }
        });

        // Close button handler
        tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(id);
        });

        this.tabsContainer.appendChild(tabEl);
        this.switchToTab(id);

        // Navigate to URL if provided, otherwise show welcome
        if (url) {
            this.navigate(url);
        } else {
            this.showWelcomePage();
        }

        return tab;
    }

    switchToTab(id) {
        const tab = this.tabs.get(id);
        if (!tab) return;

        // Save current tab's state
        if (this.activeTabId && this.activeTabId !== id) {
            const currentTab = this.tabs.get(this.activeTabId);
            if (currentTab) {
                // Content is already stored when rendered
            }
        }

        // Update active tab
        this.activeTabId = id;

        // Update tab UI
        this.tabsContainer.querySelectorAll('.tab').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.tabId) === id);
        });

        // Restore tab state
        this.urlBar.value = tab.url || '';
        this.updateNavButtons();

        // Restore content
        if (tab.content) {
            this.renderPage(tab.content, tab.url, false);
        } else if (!tab.url) {
            this.showWelcomePage();
        }
    }

    closeTab(id) {
        const tab = this.tabs.get(id);
        if (!tab) return;

        // Remove tab element
        const tabEl = this.tabsContainer.querySelector(`[data-tab-id="${id}"]`);
        if (tabEl) tabEl.remove();

        // Remove from tabs map
        this.tabs.delete(id);

        // If we closed the active tab, switch to another
        if (this.activeTabId === id) {
            const remainingTabs = Array.from(this.tabs.keys());
            if (remainingTabs.length > 0) {
                this.switchToTab(remainingTabs[remainingTabs.length - 1]);
            } else {
                // No tabs left, create a new one
                this.createTab();
            }
        }
    }

    updateTabUI(id) {
        const tab = this.tabs.get(id);
        if (!tab) return;

        const tabEl = this.tabsContainer.querySelector(`[data-tab-id="${id}"]`);
        if (tabEl) {
            tabEl.querySelector('.tab-favicon').textContent = tab.favicon;
            tabEl.querySelector('.tab-title').textContent = tab.title;
        }
    }

    get activeTab() {
        return this.tabs.get(this.activeTabId);
    }

    // ==================== Navigation ====================

    async navigate(url = null) {
        if (this.isLoading) return;

        const tab = this.activeTab;
        if (!tab) return;

        url = url || this.urlBar.value.trim();
        if (!url) return;

        // Normalize URL
        url = this.normalizeUrl(url);
        this.urlBar.value = url;

        // Check if API is configured
        const configured = await aiService.isConfigured();
        if (!configured) {
            this.openSettings();
            this.setStatus('Please configure your OpenRouter API key first');
            return;
        }

        // Start loading
        this.setLoading(true);
        this.setStatus(`Loading ${url}...`);

        try {
            let html;

            // Check IndexedDB cache first
            html = await aiService.getCachedPage(url);

            if (!html) {
                // Generate page via AI
                html = await aiService.generatePage(url);
                // Cache the result
                await aiService.cachePage(url, html);
            }

            // Update tab state
            if (tab.url !== url) {
                // Trim forward history when navigating to new page
                if (tab.historyIndex < tab.history.length - 1) {
                    tab.history = tab.history.slice(0, tab.historyIndex + 1);
                }
                tab.history.push(url);
                tab.historyIndex = tab.history.length - 1;
            }

            tab.url = url;
            tab.content = html;

            // Render the page
            this.renderPage(html, url);

            this.updateNavButtons();
            this.setStatus('Done');

            // Update tab title and favicon
            this.updateTabInfo(tab, url, html);

        } catch (error) {
            console.error('Navigation error:', error);
            this.showErrorPage(url, error.message);
            this.setStatus('Error loading page');
        } finally {
            this.setLoading(false);
        }
    }

    normalizeUrl(url) {
        // If it looks like a search query (no dots, no protocol)
        if (!url.includes('.') && !url.startsWith('http')) {
            return `https://google.com/search?q=${encodeURIComponent(url)}`;
        }

        // Add protocol if missing
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        return url;
    }

    async goBack() {
        const tab = this.activeTab;
        if (!tab || tab.historyIndex <= 0) return;

        tab.historyIndex--;
        const url = tab.history[tab.historyIndex];
        this.urlBar.value = url;
        tab.url = url;

        // Load from cache
        const html = await aiService.getCachedPage(url);
        if (html) {
            tab.content = html;
            this.renderPage(html, url);
            this.updateTabInfo(tab, url, html);
        } else {
            await this.navigate(url);
        }
        this.updateNavButtons();
    }

    async goForward() {
        const tab = this.activeTab;
        if (!tab || tab.historyIndex >= tab.history.length - 1) return;

        tab.historyIndex++;
        const url = tab.history[tab.historyIndex];
        this.urlBar.value = url;
        tab.url = url;

        // Load from cache
        const html = await aiService.getCachedPage(url);
        if (html) {
            tab.content = html;
            this.renderPage(html, url);
            this.updateTabInfo(tab, url, html);
        } else {
            await this.navigate(url);
        }
        this.updateNavButtons();
    }

    async refresh() {
        const tab = this.activeTab;
        if (!tab || !tab.url) return;

        // Clear cache for this URL to force regeneration
        await aiService.clearCachedPage(tab.url);
        await this.navigate(tab.url);
    }

    goHome() {
        const tab = this.activeTab;
        if (!tab) return;

        tab.url = null;
        tab.title = 'New Tab';
        tab.favicon = '🌐';
        tab.content = null;

        this.urlBar.value = '';
        this.updateTabUI(this.activeTabId);
        this.showWelcomePage();
    }

    updateNavButtons() {
        const tab = this.activeTab;
        this.backBtn.disabled = !tab || tab.historyIndex <= 0;
        this.forwardBtn.disabled = !tab || tab.historyIndex >= tab.history.length - 1;
    }

    // ==================== Page Rendering ====================

    renderPage(html, url, injectInterceptor = true) {
        if (injectInterceptor) {
            // Inject link interceptor script
            const interceptorScript = this.getLinkInterceptorScript(url);

            // Insert script before closing body tag, or at the end
            if (html.includes('</body>')) {
                html = html.replace('</body>', `${interceptorScript}</body>`);
            } else {
                html += interceptorScript;
            }
        }

        // Set iframe content
        this.contentFrame.srcdoc = html;
    }

    getLinkInterceptorScript(baseUrl) {
        return `
        <script>
        (function() {
            // Parse base URL for resolving relative URLs
            const baseUrl = '${baseUrl}';
            const baseUrlObj = new URL(baseUrl);

            function resolveUrl(href) {
                if (!href || href.startsWith('javascript:') || href.startsWith('#')) {
                    return null;
                }
                try {
                    // Handle relative URLs
                    if (href.startsWith('/')) {
                        return baseUrlObj.origin + href;
                    } else if (!href.startsWith('http')) {
                        return new URL(href, baseUrl).href;
                    }
                    return href;
                } catch (e) {
                    return null;
                }
            }

            // Intercept all link clicks
            document.addEventListener('click', function(e) {
                const link = e.target.closest('a');
                if (link && link.href) {
                    e.preventDefault();
                    const resolvedUrl = resolveUrl(link.getAttribute('href'));
                    if (resolvedUrl) {
                        // Ctrl+click or Cmd+click opens in new tab
                        const newTab = e.ctrlKey || e.metaKey;
                        window.parent.postMessage({
                            type: newTab ? 'navigate-new-tab' : 'navigate',
                            url: resolvedUrl
                        }, '*');
                    }
                }
            });

            // Middle-click opens in new tab
            document.addEventListener('auxclick', function(e) {
                if (e.button === 1) { // Middle mouse button
                    const link = e.target.closest('a');
                    if (link && link.href) {
                        e.preventDefault();
                        const resolvedUrl = resolveUrl(link.getAttribute('href'));
                        if (resolvedUrl) {
                            window.parent.postMessage({
                                type: 'navigate-new-tab',
                                url: resolvedUrl
                            }, '*');
                        }
                    }
                }
            });

            // Intercept form submissions
            document.addEventListener('submit', function(e) {
                const form = e.target;
                e.preventDefault();

                let url = form.action || baseUrl;
                const formData = new FormData(form);

                if (form.method?.toLowerCase() === 'get' || !form.method) {
                    const params = new URLSearchParams(formData);
                    const resolvedUrl = resolveUrl(url);
                    if (resolvedUrl) {
                        const urlObj = new URL(resolvedUrl);
                        urlObj.search = params.toString();
                        window.parent.postMessage({
                            type: 'navigate',
                            url: urlObj.href
                        }, '*');
                    }
                }
            });

            // Handle hover states for status bar
            document.addEventListener('mouseover', function(e) {
                const link = e.target.closest('a');
                if (link && link.href) {
                    const resolvedUrl = resolveUrl(link.getAttribute('href'));
                    window.parent.postMessage({
                        type: 'hover',
                        url: resolvedUrl || ''
                    }, '*');
                }
            });

            document.addEventListener('mouseout', function(e) {
                const link = e.target.closest('a');
                if (link) {
                    window.parent.postMessage({
                        type: 'hover',
                        url: ''
                    }, '*');
                }
            });
        })();
        <\/script>`;
    }

    handleFrameMessage(event) {
        const data = event.data;
        if (!data || !data.type) return;

        if (data.type === 'navigate') {
            this.navigate(data.url);
        } else if (data.type === 'navigate-new-tab') {
            this.createTab(data.url);
        } else if (data.type === 'hover') {
            this.setStatus(data.url || 'Ready');
        }
    }

    // ==================== Special Pages ====================

    async showWelcomePage() {
        const configured = await aiService.isConfigured();
        const warningDisplay = configured ? 'none' : 'block';

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .container {
                    background: white;
                    border-radius: 20px;
                    padding: 60px;
                    max-width: 600px;
                    width: 90%;
                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
                    text-align: center;
                }
                h1 {
                    font-size: 42px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    margin-bottom: 10px;
                }
                .subtitle {
                    color: #666;
                    font-size: 18px;
                    margin-bottom: 40px;
                }
                .features {
                    text-align: left;
                    margin-bottom: 40px;
                }
                .feature {
                    display: flex;
                    align-items: flex-start;
                    gap: 15px;
                    margin-bottom: 20px;
                }
                .feature-icon {
                    font-size: 24px;
                    width: 40px;
                    text-align: center;
                }
                .feature-text h3 {
                    color: #333;
                    font-size: 16px;
                    margin-bottom: 4px;
                }
                .feature-text p {
                    color: #666;
                    font-size: 14px;
                    line-height: 1.5;
                }
                .suggestions h3 {
                    color: #333;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-bottom: 15px;
                }
                .suggestion-links {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    justify-content: center;
                }
                .suggestion-links a {
                    background: #f0f0f0;
                    color: #333;
                    padding: 10px 18px;
                    border-radius: 25px;
                    text-decoration: none;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                .suggestion-links a:hover {
                    background: #667eea;
                    color: white;
                }
                .warning {
                    margin-top: 30px;
                    padding: 15px;
                    background: #fff3cd;
                    border-radius: 10px;
                    font-size: 13px;
                    color: #856404;
                    display: ${warningDisplay};
                }
                .powered-by {
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #eee;
                    color: #999;
                    font-size: 12px;
                }
                .powered-by a {
                    color: #667eea;
                    text-decoration: none;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>FakeBrowser</h1>
                <p class="subtitle">The AI-Powered Imaginary Internet</p>

                <div class="features">
                    <div class="feature">
                        <span class="feature-icon">🤖</span>
                        <div class="feature-text">
                            <h3>AI-Generated Pages</h3>
                            <p>Every website is created on-the-fly by AI. No real internet connection needed!</p>
                        </div>
                    </div>
                    <div class="feature">
                        <span class="feature-icon">🌐</span>
                        <div class="feature-text">
                            <h3>Any URL Works</h3>
                            <p>Type any URL and watch the AI imagine what that page would look like.</p>
                        </div>
                    </div>
                    <div class="feature">
                        <span class="feature-icon">🔗</span>
                        <div class="feature-text">
                            <h3>Working Links</h3>
                            <p>Click links within pages to explore the imaginary web further.</p>
                        </div>
                    </div>
                </div>

                <div class="suggestions">
                    <h3>Try These Sites</h3>
                    <div class="suggestion-links">
                        <a href="https://google.com">Google</a>
                        <a href="https://wikipedia.org">Wikipedia</a>
                        <a href="https://amazon.com">Amazon</a>
                        <a href="https://news.ycombinator.com">Hacker News</a>
                        <a href="https://reddit.com">Reddit</a>
                        <a href="https://github.com">GitHub</a>
                    </div>
                </div>

                <div class="warning">
                    ⚠️ No API key configured. Click the ⚙️ settings button to add your OpenRouter API key.
                </div>

                <div class="powered-by">
                    Powered by <a href="https://openrouter.ai" target="_blank">OpenRouter</a> • All data stored locally in IndexedDB
                </div>
            </div>
        </body>
        </html>`;

        this.contentFrame.srcdoc = html;

        // Inject interceptor after iframe loads
        this.contentFrame.onload = () => {
            const interceptor = this.getLinkInterceptorScript('about:home');
            try {
                this.contentFrame.contentDocument?.body?.insertAdjacentHTML('beforeend', interceptor);
            } catch (e) {
                // Cross-origin restrictions, ignore
            }
        };
    }

    showErrorPage(url, message) {
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #f5f5f5;
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .container {
                    text-align: center;
                    padding: 40px;
                }
                .error-icon {
                    font-size: 80px;
                    margin-bottom: 20px;
                }
                h1 {
                    color: #333;
                    font-size: 28px;
                    margin-bottom: 15px;
                }
                .url {
                    color: #666;
                    font-size: 14px;
                    margin-bottom: 20px;
                    word-break: break-all;
                }
                .message {
                    color: #999;
                    font-size: 14px;
                    max-width: 400px;
                    line-height: 1.6;
                    background: white;
                    padding: 20px;
                    border-radius: 10px;
                    margin: 0 auto;
                }
                .retry-btn {
                    margin-top: 30px;
                    padding: 12px 30px;
                    background: #667eea;
                    color: white;
                    border: none;
                    border-radius: 25px;
                    font-size: 14px;
                    cursor: pointer;
                }
                .retry-btn:hover {
                    background: #5a6fd6;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="error-icon">😵</div>
                <h1>Unable to Generate Page</h1>
                <p class="url">${this.escapeHtml(url)}</p>
                <p class="message">${this.escapeHtml(message)}</p>
                <button class="retry-btn" onclick="window.parent.postMessage({type:'navigate',url:'${this.escapeHtml(url)}'},'*')">
                    Try Again
                </button>
            </div>
        </body>
        </html>`;

        this.contentFrame.srcdoc = html;
    }

    // ==================== Settings ====================

    async loadSettings() {
        this.currentSettings = await aiService.getSettings();
        this.apiKeyInput.value = this.currentSettings.apiKey || '';
    }

    async openSettings() {
        this.settingsModal.classList.remove('hidden');
        this.modelSearch.value = '';

        // Populate models and select current one
        await this.populateModelSelect(this.currentSettings?.model);

        // If we have a saved model, make sure it's selected
        if (this.currentSettings?.model) {
            this.modelSelect.value = this.currentSettings.model;
        }
    }

    closeSettings() {
        this.settingsModal.classList.add('hidden');
    }

    async saveSettings() {
        this.currentSettings = {
            apiKey: this.apiKeyInput.value,
            model: this.modelSelect.value
        };

        await aiService.saveSettings(this.currentSettings);
        this.closeSettings();
        this.setStatus('Settings saved');

        // Refresh welcome page to hide warning if on home
        const tab = this.activeTab;
        if (tab && !tab.url) {
            this.showWelcomePage();
        }
    }

    async clearCache() {
        await aiService.clearAllCache();
        this.setStatus('Page cache cleared');
    }

    async populateModelSelect(preserveSelection = null) {
        const models = await modelService.fetchModels();
        const query = this.modelSearch.value;
        const filtered = modelService.filterModels(query);

        this.modelSelect.innerHTML = '';

        if (filtered.length === 0) {
            const option = document.createElement('option');
            option.textContent = query ? 'No models match your search' : 'Loading models...';
            option.disabled = true;
            this.modelSelect.appendChild(option);
            return;
        }

        for (const model of filtered) {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            if (preserveSelection && model.id === preserveSelection) {
                option.selected = true;
            }
            this.modelSelect.appendChild(option);
        }
    }

    filterModels() {
        const currentSelection = this.modelSelect.value;
        this.populateModelSelect(currentSelection);
    }

    // ==================== UI Helpers ====================

    setLoading(isLoading) {
        this.isLoading = isLoading;
        if (isLoading) {
            this.loadingBar.classList.add('loading');
            this.goBtn.disabled = true;
        } else {
            this.loadingBar.classList.remove('loading');
            this.goBtn.disabled = false;
        }
    }

    setStatus(text) {
        this.statusText.textContent = text;
    }

    updateTabInfo(tab, url, html) {
        // Try to extract title from HTML
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
            tab.title = titleMatch[1];
        } else {
            // Use domain as title
            try {
                const urlObj = new URL(url);
                tab.title = urlObj.hostname;
            } catch {
                tab.title = url;
            }
        }

        // Update favicon emoji based on domain
        tab.favicon = this.getFaviconEmoji(url);

        // Update tab UI
        this.updateTabUI(tab.id);
    }

    getFaviconEmoji(url) {
        try {
            const domain = new URL(url).hostname.toLowerCase();

            if (domain.includes('google')) return '🔍';
            if (domain.includes('amazon')) return '📦';
            if (domain.includes('facebook')) return '👤';
            if (domain.includes('twitter') || domain.includes('x.com')) return '🐦';
            if (domain.includes('youtube')) return '▶️';
            if (domain.includes('github')) return '🐙';
            if (domain.includes('reddit')) return '🤖';
            if (domain.includes('wikipedia')) return '📚';
            if (domain.includes('news') || domain.includes('cnn') || domain.includes('bbc')) return '📰';
            if (domain.includes('shop') || domain.includes('store')) return '🛒';
            if (domain.includes('mail') || domain.includes('gmail')) return '📧';
            if (domain.includes('music') || domain.includes('spotify')) return '🎵';
            if (domain.includes('game')) return '🎮';
            if (domain.includes('weather')) return '🌤️';
            if (domain.includes('stackoverflow')) return '💻';

            return '🌐';
        } catch {
            return '🌐';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize browser when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.fakeBrowser = new FakeBrowser();
});
